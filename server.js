const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e9 // 1 GB limit
});

const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir); },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const cleanName = file.originalname.replace(/\s+/g, '_');
    cb(null, uniqueSuffix + '-' + cleanName);
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 1024 * 1024 * 1024 } });

app.use(express.static("public"));
app.use(express.json());

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    type: req.file.mimetype,
    size: req.file.size
  });
});

const DATA_FILE = path.join(__dirname, "data.json");

let groups = [{ id: "global", name: "Thế giới", isGroup: true, online: true }];
let messagesByRoom = {};

// Load data
if (fs.existsSync(DATA_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    if (data.groups) groups = data.groups;
    if (data.messagesByRoom) messagesByRoom = data.messagesByRoom;
  } catch (e) { console.error("Could not load data.json", e); }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ groups, messagesByRoom }));
}

const usersBySocketId = new Map();
const users = [];

function broadcastUserList() {
  io.emit("users:update", { users, groups });
}

io.on("connection", (socket) => {
  socket.on("user:join", (displayName) => {
    const finalName = String(displayName || "").trim().slice(0, 30) || `User ${users.length + 1}`;
    const userObj = { id: socket.id, name: finalName, online: true };

    usersBySocketId.set(socket.id, userObj);
    users.push(userObj);

    socket.join("global");
    broadcastUserList();

    socket.emit("messages:history", messagesByRoom);

    const joinMsg = {
      id: `${Date.now()}-${socket.id}-join`,
      conversationId: "global",
      sender: "System",
      text: `${finalName} đã tham gia chat.`,
      time: new Date().toISOString(),
      isSystem: true
    };
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

    let safeText = "";
    let attachment = null;
    let conversationId = "global";

    if (typeof payload === 'string') {
      safeText = String(payload || "").trim();
    } else if (payload) {
      safeText = String(payload.text || "").trim();
      attachment = payload.attachment;
      conversationId = payload.conversationId || "global";
    }

    if (!safeText && !attachment) return;

    const message = {
      id: `${Date.now()}-${socket.id}`,
      conversationId,
      sender,
      text: safeText.slice(0, 1000),
      attachment,
      time: new Date().toISOString()
    };

    if (!messagesByRoom[conversationId]) messagesByRoom[conversationId] = [];
    messagesByRoom[conversationId].push(message);
    if (messagesByRoom[conversationId].length > 200) messagesByRoom[conversationId].shift();
    saveData();

    if (conversationId.startsWith("g-") || conversationId === "global") {
      io.emit("messages:new", message);
    } else {
      const messageForReceiver = { ...message, conversationId: socket.id };
      io.to(conversationId).emit("messages:new", messageForReceiver);
      socket.emit("messages:new", message);
    }
  });

  socket.on("disconnect", () => {
    const user = usersBySocketId.get(socket.id);
    usersBySocketId.delete(socket.id);

    const userIndex = users.findIndex((u) => u.id === socket.id);
    if (userIndex !== -1) {
      users.splice(userIndex, 1);
      broadcastUserList();
    }

    if (user) {
      const leaveMsg = {
        id: `${Date.now()}-${socket.id}-leave`,
        conversationId: "global",
        sender: "System",
        text: `${user.name} đã rời chat.`,
        time: new Date().toISOString(),
        isSystem: true
      };
      io.to("global").emit("messages:new", leaveMsg);
    }
  });
});

// Handle listen errors (e.g., port already in use) gracefully so the
// main Electron process doesn't crash when this child process cannot bind.
server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.warn(`Port ${PORT} already in use.`);
    console.warn(`Assuming another instance or external server is running on port ${PORT}.`);
    // Exit with success so the Electron main process can try to connect
    // to the existing server instead of failing with an uncaught exception.
    process.exit(0);
  }
  console.error("Server error:", err);
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`LAN: other devices can connect using your PC IP on port ${PORT}`);
});
