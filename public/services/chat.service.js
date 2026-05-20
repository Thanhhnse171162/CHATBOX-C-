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
          name: nameFromEmail,
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

    async loadInitialData() {
      // TODO: Replace this mock with BE API call.
      // Example:
      // const res = await fetch("/api/chat/bootstrap");
      // return res.json();
      return {
        conversations: [
          {
            id: "c1",
            name: "Alex Rivera",
            online: true,
            lastMessage: "Can you share the final Figma?"
          },
          {
            id: "c2",
            name: "Marcus Chen",
            online: false,
            lastMessage: "Thanks for the update!"
          },
          {
            id: "c3",
            name: "Sarah Wilson",
            online: true,
            lastMessage: "Are we still on for today?"
          }
        ],
        activeConversationId: "c1",
        messagesByConversation: {
          c1: [
            {
              id: "m1",
              conversationId: "c1",
              senderId: "u1",
              senderName: "Alex Rivera",
              text: "Hey! I finished the preliminary designs for the dashboard project.",
              time: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
              seen: true
            },
            {
              id: "m2",
              conversationId: "c1",
              senderId: "u-self",
              senderName: getDisplayName(),
              text: "Great, can you share the Figma link?",
              time: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
              seen: true
            },
            {
              id: "m3",
              conversationId: "c1",
              senderId: "u1",
              senderName: "Alex Rivera",
              text: "Sure. Sending it now.",
              time: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
              seen: false
            }
          ],
          c2: [],
          c3: []
        }
      };
    },

    async sendMessage(conversationId, text) {
      // TODO: Replace this mock with BE API call.
      // Example:
      // const res = await fetch("/api/chat/messages", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ text })
      // });
      // return res.json();
      return {
        id: `local-${Date.now()}`,
        conversationId,
        senderId: "u-self",
        senderName: getDisplayName(),
        text,
        time: new Date().toISOString(),
        seen: false
      };
    },

    subscribe(_handlers) {
      // TODO: Bind WebSocket events and call handlers here.
      // Return unsubscribe function.
      return function unsubscribe() {};
    }
  };

  global.ChatService = chatService;
})(window);
