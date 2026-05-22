require('dotenv').config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { Readable } = require('stream');
const cloudinary = require('cloudinary').v2;
const {
  S3Client, GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const isCloudinaryReady = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

const isB2Ready = () =>
  !!(process.env.B2_ENDPOINT && process.env.B2_KEY_ID && process.env.B2_APP_KEY && process.env.B2_BUCKET_NAME);

if (isCloudinaryReady()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

const s3 = new S3Client({
  endpoint: `https://${process.env.B2_ENDPOINT}`,
  region: "us-east-005",
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APP_KEY
  }
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e9 });
const PORT = process.env.PORT || 3000;

// ✅ Dùng diskStorage để tránh load file lớn vào RAM
const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), "chatbox_uploads");
if (!fs.existsSync(UPLOAD_TEMP_DIR)) fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_TEMP_DIR),
    filename: (req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, unique + "-" + file.originalname.replace(/\s+/g, "_"));
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }
});

app.use(express.static("public"));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ✅ MỚI: Endpoint tạo Cloudinary signature — frontend upload thẳng, không qua server
app.get("/api/upload/config", (_req, res) => {
  res.json({
    cloudinaryDirect: isCloudinaryReady(),
    b2: isB2Ready(),
    local: true
  });
});

app.get("/api/cloudinary-signature", (req, res) => {
  if (!isCloudinaryReady()) {
    return res.status(503).json({
      error: "Cloudinary chua cau hinh. Kiem tra file .env hoac upload qua server (local/B2)."
    });
  }
  const timestamp = Math.round(new Date().getTime() / 1000);
  const params = {
    timestamp,
    folder: "chatbox_uploads"
  };
  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
  res.json({
    signature,
    timestamp,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    folder: "chatbox_uploads"
  });
});

// Helper phân loại file
function shouldUseCloudinary(mimetype, size) {
  const isImage = mimetype.startsWith('image/');
  const isAudio = mimetype.startsWith('audio/');
  const isVideo = mimetype.startsWith('video/');
  const isSmall = size < 95 * 1024 * 1024;
  return (isImage || isAudio || isVideo) && isSmall;
}

// Upload Cloudinary qua server (fallback cho voice recording) — stream từ disk
async function uploadToCloudinary(file) {
  let resourceType = 'auto';
  if (file.mimetype.startsWith('image/')) resourceType = 'image';
  else if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) resourceType = 'video';
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'chatbox_uploads', resource_type: resourceType, chunk_size: 100 * 1024 * 1024, timeout: 7200000 },
      (error, result) => {
        if (error) reject(error);
        else resolve({ url: result.secure_url, name: file.originalname, type: file.mimetype, size: file.size });
      }
    );
    // Stream từ file tạm trên disk thay vì buffer RAM
    fs.createReadStream(file.path).pipe(uploadStream);
  });
}

// ✅ Upload Backblaze B2 — Multipart Upload (hỗ trợ file lên đến 5GB)
const PART_SIZE = 64 * 1024 * 1024; // 64 MB mỗi part

async function uploadToBackblaze(file) {
  const key = path.posix.join('chatbox_uploads', path.basename(file.filename || file.path));
  const fileSize = file.size || fs.statSync(file.path).size;
  const contentType = file.mimetype || 'application/octet-stream';
  const bucket = process.env.B2_BUCKET_NAME;

  // Bắt đầu multipart upload
  const createRes = await s3.send(new CreateMultipartUploadCommand({
    Bucket: bucket, Key: key, ContentType: contentType
  }));
  const uploadId = createRes.UploadId;

  const parts = [];
  let partNumber = 1;
  let offset = 0;

  try {
    while (offset < fileSize) {
      const end = Math.min(offset + PART_SIZE, fileSize);
      const chunkSize = end - offset;

      // Đọc từng chunk từ disk, không load toàn bộ file vào RAM
      const chunkStream = fs.createReadStream(file.path, { start: offset, end: end - 1 });

      const partRes = await s3.send(new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: chunkStream,
        ContentLength: chunkSize
      }));

      parts.push({ ETag: partRes.ETag, PartNumber: partNumber });
      console.log(`  [B2] Part ${partNumber} (${(chunkSize / 1024 / 1024).toFixed(1)} MB) ✓`);
      offset = end;
      partNumber++;
    }

    // Hoàn tất upload
    await s3.send(new CompleteMultipartUploadCommand({
      Bucket: bucket, Key: key, UploadId: uploadId,
      MultipartUpload: { Parts: parts }
    }));
  } catch (err) {
    // Huỷ nếu lỗi giữa chừng để không tốn dung lượng B2
    await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId })).catch(() => {});
    throw err;
  }

  const signedUrl = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: bucket, Key: key
  }), { expiresIn: 604800 }); // URL hợp lệ 7 ngày

  return { url: signedUrl, name: file.originalname, type: contentType, size: fileSize };
}

const LOCAL_UPLOAD_DIR = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(LOCAL_UPLOAD_DIR)) fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });

async function uploadToLocal(file) {
  const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname.replace(/\s+/g, "_")}`;
  const dest = path.join(LOCAL_UPLOAD_DIR, safeName);
  await fs.promises.copyFile(file.path, dest);
  return {
    url: `/uploads/${safeName}`,
    name: file.originalname,
    type: file.mimetype,
    size: file.size
  };
}

// ✅ Route upload server — stream từ disk, xoá file tạm sau khi xong
app.post("/api/upload", (req, res, next) => {
  req.setTimeout(7200000);
  res.setTimeout(7200000);
  next();
}, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "File qua lon. Gioi han 5GB." });
      }
      return res.status(400).json({ error: err.message || "Upload failed" });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const tempPath = req.file.path;
  try {
    let result;
    const useCloudinary = shouldUseCloudinary(req.file.mimetype, req.file.size) && isCloudinaryReady();
    const useB2 = isB2Ready();

    if (useCloudinary) {
      console.log(`[Upload] → Cloudinary: ${req.file.originalname}`);
      result = await uploadToCloudinary(req.file);
    } else if (useB2) {
      console.log(`[Upload] → Backblaze B2: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)} MB)`);
      result = await uploadToBackblaze(req.file);
    } else {
      console.log(`[Upload] → Local disk: ${req.file.originalname} (chua cau hinh Cloud/B2)`);
      result = await uploadToLocal(req.file);
    }
    res.json(result);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed: " + error.message });
  } finally {
    // Xoá file tạm dù thành công hay thất bại
    fs.unlink(tempPath, (err) => {
      if (err) console.warn("[Cleanup] Không xoá được file tạm:", tempPath, err.message);
      else console.log("[Cleanup] Đã xoá file tạm:", tempPath);
    });
  }
});

// ─── Data persistence ─────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, "data.json");
let groups = [{ id: "global", name: "Thế giới", isGroup: true, online: true }];
let messagesByRoom = {};

if (fs.existsSync(DATA_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    if (data.groups) groups = data.groups;
    if (data.messagesByRoom) messagesByRoom = data.messagesByRoom;
  } catch (e) { console.error("Could not load data.json", e); }
}

let saveTimeout = null;
function saveData() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify({ groups, messagesByRoom }), (err) => {
      if (err) console.error("Could not save data.json", err);
    });
  }, 1000);
}
function saveDataSync() {
  try {
    if (saveTimeout) clearTimeout(saveTimeout);
    fs.writeFileSync(DATA_FILE, JSON.stringify({ groups, messagesByRoom }));
  } catch (err) { console.error("Could not save data sync", err); }
}
process.on('SIGINT', () => { saveDataSync(); process.exit(); });
process.on('SIGTERM', () => { saveDataSync(); process.exit(); });

// ─── Socket.io ────────────────────────────────────────────────────────
const usersBySocketId = new Map();
const users = [];

function broadcastUserList() { io.emit("users:update", { users, groups }); }

io.on("connection", (socket) => {
  socket.on("user:join", (displayName) => {
    const finalName = String(displayName || "").trim().slice(0, 30) || `User ${users.length + 1}`;
    const userObj = { id: socket.id, name: finalName, online: true };
    usersBySocketId.set(socket.id, userObj);
    users.push(userObj);
    socket.join("global");
    broadcastUserList();
    socket.emit("messages:history", messagesByRoom);
    const joinMsg = { id: `${Date.now()}-${socket.id}-join`, conversationId: "global", sender: "System", text: `${finalName} đã tham gia chat.`, time: new Date().toISOString(), isSystem: true };
    io.to("global").emit("messages:new", joinMsg);
  });

  socket.on("groups:create", (name) => {
    const groupName = String(name || "").trim().slice(0, 30);
    if (!groupName) return;
    const newGroup = { id: `g-${Date.now()}`, name: groupName, isGroup: true, online: true };
    groups.push(newGroup);
    saveData();
    broadcastUserList();
  });

  socket.on("messages:send", (payload) => {
    const sender = usersBySocketId.get(socket.id);
    if (!sender) return;
    let safeText = "", attachment = null, conversationId = "global";
    if (typeof payload === 'string') {
      safeText = String(payload || "").trim();
    } else if (payload) {
      safeText = String(payload.text || "").trim();
      attachment = payload.attachment;
      conversationId = payload.conversationId || "global";
    }
    if (!safeText && !attachment) return;
    const message = { id: `${Date.now()}-${socket.id}`, conversationId, sender, text: safeText.slice(0, 1000), attachment, time: new Date().toISOString() };
    if (!messagesByRoom[conversationId]) messagesByRoom[conversationId] = [];
    messagesByRoom[conversationId].push(message);
    if (messagesByRoom[conversationId].length > 200) messagesByRoom[conversationId].shift();
    saveData();
    if (conversationId.startsWith("g-") || conversationId === "global") {
      io.emit("messages:new", message);
    } else {
      io.to(conversationId).emit("messages:new", { ...message, conversationId: socket.id });
      socket.emit("messages:new", message);
    }
  });

  socket.on("disconnect", () => {
    const user = usersBySocketId.get(socket.id);
    usersBySocketId.delete(socket.id);
    const userIndex = users.findIndex((u) => u.id === socket.id);
    if (userIndex !== -1) { users.splice(userIndex, 1); broadcastUserList(); }
    if (user) {
      const leaveMsg = { id: `${Date.now()}-${socket.id}-leave`, conversationId: "global", sender: "System", text: `${user.name} đã rời chat.`, time: new Date().toISOString(), isSystem: true };
      io.to("global").emit("messages:new", leaveMsg);
    }
  });
});

server.on("error", (err) => {
  if (err?.code === "EADDRINUSE") { console.warn(`Port ${PORT} already in use.`); process.exit(0); }
  console.error("Server error:", err); process.exit(1);
});
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Upload: Cloudinary=${isCloudinaryReady() ? "ON" : "OFF"}, B2=${isB2Ready() ? "ON" : "OFF"}, Local=ON`);
});
server.setTimeout(7200000);
server.keepAliveTimeout = 7200000;
server.headersTimeout = 7200000;