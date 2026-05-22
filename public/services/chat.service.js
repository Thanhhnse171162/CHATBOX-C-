(function attachChatService(global) {
  function getDisplayName() {
    return global.__CHAT_DISPLAY_NAME__ || "Anonymous";
  }

  // ✅ Phân loại file: ảnh/audio/video nhỏ → Cloudinary Direct, còn lại → server (Backblaze)
  function shouldDirectUpload(file) {
    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');
    const isVideo = file.type.startsWith('video/');
    const isSmall = file.size < 95 * 1024 * 1024; // < 95MB
    return (isImage || isAudio || isVideo) && isSmall;
  }

  // ✅ Upload thẳng lên Cloudinary từ browser (không qua server)
  async function directUploadToCloudinary(file, onProgress) {
    // Lấy signature từ server
    const sigRes = await fetch("/api/cloudinary-signature");
    const { signature, timestamp, cloudName, apiKey, folder } = await sigRes.json();

    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("signature", signature);
      formData.append("timestamp", timestamp);
      formData.append("api_key", apiKey);
      formData.append("folder", folder);

      // Tự động chọn resource_type
      let resourceType = 'auto';
      if (file.type.startsWith('image/')) resourceType = 'image';
      else if (file.type.startsWith('audio/') || file.type.startsWith('video/')) resourceType = 'video';
      formData.append("resource_type", resourceType);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`);
      xhr.timeout = 1800000;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          resolve({
            url: data.secure_url,
            name: file.name,
            type: file.type,
            size: file.size
          });
        } else {
          reject(new Error("Cloudinary direct upload failed"));
        }
      };

      xhr.onerror = () => reject(new Error("Network error"));
      xhr.ontimeout = () => reject(new Error("Upload timed out"));
      xhr.send(formData);
    });
  }

  // Upload qua server (RAR, ZIP, file lớn → Backblaze)
  async function uploadViaServer(file, onProgress) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      xhr.timeout = 7200000; // 2 tiếng cho file lớn

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error("Upload failed"));
        }
      };

      xhr.onerror = () => reject(new Error("Network error"));
      xhr.ontimeout = () => reject(new Error("Upload timed out"));
      xhr.send(formData);
    });
  }

  const chatService = {
    async signIn(payload) {
      const nameFromEmail = String(payload.email || "user").split("@")[0];
      return { token: "mock-token", user: { id: "u-self", name: payload.name || nameFromEmail, email: payload.email } };
    },

    async register(payload) {
      return { token: "mock-token", user: { id: "u-self", name: payload.name || "New User", email: payload.email } };
    },

    disconnect() {
      if (global.socket) { global.socket.disconnect(); global.socket = null; }
    },

    async loadInitialData() {
      return { conversations: [], activeConversationId: "global", messagesByConversation: { global: [] } };
    },

    async sendMessage(conversationId, text, attachment = null) {
      if (global.socket) {
        global.socket.emit("messages:send", { text, attachment, conversationId });
      }
      return null;
    },

    createGroup(name) {
      if (global.socket) global.socket.emit("groups:create", name);
    },

    // ✅ uploadFile tự động chọn đường đi nhanh nhất
    async uploadFile(file, onProgress) {
      if (shouldDirectUpload(file)) {
        // Ảnh/audio/video nhỏ → thẳng lên Cloudinary, cực nhanh!
        console.log(`[Upload] Direct → Cloudinary: ${file.name}`);
        return directUploadToCloudinary(file, onProgress);
      } else {
        // RAR/ZIP/file lớn → qua server → Backblaze
        console.log(`[Upload] Via Server → Backblaze: ${file.name}`);
        return uploadViaServer(file, onProgress);
      }
    },

    subscribe(handlers) {
      if (!global.io) { console.error("Socket.io not loaded"); return () => { }; }

      const socket = global.io();
      global.socket = socket;

      if (socket.connected) socket.emit("user:join", getDisplayName());

      socket.off("connect");
      socket.off("users:update");
      socket.off("messages:history");
      socket.off("messages:new");

      socket.on("connect", () => socket.emit("user:join", getDisplayName()));

      socket.on("users:update", (data) => handlers.onPresence(data));

      socket.on("messages:history", (roomMessages) => {
        Object.keys(roomMessages).forEach(roomId => {
          roomMessages[roomId].forEach(msg => {
            handlers.onMessage({
              id: msg.id,
              conversationId: msg.conversationId || roomId,
              senderId: msg.sender?.id || "sys",
              senderName: msg.sender?.name || msg.sender,
              text: msg.text,
              attachment: msg.attachment,
              time: msg.time,
              seen: true,
              isSystem: msg.isSystem
            });
          });
        });
      });

      socket.on("messages:new", (msg) => {
        handlers.onMessage({
          id: msg.id,
          conversationId: msg.conversationId || "global",
          senderId: msg.sender?.id || "sys",
          senderName: msg.sender?.name || msg.sender,
          text: msg.text,
          attachment: msg.attachment,
          time: msg.time,
          seen: false,
          isSystem: msg.isSystem
        });
      });

      return function unsubscribe() {
        socket.off("connect");
        socket.off("users:update");
        socket.off("messages:history");
        socket.off("messages:new");
        socket.disconnect();
        global.socket = null;
      };
    }
  };

  global.ChatService = chatService;
})(window);