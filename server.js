const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const usersBySocketId = new Map();
const users = [];
const messages = [];

function broadcastUserList() {
  io.emit("users:update", users);
}

io.on("connection", (socket) => {
  socket.emit("messages:history", messages);

  socket.on("user:join", (displayName) => {
    const safeName = String(displayName || "").trim().slice(0, 30);
    const finalName = safeName || `User ${users.length + 1}`;

    usersBySocketId.set(socket.id, finalName);
    users.push({
      id: socket.id,
      name: finalName,
      online: true
    });

    broadcastUserList();

    socket.broadcast.emit("messages:new", {
      id: `${Date.now()}-${socket.id}-join`,
      sender: "System",
      text: `${finalName} has joined the chat.`,
      time: new Date().toISOString(),
      isSystem: true
    });
  });

  socket.on("messages:send", (text) => {
    const sender = usersBySocketId.get(socket.id);
    if (!sender) return;

    const safeText = String(text || "").trim();
    if (!safeText) return;

    const message = {
      id: `${Date.now()}-${socket.id}`,
      sender,
      text: safeText.slice(0, 1000),
      time: new Date().toISOString()
    };

    messages.push(message);
    if (messages.length > 200) {
      messages.shift();
    }

    io.emit("messages:new", message);
  });

  socket.on("disconnect", () => {
    const name = usersBySocketId.get(socket.id);
    usersBySocketId.delete(socket.id);

    const userIndex = users.findIndex((user) => user.id === socket.id);
    if (userIndex !== -1) {
      users.splice(userIndex, 1);
      broadcastUserList();
    }

    if (name) {
      socket.broadcast.emit("messages:new", {
        id: `${Date.now()}-${socket.id}-leave`,
        sender: "System",
        text: `${name} has left the chat.`,
        time: new Date().toISOString(),
        isSystem: true
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Realtime chat is running at http://localhost:${PORT}`);
});
