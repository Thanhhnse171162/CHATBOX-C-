const chatService = window.ChatService;

const authScreenEl = document.getElementById("authScreen");
const chatAppEl = document.getElementById("chatApp");
const authFormEl = document.getElementById("authForm");
const authToggleEl = document.getElementById("authToggle");
const authTitleEl = document.getElementById("authTitle");
const authSubmitEl = document.getElementById("authSubmit");
const authNameEl = document.getElementById("authName");
const authEmailEl = document.getElementById("authEmail");
const authPasswordEl = document.getElementById("authPassword");
const currentUserEl = document.getElementById("currentUser");
const logoutButtonEl = document.getElementById("logoutButton");

const messagesEl = document.getElementById("messages");
const usersListEl = document.getElementById("usersList");
const searchInputEl = document.getElementById("searchInput");
const formEl = document.getElementById("chatForm");
const messageInputEl = document.getElementById("messageInput");
const sendButtonEl = document.getElementById("sendButton");
const chatTitleEl = document.getElementById("chatTitle");
const chatStatusEl = document.getElementById("chatStatus");
const typingStatusEl = document.getElementById("typingStatus");
const emptyStateEl = document.getElementById("emptyState");
const loadingOverlayEl = document.getElementById("loadingOverlay");
const toastEl = document.getElementById("toast");
const scrollToBottomButtonEl = document.getElementById("scrollToBottomButton");

const state = {
  isRegisterMode: false,
  me: null,
  conversations: [],
  activeConversationId: null,
  messagesByConversation: {},
  typingByConversation: {}
};

let toastTimerId = null;

function isNearBottom() {
  const threshold = 80;
  const distanceToBottom =
    messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
  return distanceToBottom <= threshold;
}

function updateScrollToBottomButton() {
  if (isNearBottom()) {
    scrollToBottomButtonEl.classList.add("hidden");
  } else {
    scrollToBottomButtonEl.classList.remove("hidden");
  }
}

function scrollMessagesToBottom(behavior = "auto") {
  messagesEl.scrollTo({
    top: messagesEl.scrollHeight,
    behavior
  });
}

function setLoading(isLoading) {
  loadingOverlayEl.classList.toggle("hidden", !isLoading);
}

function showToast(message, type = "info") {
  toastEl.textContent = message;
  toastEl.style.background = type === "error" ? "#b91c1c" : "#0f172a";
  toastEl.classList.remove("hidden");

  if (toastTimerId) {
    clearTimeout(toastTimerId);
  }
  toastTimerId = setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 2500);
}

function resetChatState() {
  state.me = null;
  state.conversations = [];
  state.activeConversationId = null;
  state.messagesByConversation = {};
  state.typingByConversation = {};
  searchInputEl.value = "";
  messageInputEl.value = "";
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getActiveConversation() {
  return state.conversations.find((item) => item.id === state.activeConversationId) || null;
}

function getActiveMessages() {
  if (!state.activeConversationId) return [];
  return state.messagesByConversation[state.activeConversationId] || [];
}

function addMessageNode(message) {
  const box = document.createElement("article");
  const isSelf = message.senderId === state.me?.id;
  box.className = `message ${isSelf ? "self" : "other"}`;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${message.senderName} • ${formatTime(message.time)}`;
  box.appendChild(meta);

  const text = document.createElement("div");
  text.className = "message-text";
  text.textContent = message.text;
  box.appendChild(text);

  if (isSelf) {
    const status = document.createElement("div");
    status.className = "message-status";
    status.textContent = message.seen ? "Seen" : "Delivered";
    box.appendChild(status);
  }

  messagesEl.appendChild(box);
}

function renderMessages() {
  const shouldStickBottom = isNearBottom();
  const messageList = getActiveMessages();
  messagesEl.innerHTML = "";
  messageList.forEach(addMessageNode);
  emptyStateEl.classList.toggle("hidden", messageList.length > 0);
  if (shouldStickBottom) {
    scrollMessagesToBottom();
  }
  updateScrollToBottomButton();
}

function renderTypingStatus() {
  const typingText = state.typingByConversation[state.activeConversationId] || "";
  typingStatusEl.textContent = typingText;
}

function renderHeader() {
  const conversation = getActiveConversation();
  if (!conversation) {
    chatTitleEl.textContent = "Select a conversation";
    chatStatusEl.textContent = "Offline";
    messageInputEl.disabled = true;
    sendButtonEl.disabled = true;
    return;
  }

  chatTitleEl.textContent = conversation.name;
  chatStatusEl.textContent = conversation.online ? "Online now" : "Offline";
  messageInputEl.disabled = false;
  sendButtonEl.disabled = false;
}

function renderConversations(keyword = "") {
  const lower = keyword.toLowerCase();
  const filtered = state.conversations.filter((item) =>
    item.name.toLowerCase().includes(lower)
  );

  usersListEl.innerHTML = "";
  filtered.forEach((conversation) => {
    const item = document.createElement("div");
    const isActive = conversation.id === state.activeConversationId;
    item.className = `user-item ${isActive ? "active" : ""}`;
    item.innerHTML = `
      <span class="dot" style="background:${conversation.online ? "#16a34a" : "#94a3b8"}"></span>
      <div class="user-main">
        <div class="user-name">${conversation.name}</div>
        <div class="user-preview">${conversation.lastMessage || "No message yet"}</div>
      </div>
    `;
    item.addEventListener("click", () => {
      state.activeConversationId = conversation.id;
      renderAll();
    });
    usersListEl.appendChild(item);
  });
}

function renderAll() {
  renderConversations(searchInputEl.value);
  renderHeader();
  renderMessages();
  renderTypingStatus();
}

function setAuthMode(isRegisterMode) {
  state.isRegisterMode = isRegisterMode;
  authTitleEl.textContent = isRegisterMode ? "Create Account" : "Sign In";
  authSubmitEl.textContent = isRegisterMode ? "Register" : "Sign In";
  authToggleEl.textContent = isRegisterMode
    ? "Already have account? Sign In"
    : "No account? Register";
  authNameEl.style.display = isRegisterMode ? "block" : "none";
  authNameEl.required = isRegisterMode;
}

searchInputEl.addEventListener("input", (event) => {
  renderConversations(event.target.value);
});

authToggleEl.addEventListener("click", () => {
  setAuthMode(!state.isRegisterMode);
});

authFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    name: authNameEl.value.trim(),
    email: authEmailEl.value.trim(),
    password: authPasswordEl.value
  };
  if (!payload.email || !payload.password || (state.isRegisterMode && !payload.name)) {
    showToast("Please fill all required fields.", "error");
    return;
  }

  try {
    setLoading(true);
    const authResult = state.isRegisterMode
      ? await chatService.register(payload)
      : await chatService.signIn(payload);

    state.me = authResult.user;
    window.__CHAT_DISPLAY_NAME__ = state.me.name;
    currentUserEl.textContent = `Signed in as ${state.me.name}`;

    const initialData = await chatService.loadInitialData();
    state.conversations = initialData.conversations;
    state.activeConversationId = initialData.activeConversationId;
    state.messagesByConversation = initialData.messagesByConversation;
    state.typingByConversation = {};

    authScreenEl.classList.add("hidden");
    chatAppEl.classList.remove("hidden");
    renderAll();
    showToast(state.isRegisterMode ? "Account created." : "Signed in.");
  } catch (_error) {
    showToast("Unable to authenticate. Try again.", "error");
  } finally {
    setLoading(false);
  }
});

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInputEl.value.trim();
  if (!text || !state.activeConversationId) return;

  try {
    const newMessage = await chatService.sendMessage(state.activeConversationId, text);
    const list = state.messagesByConversation[state.activeConversationId] || [];
    list.push(newMessage);
    state.messagesByConversation[state.activeConversationId] = list;

    state.conversations = state.conversations.map((item) =>
      item.id === state.activeConversationId ? { ...item, lastMessage: text } : item
    );

    messageInputEl.value = "";
    renderAll();
    messageInputEl.focus();
  } catch (_error) {
    showToast("Message failed to send.", "error");
  }
});

logoutButtonEl.addEventListener("click", () => {
  resetChatState();
  authScreenEl.classList.remove("hidden");
  chatAppEl.classList.add("hidden");
  currentUserEl.textContent = "";
  authPasswordEl.value = "";
  renderAll();
  showToast("Logged out.");
});

messagesEl.addEventListener("scroll", () => {
  updateScrollToBottomButton();
});

scrollToBottomButtonEl.addEventListener("click", () => {
  scrollMessagesToBottom("smooth");
});

function initRealtimeSubscriptions() {
  chatService.subscribe({
    onMessage: (message) => {
      const list = state.messagesByConversation[message.conversationId] || [];
      list.push(message);
      state.messagesByConversation[message.conversationId] = list;

      state.conversations = state.conversations.map((item) =>
        item.id === message.conversationId
          ? { ...item, lastMessage: message.text }
          : item
      );
      if (message.conversationId === state.activeConversationId) {
        renderMessages();
      }
      renderConversations(searchInputEl.value);
      renderHeader();
      renderTypingStatus();
    },
    onPresence: (conversations) => {
      state.conversations = conversations;
      renderAll();
    },
    onTyping: (payload) => {
      state.typingByConversation[payload.conversationId] = payload.text;
      renderTypingStatus();
    },
    onSeen: (payload) => {
      const list = state.messagesByConversation[payload.conversationId] || [];
      state.messagesByConversation[payload.conversationId] = list.map((item) =>
        item.id === payload.messageId ? { ...item, seen: true } : item
      );
      renderMessages();
    }
  });
}

if (!chatService) {
  alert("Chat service is not loaded. Please check script includes.");
} else {
  setAuthMode(false);
  initRealtimeSubscriptions();
}
