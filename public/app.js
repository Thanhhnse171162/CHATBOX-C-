const chatService = window.ChatService;

const authScreenEl = document.getElementById("authScreen");
const chatAppEl = document.getElementById("chatApp");
const authFormEl = document.getElementById("authForm");
const authSubmitEl = document.getElementById("authSubmit");
const authNameEl = document.getElementById("authName");
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
const btnToggleSidebar = document.getElementById("btnToggleSidebar");
const btnSearchConv = document.getElementById("btnSearchConv");
const rightSidebar = document.getElementById("rightSidebar");
const rsInfoView = document.getElementById("rsInfoView");
const rsSearchView = document.getElementById("rsSearchView");
const btnCloseSearch = document.getElementById("btnCloseSearch");
const convSearchInput = document.getElementById("convSearchInput");
const convSearchStatus = document.getElementById("convSearchStatus");
const convSearchResults = document.getElementById("convSearchResults");
const rsTabMedia = document.getElementById("rsTabMedia");
const rsTabFiles = document.getElementById("rsTabFiles");
const rsTabLinks = document.getElementById("rsTabLinks");
const rsMediaSection = document.getElementById("rsMediaSection");
const rsFilesSection = document.getElementById("rsFilesSection");
const rsLinksSection = document.getElementById("rsLinksSection");
const rsFilesList = document.getElementById("rsFilesList");
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
  me: null,
  conversations: [],
  activeConversationId: "global",
  messagesByConversation: {},
  typingByConversation: {},
  mutedConversations: {},
  pinnedConversations: {},
  hiddenConversations: {}
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

function addMessageNode(message, isLastMyMsg = false, convInitials = "?") {
  const isSelf = message.senderName === state.me?.name;

  // Do not show the "You joined the chat" system message
  if (message.isSystem && message.text === `${state.me?.name} đã tham gia chat.`) return;

  const box = document.createElement("article");
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
    if (isSelf) {
      innerHTML += `<div class="msg-time">${timeStr}</div>`;
      if (isLastMyMsg) {
        innerHTML += `
          <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
            <div style="width: 14px; height: 14px; border-radius: 50%; background: var(--primary); color: white; display: grid; place-items: center; font-size: 8px; font-weight: bold; overflow: hidden; white-space: nowrap;">
              ${convInitials}
            </div>
          </div>
        `;
      }
    } else {
      innerHTML += `<div class="msg-time">${timeStr}</div>`;
    }
  }

  innerHTML += `</div>`;
  box.innerHTML = innerHTML;

  messagesEl.appendChild(box);
}

function updateUnreadBadge() {
  const badge = document.getElementById("unreadBadge");
  if (!badge) return;
  let count = 0;
  Object.values(state.messagesByConversation).forEach(msgs => {
    msgs.forEach(m => {
      if (!m.seen && !m.isSystem && m.senderName !== state.me?.name) {
        count++;
      }
    });
  });
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function renderMessages() {
  const messageList = getActiveMessages();
  
  // Mark all incoming as seen
  messageList.forEach(m => {
    if (m.senderName !== state.me?.name) m.seen = true;
  });
  updateUnreadBadge();

  let lastMyMsgId = null;
  for (let i = messageList.length - 1; i >= 0; i--) {
    if (messageList[i].senderName === state.me?.name) {
      lastMyMsgId = messageList[i].id;
      break;
    }
  }

  const activeConv = getActiveConversation();
  const convInitials = activeConv ? (activeConv.name || '?').substring(0, 2).toUpperCase() : '?';

  const shouldStickBottom = isNearBottom();

  messagesEl.innerHTML = "";
  messageList.forEach(m => addMessageNode(m, m.id === lastMyMsgId, convInitials));
  
  emptyStateEl.classList.toggle("hidden", messageList.length > 0);
  if (shouldStickBottom) {
    scrollMessagesToBottom();
  }
  updateScrollToBottomButton();

  // Update right sidebar if visible
  if (rightSidebar && !rightSidebar.classList.contains("hidden")) {
    renderFiles();
    renderLinks();
  }
}

function renderTypingStatus() {
  const typingText = state.typingByConversation[state.activeConversationId] || "";
  typingStatusEl.textContent = typingText;
}

function renderHeader() {
  const activeConv = getActiveConversation();
  if (activeConv) {
    messageInputEl.disabled = false;
    sendButtonEl.disabled = false;
    if (btnMute) btnMute.style.display = "block";
    if (btnToggleSidebar) btnToggleSidebar.style.display = "block";
    if (btnSearchConv) btnSearchConv.style.display = "block";
  } else {
    messageInputEl.disabled = true;
    sendButtonEl.disabled = true;
    if (btnMute) btnMute.style.display = "none";
    if (btnToggleSidebar) btnToggleSidebar.style.display = "none";
    if (btnSearchConv) btnSearchConv.style.display = "none";
  }

  if (btnMute && activeConv) {
    const isMuted = state.mutedConversations[state.activeConversationId];
    btnMute.innerHTML = isMuted ? '<i class="ph ph-bell-slash"></i>' : '<i class="ph ph-bell"></i>';
    btnMute.style.color = isMuted ? "var(--muted)" : "var(--primary)";
  }
}

function renderConversations(keyword = "") {
  const lower = keyword.toLowerCase();
  let filtered = state.conversations.filter((item) =>
    item.name.toLowerCase().includes(lower) && !state.hiddenConversations[item.id]
  );

  filtered.sort((a, b) => {
    const aPinned = state.pinnedConversations[a.id] ? 1 : 0;
    const bPinned = state.pinnedConversations[b.id] ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return 0;
  });

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
          <div style="display: flex; gap: 4px; align-items: center;">
            ${state.pinnedConversations[conversation.id] ? '<i class="ph-fill ph-push-pin" style="color: var(--muted); font-size: 14px;"></i>' : ''}
            ${state.mutedConversations[conversation.id] ? '<i class="ph-fill ph-bell-slash" style="color: var(--muted); font-size: 14px;"></i>' : ''}
            <span class="conv-time" style="margin-left: 4px;">${conversation.time || 'Now'}</span>
          </div>
        </div>
        <div class="conv-preview">${conversation.lastMessage || 'Connected'}</div>
      </div>
    `;
    item.addEventListener("click", () => {
      state.activeConversationId = conversation.id;
      renderAll();
    });

    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      ctxConvId = conversation.id;
      
      const ctx = document.getElementById("contextMenu");
      ctx.classList.remove("hidden");
      
      let x = e.clientX;
      let y = e.clientY;
      if (x + 180 > window.innerWidth) x -= 180;
      if (y + 240 > window.innerHeight) y -= 240;
      
      ctx.style.left = `${x}px`;
      ctx.style.top = `${y}px`;
      
      const isMuted = state.mutedConversations[ctxConvId];
      document.getElementById("ctxMute").innerHTML = isMuted ? 'Bật thông báo <i class="ph-fill ph-bell" style="float: right;"></i>' : 'Tắt thông báo <i class="ph-fill ph-bell-slash" style="float: right;"></i>';
      
      const isPinned = state.pinnedConversations[ctxConvId];
      document.getElementById("ctxPin").innerHTML = isPinned ? 'Bỏ ghim <i class="ph-fill ph-push-pin-slash" style="float: right;"></i>' : 'Ghim <i class="ph-fill ph-push-pin" style="float: right;"></i>';
    });

    usersListEl.appendChild(item);
  });
}

let ctxConvId = null;

document.addEventListener("click", () => {
  const ctx = document.getElementById("contextMenu");
  if (ctx && !ctx.classList.contains("hidden")) {
    ctx.classList.add("hidden");
  }
});

const ctxMarkRead = document.getElementById("ctxMarkRead");
const ctxPin = document.getElementById("ctxPin");
const ctxMute = document.getElementById("ctxMute");
const ctxArchive = document.getElementById("ctxArchive");
const ctxDelete = document.getElementById("ctxDelete");
const ctxBlock = document.getElementById("ctxBlock");

if (ctxMarkRead) {
  ctxMarkRead.addEventListener("click", () => {
    if (ctxConvId && state.messagesByConversation[ctxConvId]) {
      state.messagesByConversation[ctxConvId].forEach(m => m.seen = true);
      updateUnreadBadge();
      showToast("Đã đánh dấu là đã đọc", "info");
    }
  });
}

if (ctxPin) {
  ctxPin.addEventListener("click", () => {
    if (ctxConvId) {
      state.pinnedConversations[ctxConvId] = !state.pinnedConversations[ctxConvId];
      renderConversations(searchInputEl.value);
    }
  });
}

if (ctxMute) {
  ctxMute.addEventListener("click", () => {
    if (ctxConvId) {
      state.mutedConversations[ctxConvId] = !state.mutedConversations[ctxConvId];
      renderConversations(searchInputEl.value);
    }
  });
}

if (ctxArchive) {
  ctxArchive.addEventListener("click", () => {
    if (ctxConvId) {
      state.hiddenConversations[ctxConvId] = true;
      if (state.activeConversationId === ctxConvId) {
        state.activeConversationId = null;
      }
      renderAll();
      showToast("Đã lưu trữ cuộc trò chuyện", "info");
    }
  });
}

if (ctxDelete) {
  ctxDelete.addEventListener("click", () => {
    if (ctxConvId) {
      state.hiddenConversations[ctxConvId] = true;
      state.messagesByConversation[ctxConvId] = [];
      if (state.activeConversationId === ctxConvId) {
        state.activeConversationId = null;
      }
      renderAll();
      showToast("Đã xóa cuộc trò chuyện", "info");
    }
  });
}

if (ctxBlock) {
  ctxBlock.addEventListener("click", () => {
    if (ctxConvId) {
      state.hiddenConversations[ctxConvId] = true;
      if (state.activeConversationId === ctxConvId) {
        state.activeConversationId = null;
      }
      renderAll();
      showToast("Đã chặn người dùng", "error");
    }
  });
}

function renderAll() {
  renderConversations(searchInputEl.value);
  renderHeader();
  renderMessages();
  renderTypingStatus();
}

searchInputEl.addEventListener("input", (event) => {
  renderConversations(event.target.value);
});

authFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  let name = authNameEl.value.trim();
  if (!name) {
    name = "Anonymous";
  }

  try {
    setLoading(true);
    
    // We just set the global name so chatService can pick it up when connecting
    window.__CHAT_DISPLAY_NAME__ = name;
    state.me = { id: "u-self", name: name, email: "" };
    currentUserEl.textContent = name;

    const initialData = await chatService.loadInitialData();
    state.activeConversationId = initialData.activeConversationId;
    state.messagesByConversation = initialData.messagesByConversation;
    state.typingByConversation = {};

    authScreenEl.classList.add("hidden");
    chatAppEl.classList.remove("hidden");

    initRealtimeSubscriptions();

    renderAll();
    showToast("Signed in successfully.");
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

if (btnToggleSidebar) {
  btnToggleSidebar.addEventListener("click", () => {
    rightSidebar.classList.toggle("hidden");
    if (!rightSidebar.classList.contains("hidden")) {
      renderFiles();
      renderLinks();
    }
  });
}

if (btnSearchConv) {
  btnSearchConv.addEventListener("click", () => {
    rightSidebar.classList.remove("hidden");
    rsInfoView.classList.add("hidden");
    rsSearchView.classList.remove("hidden");
    convSearchInput.value = "";
    convSearchResults.innerHTML = "";
    convSearchStatus.textContent = "";
    convSearchInput.focus();
  });
}

if (btnCloseSearch) {
  btnCloseSearch.addEventListener("click", () => {
    rsSearchView.classList.add("hidden");
    rsInfoView.classList.remove("hidden");
  });
}

if (convSearchInput) {
  let searchTimeout = null;
  convSearchInput.addEventListener("input", (e) => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      performConvSearch(e.target.value);
    }, 300);
  });
}

function performConvSearch(keyword) {
  const k = keyword.trim().toLowerCase();
  if (!k) {
    convSearchResults.innerHTML = "";
    convSearchStatus.textContent = "";
    return;
  }
  
  const msgs = getActiveMessages();
  const results = msgs.filter(m => m.text && m.text.toLowerCase().includes(k) && !m.isSystem);
  
  if (results.length === 0) {
    convSearchStatus.textContent = "Không tìm thấy kết quả nào";
    convSearchResults.innerHTML = "";
    return;
  }
  
  convSearchStatus.textContent = `${results.length} kết quả`;
  
  let html = "";
  for (let i = results.length - 1; i >= 0; i--) {
    const msg = results[i];
    const sender = msg.senderName === state.me?.name ? "Bạn" : (msg.senderName || "Unknown");
    const initials = sender.substring(0, 2).toUpperCase();
    
    // Highlight the keyword
    const regex = new RegExp(`(${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const highlightedText = msg.text.replace(regex, '<strong>$1</strong>');
    
    const timeStr = formatTime(msg.time);
    
    html += `
      <div class="user-item" style="padding: 12px 20px; align-items: flex-start; gap: 12px; cursor: pointer;">
        <div class="conv-avatar-wrapper" style="width: 36px; height: 36px;">
          <div class="conv-avatar" style="font-size: 14px;">${initials}</div>
        </div>
        <div class="conv-main">
          <div class="conv-header" style="margin-bottom: 4px;">
            <span class="conv-name" style="font-size: 14px;">${sender}</span>
          </div>
          <div class="conv-preview" style="font-size: 13px; color: var(--text); white-space: normal; line-height: 1.4;">
            ${highlightedText}
          </div>
          <div class="conv-time" style="margin-top: 6px; font-size: 11px;">
            ${timeStr}
          </div>
        </div>
      </div>
    `;
  }
  convSearchResults.innerHTML = html;
}

if (rsTabMedia && rsTabFiles && rsTabLinks) {
  rsTabMedia.addEventListener("click", () => switchRsTab("media"));
  rsTabFiles.addEventListener("click", () => switchRsTab("files"));
  rsTabLinks.addEventListener("click", () => switchRsTab("links"));
}

function switchRsTab(tab) {
  rsTabMedia.classList.toggle("active", tab === "media");
  rsTabFiles.classList.toggle("active", tab === "files");
  rsTabLinks.classList.toggle("active", tab === "links");

  rsMediaSection.classList.toggle("hidden", tab !== "media");
  rsFilesSection.classList.toggle("hidden", tab !== "files");
  rsLinksSection.classList.toggle("hidden", tab !== "links");
}

function renderFiles() {
  const msgs = getActiveMessages();
  const images = msgs.filter(m => m.attachment && m.attachment.type && m.attachment.type.startsWith('image/'));
  filesGrid.innerHTML = images.map(img => `<img src="${img.attachment.url}" class="msg-image cursor-pointer" alt="Sent Image" />`).join("");

  const docs = msgs.filter(m => m.attachment && (!m.attachment.type || (!m.attachment.type.startsWith('image/') && !m.attachment.type.startsWith('audio/'))));
  let filesHtml = "";
  docs.forEach(doc => {
    const sizeInMb = (doc.attachment.size / (1024 * 1024)).toFixed(2);
    filesHtml += `
      <div class="link-item">
        <i class="ph ph-file-text"></i>
        <div class="msg-file-info">
          <a href="${doc.attachment.url}" target="_blank" class="msg-file-name" style="text-decoration:none;color:var(--text);">${doc.attachment.name}</a>
          <span class="msg-file-size">${sizeInMb} MB</span>
        </div>
      </div>`;
  });
  if (rsFilesList) rsFilesList.innerHTML = filesHtml || `<p class="empty-state">No files shared yet.</p>`;
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
        message.seen = true;
        renderMessages();
      } else if (!message.isSystem) {
        if (!state.mutedConversations[message.conversationId]) {
          showToast(`New message from ${message.senderName || 'someone'}`);
        }
        updateUnreadBadge();
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
  // Chat service loaded successfully

}