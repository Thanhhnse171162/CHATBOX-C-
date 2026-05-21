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

const settingsBtn = document.getElementById("settingsBtn");
const settingsWindow = document.getElementById("settingsWindow");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const settingsUsername = document.getElementById("settingsUsername");

const btnImage = document.getElementById("btnImage");
const btnAttachment = document.getElementById("btnAttachment");
const btnEmoji = document.getElementById("btnEmoji");
const imageInput = document.getElementById("imageInput");
const fileInput = document.getElementById("fileInput");
const emojiPicker = document.getElementById("emojiPicker");

const createGroupBtn = document.getElementById("createGroupBtn");
const tabChat = document.getElementById("tabChat");
const tabFiles = document.getElementById("tabFiles");
const tabLinks = document.getElementById("tabLinks");
const filesSection = document.getElementById("filesSection");
const linksSection = document.getElementById("linksSection");
const filesGrid = document.getElementById("filesGrid");
const linksList = document.getElementById("linksList");
const composerForm = document.getElementById("chatForm");

const imageViewer = document.getElementById("imageViewer");
const imageViewerImg = document.getElementById("imageViewerImg");
const closeImageViewer = document.getElementById("closeImageViewer");

const btnMute = document.getElementById("btnMute");
const btnRecord = document.getElementById("btnRecord");
const recordingUI = document.getElementById("recordingUI");
const btnCancelRecord = document.getElementById("btnCancelRecord");
const btnSendRecord = document.getElementById("btnSendRecord");
const recordingTimer = document.getElementById("recordingTimer");
const composerActions = document.getElementById("composerActions");

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordTimerInterval = null;
let recordSeconds = 0;

const state = {
  isRegisterMode: false,
  me: null,
  conversations: [],
  activeConversationId: "global",
  messagesByConversation: {},
  typingByConversation: {},
  mutedConversations: {}
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
  state.activeConversationId = "global";
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
  const isSelf = message.senderName === state.me?.name;
  box.className = `message-row ${isSelf ? "self" : "other"} ${message.isSystem ? "system" : ""}`;

  let innerHTML = '';

  if (!isSelf && !message.isSystem) {
    const initials = (message.senderName || '?').substring(0, 2).toUpperCase();
    innerHTML += `<div class="msg-avatar-wrapper"><div class="msg-avatar">${initials}</div></div>`;
  }

  innerHTML += `<div class="message-content">`;

  if (!isSelf && !message.isSystem) {
    innerHTML += `<div class="msg-author-name">${message.senderName}</div>`;
  }

  if (message.isSystem) {
    if (message.text) {
      innerHTML += `<div class="system-text">${message.text}</div>`;
    }
  } else {
    if (message.text) {
      innerHTML += `<div class="bubble ${isSelf ? 'self' : 'other'}">${message.text}</div>`;
    }
  }

  if (!message.isSystem) {
    if (message.attachment) {
      if (message.attachment.type && message.attachment.type.startsWith('image/')) {
        innerHTML += `<div class="msg-attachment"><img src="${message.attachment.url}" class="msg-image cursor-pointer" alt="Image" /></div>`;
      } else if (message.attachment.name && message.attachment.name.startsWith('Voice_')) {
        innerHTML += `<div class="msg-attachment"><audio controls src="${message.attachment.url}"></audio></div>`;
      } else {
        const sizeInMb = (message.attachment.size / (1024 * 1024)).toFixed(2);
        innerHTML += `
          <div class="msg-attachment">
            <a href="${message.attachment.url}" target="_blank" class="msg-file">
              <i class="ph ph-file-text"></i>
              <div class="msg-file-info">
                <span class="msg-file-name">${message.attachment.name}</span>
                <span class="msg-file-size">${sizeInMb} MB</span>
              </div>
            </a>
          </div>`;
      }
    }

    const timeStr = formatTime(message.time);
    let statusStr = '';
    if (isSelf) {
      statusStr = message.seen ? "Read" : "Sent";
      innerHTML += `<div class="msg-time">${timeStr} - ${statusStr}</div>`;
    } else {
      innerHTML += `<div class="msg-time">${timeStr}</div>`;
    }
  }

  innerHTML += `</div>`;
  box.innerHTML = innerHTML;

  messagesEl.appendChild(box);
}

function renderMessages() {
  const messageList = getActiveMessages();
  const isLastMessageSelf = messageList.length > 0 && messageList[messageList.length - 1].senderName === state.me?.name;
  const shouldStickBottom = isNearBottom() || isLastMessageSelf;

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
  const activeConv = getActiveConversation();
  if (activeConv) {
    chatStatusEl.textContent = `${state.conversations.length} members | Active now`;
    messageInputEl.disabled = false;
    sendButtonEl.disabled = false;
    if (btnMute) btnMute.style.display = "block";
  } else {
    chatStatusEl.textContent = "Select a conversation";
    messageInputEl.disabled = true;
    sendButtonEl.disabled = true;
    if (btnMute) btnMute.style.display = "none";
  }

  if (btnMute && activeConv) {
    const isMuted = state.mutedConversations[state.activeConversationId];
    btnMute.innerHTML = isMuted ? '<i class="ph ph-bell-slash"></i>' : '<i class="ph ph-bell"></i>';
    btnMute.style.color = isMuted ? "var(--muted)" : "var(--primary)";
  }
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
    const initials = (conversation.name || '?').substring(0, 2).toUpperCase();

    let bgColor = "var(--primary)";
    if (initials === "MI") bgColor = "#eab308";
    if (initials === "MA") bgColor = "#f97316";

    item.innerHTML = `
      <div class="conv-avatar-wrapper">
        <div class="conv-avatar" style="background: ${bgColor}">${initials}</div>
        <div class="conv-online-dot" style="background:${conversation.online ? "#16a34a" : "#94a3b8"}"></div>
      </div>
      <div class="conv-main">
        <div class="conv-header">
          <span class="conv-name">${conversation.name}</span>
          <span class="conv-time">${conversation.time || 'Now'}</span>
        </div>
        <div class="conv-preview">${conversation.lastMessage || 'Connected'}</div>
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
    currentUserEl.textContent = state.me.name;

    const initialData = await chatService.loadInitialData();
    state.activeConversationId = initialData.activeConversationId;
    state.messagesByConversation = initialData.messagesByConversation;
    state.typingByConversation = {};

    authScreenEl.classList.add("hidden");
    chatAppEl.classList.remove("hidden");

    initRealtimeSubscriptions();

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
  if (!text && (!imageInput || !imageInput.value) && (!fileInput || !fileInput.value)) return;
  if (!state.activeConversationId) return;

  try {
    await chatService.sendMessage(state.activeConversationId, text);
    messageInputEl.value = "";
    messageInputEl.focus();
  } catch (_error) {
    showToast("Message failed to send.", "error");
  }
});

logoutButtonEl.addEventListener("click", (e) => {
  e.preventDefault();
  if (chatService.disconnect) chatService.disconnect();
  resetChatState();
  authScreenEl.classList.remove("hidden");
  chatAppEl.classList.add("hidden");
  currentUserEl.textContent = "My Account";
  authPasswordEl.value = "";
  showToast("Logged out.");
});

messagesEl.addEventListener("scroll", () => {
  updateScrollToBottomButton();
});

scrollToBottomButtonEl.addEventListener("click", () => {
  scrollMessagesToBottom("smooth");
});

if (settingsBtn) {
  settingsBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (state.me) {
      settingsUsername.textContent = state.me.name;
    }
    settingsWindow.classList.remove("hidden");
  });
}

if (closeSettingsBtn) {
  closeSettingsBtn.addEventListener("click", () => {
    settingsWindow.classList.add("hidden");
  });
}

if (btnEmoji && emojiPicker) {
  btnEmoji.addEventListener("click", () => {
    emojiPicker.classList.toggle("hidden");
  });

  emojiPicker.addEventListener("click", (e) => {
    if (e.target.classList.contains("emoji-item")) {
      const emoji = e.target.textContent;
      messageInputEl.value += emoji;
      messageInputEl.focus();
      emojiPicker.classList.add("hidden");
    }
  });
}

if (btnImage && imageInput) {
  btnImage.addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", handleFileUpload);
}

if (btnAttachment && fileInput) {
  btnAttachment.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileUpload);
}

async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!state.activeConversationId) return;

  try {
    setLoading(true);
    const attachment = await chatService.uploadFile(file);
    const text = messageInputEl.value.trim();
    await chatService.sendMessage(state.activeConversationId, text, attachment);
    e.target.value = '';
    messageInputEl.value = '';
  } catch (_error) {
    showToast("File upload failed.", "error");
  } finally {
    setLoading(false);
  }
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    if (item.id !== 'logoutButton') {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
    }
  });
});

if (tabChat && tabFiles && tabLinks) {
  tabChat.addEventListener("click", () => switchTab("chat"));
  tabFiles.addEventListener("click", () => switchTab("files"));
  tabLinks.addEventListener("click", () => switchTab("links"));
}

function switchTab(tab) {
  tabChat.classList.toggle("active", tab === "chat");
  tabFiles.classList.toggle("active", tab === "files");
  tabLinks.classList.toggle("active", tab === "links");

  messagesEl.classList.toggle("hidden", tab !== "chat");
  composerForm.classList.toggle("hidden", tab !== "chat");
  filesSection.classList.toggle("hidden", tab !== "files");
  linksSection.classList.toggle("active", tab === "links");
  linksSection.classList.toggle("hidden", tab !== "links");

  if (tab === "files") renderFiles();
  if (tab === "links") renderLinks();
}

function renderFiles() {
  const msgs = getActiveMessages();
  const images = msgs.filter(m => m.attachment && m.attachment.type && m.attachment.type.startsWith('image/'));
  filesGrid.innerHTML = images.map(img => `<img src="${img.attachment.url}" class="msg-image cursor-pointer" alt="Sent Image" />`).join("");
}

function renderLinks() {
  const msgs = getActiveMessages();
  const linkRegex = /(https?:\/\/[^\s]+)/g;

  const docs = msgs.filter(m => m.attachment && (!m.attachment.type || !m.attachment.type.startsWith('image/')));
  const texts = msgs.filter(m => m.text && m.text.match(linkRegex));

  let html = "";
  docs.forEach(doc => {
    html += `<div class="link-item"><i class="ph ph-file"></i><a href="${doc.attachment.url}" target="_blank">${doc.attachment.name}</a></div>`;
  });
  texts.forEach(txt => {
    const matched = txt.text.match(linkRegex);
    matched.forEach(link => {
      html += `<div class="link-item"><i class="ph ph-link"></i><a href="${link}" target="_blank">${link}</a></div>`;
    });
  });

  linksList.innerHTML = html || `<p class="empty-state">No files or links shared yet.</p>`;
}

if (createGroupBtn) {
  createGroupBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const name = prompt("Enter group name:");
    if (name && name.trim()) {
      chatService.createGroup(name.trim());
      showToast("Group created!");
    }
  });
}

if (btnMute) {
  btnMute.addEventListener("click", () => {
    const cid = state.activeConversationId;
    state.mutedConversations[cid] = !state.mutedConversations[cid];
    renderHeader();
    showToast(state.mutedConversations[cid] ? "Chat muted" : "Chat unmuted");
  });
}

// ─── Voice Recording ────────────────────────────────────────────────
function startRecordingUI() {
  isRecording = true;
  messageInputEl.classList.add("hidden");
  composerActions.classList.add("hidden");
  sendButtonEl.classList.add("hidden");
  recordingUI.classList.remove("hidden");
  recordSeconds = 0;
  recordingTimer.textContent = "0:00";
  recordTimerInterval = setInterval(() => {
    recordSeconds++;
    const m = Math.floor(recordSeconds / 60);
    const s = (recordSeconds % 60).toString().padStart(2, "0");
    recordingTimer.textContent = `${m}:${s}`;
  }, 1000);
}

function stopRecordingUI() {
  isRecording = false;
  messageInputEl.classList.remove("hidden");
  composerActions.classList.remove("hidden");
  sendButtonEl.classList.remove("hidden");
  recordingUI.classList.add("hidden");
  clearInterval(recordTimerInterval);
}

if (btnRecord) {
  btnRecord.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.start();
      startRecordingUI();

      btnCancelRecord.onclick = () => {
        mediaRecorder.stop();
        stopRecordingUI();
        stream.getTracks().forEach(track => track.stop());
      };

      btnSendRecord.onclick = () => {
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          const file = new File([audioBlob], `Voice_${Date.now()}.webm`, { type: 'audio/webm' });
          try {
            // ✅ FIX: đổi showLoading() → setLoading(true)
            setLoading(true);
            const attachment = await chatService.uploadFile(file);
            await chatService.sendMessage(state.activeConversationId, "🎤 Voice message", attachment);
          } catch (err) {
            showToast("Failed to upload voice message", "error");
          } finally {
            // ✅ FIX: đổi hideLoading() → setLoading(false)
            setLoading(false);
            stream.getTracks().forEach(track => track.stop());
          }
        };
        mediaRecorder.stop();
        stopRecordingUI();
      };
    } catch (e) {
      showToast("Microphone access denied", "error");
    }
  });
}

// Image Viewer
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("msg-image")) {
    imageViewerImg.src = e.target.src;
    imageViewer.classList.remove("hidden");
  }
});
if (closeImageViewer) {
  closeImageViewer.addEventListener("click", () => {
    imageViewer.classList.add("hidden");
  });
}
imageViewer.addEventListener("click", (e) => {
  if (e.target === imageViewer) imageViewer.classList.add("hidden");
});

function initRealtimeSubscriptions() {
  chatService.subscribe({
    onMessage: (message) => {
      const list = state.messagesByConversation[message.conversationId] || [];
      const isDuplicate = list.some(m => m.id === message.id);
      
      if (!isDuplicate) {
        list.push(message);
        state.messagesByConversation[message.conversationId] = list;
      }

      state.conversations = state.conversations.map((item) =>
        item.id === message.conversationId
          ? { ...item, lastMessage: message.attachment ? "Sent an attachment" : message.text, time: formatTime(message.time) }
          : item
      );
      if (message.conversationId === state.activeConversationId) {
        renderMessages();
      } else if (!message.isSystem && !state.mutedConversations[message.conversationId]) {
        showToast(`New message from ${message.senderName || 'someone'}`);
      }
      renderConversations(searchInputEl.value);
      renderHeader();
      renderTypingStatus();
    },
    onPresence: (data) => {
      const { users = [], groups = [] } = data;
      const dynamicConvs = [];

      groups.forEach(g => {
        dynamicConvs.push({
          id: g.id, name: g.name, online: g.online, isGroup: true, lastMessage: "Group Chat", time: "Now"
        });
      });

      users.filter(u => u.id !== state.me?.id).forEach(u => {
        dynamicConvs.push({
          id: u.id, name: u.name, online: u.online, isGroup: false, lastMessage: "Connected", time: "Now"
        });
      });

      state.conversations = dynamicConvs;
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
}