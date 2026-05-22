/*
  Chat service contracts for BE integration.

  =========================
  1) signIn(payload)
  =========================
  Request:
    POST /api/auth/sign-in
    body: { "email": string, "password": string }

  Response:
    {
      "token": string,
      "user": { "id": string, "name": string, "email": string }
    }

  =========================
  2) register(payload)
  =========================
  Request:
    POST /api/auth/register
    body: { "name": string, "email": string, "password": string }

  Response:
    {
      "token": string,
      "user": { "id": string, "name": string, "email": string }
    }

  =========================
  3) loadInitialData()
  =========================
  Request:
    GET /api/chat/bootstrap

  Response shape:
    {
      "conversations": Array<{
        "id": string,
        "name": string,
        "online": boolean,
        "lastMessage": string
      }>,
      "activeConversationId": string,
      "messagesByConversation": Record<string, Array<{
        "id": string,
        "conversationId": string,
        "senderId": string,
        "senderName": string,
        "text": string,
        "time": string,
        "seen": boolean
      }>>
    }

  =========================
  4) sendMessage(conversationId, text)
  =========================
  Request:
    POST /api/chat/messages
    body: { "conversationId": string, "text": string }

  Response shape:
    {
      "id": string,
      "conversationId": string,
      "senderId": string,
      "senderName": string,
      "text": string,
      "time": string,
      "seen": boolean
    }

  =========================
  5) subscribe(handlers)
  =========================
  WebSocket events:
    - message:new    => handlers.onMessage(message)
    - presence:update => handlers.onPresence(conversations)
    - typing:update  => handlers.onTyping(payload)
    - seen:update    => handlers.onSeen(payload)
*/

(function attachChatService(global) {
  function getDisplayName() {
    return global.__CHAT_DISPLAY_NAME__ || "Anonymous";
  }

  const chatService = {
    async signIn(payload) {
      const nameFromEmail = String(payload.email || "user").split("@")[0];
      return {
        token: "mock-token",
        user: {
          id: "u-self",
          name: payload.name || nameFromEmail,
          email: payload.email
        }
      };
    },

    async register(payload) {
      return {
        token: "mock-token",
        user: {
          id: "u-self",
          name: payload.name || "New User",
          email: payload.email
        }
      };
    },

    disconnect() {
      if (global.socket) {
        global.socket.disconnect();
        global.socket = null;
      }
    },

    async loadInitialData() {
      return {
        conversations: [],
        activeConversationId: "global",
        messagesByConversation: {
          global: []
        }
      };
    },

    async sendMessage(conversationId, text, attachment = null) {
      if (global.socket) {
        global.socket.emit("messages:send", { text, attachment, conversationId });
      }
      return null;
    },

    createGroup(name) {
      if (global.socket) {
        global.socket.emit("groups:create", name);
      }
    },

    async uploadFile(file) {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      return response.json();
    },

    subscribe(handlers) {
      if (!global.io) {
        console.error("Socket.io not loaded");
        return () => { };
      }

      const socket = global.io();
      global.socket = socket;

      if (socket.connected) {
        socket.emit("user:join", getDisplayName());
      }

      socket.off("connect");
      socket.off("users:update");
      socket.off("messages:history");
      socket.off("messages:new");

      socket.on("connect", () => {
        socket.emit("user:join", getDisplayName());
      });

      socket.on("users:update", (data) => {
        handlers.onPresence(data);
      });

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
