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
const toastMessageEl = document.getElementById("toastMessage");
const toastProgressWrapEl = document.getElementById("toastProgressWrap");
const toastProgressBarEl = document.getElementById("toastProgressBar");
const toastProgressPercentEl = document.getElementById("toastProgressPercent");
const downloadPanelEl = document.getElementById("downloadPanel");
const downloadFileNameEl = document.getElementById("downloadFileName");
const downloadProgressBarEl = document.getElementById("downloadProgressBar");
const downloadStatsEl = document.getElementById("downloadStats");
const downloadCancelBtn = document.getElementById("downloadCancelBtn");
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

let activeDownloadXhr = null;
let downloadPanelHideTimerId = null;
let downloadSpeedSample = { loaded: 0, time: Date.now() };

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const decimals = unitIndex > 0 ? 2 : 0;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond || bytesPerSecond <= 0) return "0 B/s";
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatEta(seconds) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return "đang tính...";
  }
  if (seconds < 60) {
    return `${Math.ceil(seconds)} giây còn lại`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} phút còn lại`;
}

function resolveDownloadUrl(url) {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

function hideDownloadPanel(delayMs = 0) {
  if (!downloadPanelEl) return;
  if (downloadPanelHideTimerId) {
    clearTimeout(downloadPanelHideTimerId);
    downloadPanelHideTimerId = null;
  }
  const hide = () => downloadPanelEl.classList.add("hidden");
  if (delayMs > 0) {
    downloadPanelHideTimerId = setTimeout(hide, delayMs);
  } else {
    hide();
  }
}

function showDownloadPanel({ fileName, loaded = 0, total = 0, speed = 0, percent = 0, statusText }) {
  if (!downloadPanelEl) return;

  if (downloadPanelHideTimerId) {
    clearTimeout(downloadPanelHideTimerId);
    downloadPanelHideTimerId = null;
  }

  downloadPanelEl.classList.remove("hidden");
  if (downloadFileNameEl) {
    downloadFileNameEl.textContent = fileName;
  }

  const safePercent = percent != null && Number.isFinite(percent)
    ? Math.min(100, Math.max(0, percent))
    : (total > 0 ? Math.min(100, (loaded / total) * 100) : 0);

  if (downloadProgressBarEl) {
    downloadProgressBarEl.style.width = `${safePercent}%`;
  }

  if (downloadStatsEl) {
    if (statusText) {
      downloadStatsEl.textContent = statusText;
      return;
    }

    const speedText = formatSpeed(speed);
    const loadedText = formatBytes(loaded);
    const totalText = total > 0 ? formatBytes(total) : "...";
    const etaText = total > loaded && speed > 0
      ? formatEta((total - loaded) / speed)
      : "đang tính...";

    downloadStatsEl.textContent = `${speedText} — ${loadedText} / ${totalText}, ${etaText}`;
  }
}

function hideTransferProgress() {
  if (toastProgressWrapEl) {
    toastProgressWrapEl.classList.add("hidden");
  }
  if (toastProgressBarEl) {
    toastProgressBarEl.style.width = "0%";
  }
  if (toastProgressPercentEl) {
    toastProgressPercentEl.textContent = "0%";
  }
}

function showTransferProgress({ percent, label, loaded, total }) {
  if (!toastEl) return;

  toastEl.style.background = "#0f172a";
  toastEl.classList.remove("hidden");
  if (toastMessageEl) {
    toastMessageEl.textContent = label;
  }
  if (toastProgressWrapEl) {
    toastProgressWrapEl.classList.remove("hidden");
  }

  if (toastTimerId) {
    clearTimeout(toastTimerId);
    toastTimerId = null;
  }

  if (percent != null && !Number.isNaN(percent)) {
    const clamped = Math.min(100, Math.max(0, Math.round(percent)));
    if (toastProgressBarEl) toastProgressBarEl.style.width = `${clamped}%`;
    if (toastProgressPercentEl) toastProgressPercentEl.textContent = `${clamped}%`;
    return;
  }

  if (loaded != null) {
    const loadedText = formatBytes(loaded);
    const totalText = total ? formatBytes(total) : "...";
    if (toastMessageEl) {
      toastMessageEl.textContent = `${label} (${loadedText} / ${totalText})`;
    }
    if (total) {
      const ratio = Math.min(100, Math.round((loaded / total) * 100));
      if (toastProgressBarEl) toastProgressBarEl.style.width = `${ratio}%`;
      if (toastProgressPercentEl) toastProgressPercentEl.textContent = `${ratio}%`;
    } else {
      if (toastProgressBarEl) toastProgressBarEl.style.width = "35%";
      if (toastProgressPercentEl) toastProgressPercentEl.textContent = "...";
    }
  }
}

function showToast(message, type = "info") {
  hideTransferProgress();
  if (toastMessageEl) {
    toastMessageEl.textContent = message;
  }
  toastEl.style.background = type === "error" ? "#b91c1c" : "#0f172a";
  toastEl.classList.remove("hidden");

  if (toastTimerId) {
    clearTimeout(toastTimerId);
  }
  toastTimerId = setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 2500);
}

function showProgressToast(percent) {
  showTransferProgress({
    percent,
    label: "Đang upload file lớn, vui lòng chờ..."
  });
}

function fallbackDirectDownload(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
  showDownloadPanel({
    fileName,
    statusText: "Không đọc được tiến trình — trình duyệt đang tải file"
  });
  hideDownloadPanel(5000);
}

function downloadFileWithProgress(url, fileName, expectedSize = 0) {
  if (activeDownloadXhr) {
    showToast("Đang tải file khác, vui lòng chờ...");
    return;
  }

  const resolvedUrl = resolveDownloadUrl(url);
  const knownTotal = Number(expectedSize) || 0;
  downloadSpeedSample = { loaded: 0, time: Date.now() };

  showDownloadPanel({
    fileName,
    loaded: 0,
    total: knownTotal,
    speed: 0,
    percent: 0
  });

  const xhr = new XMLHttpRequest();
  activeDownloadXhr = xhr;
  xhr.open("GET", resolvedUrl, true);
  xhr.responseType = "blob";

  xhr.onprogress = (event) => {
    const now = Date.now();
    const elapsed = (now - downloadSpeedSample.time) / 1000;
    let speed = 0;

    if (elapsed >= 0.25) {
      speed = (event.loaded - downloadSpeedSample.loaded) / elapsed;
      downloadSpeedSample = { loaded: event.loaded, time: now };
    }

    const total = event.lengthComputable ? event.total : knownTotal;
    const percent = total > 0 ? (event.loaded / total) * 100 : null;

    showDownloadPanel({
      fileName,
      loaded: event.loaded,
      total,
      speed,
      percent
    });
  };

  xhr.onload = () => {
    activeDownloadXhr = null;

    if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
      const blobUrl = URL.createObjectURL(xhr.response);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);

      const total = knownTotal || xhr.response.size || 0;
      showDownloadPanel({
        fileName,
        loaded: total,
        total,
        speed: 0,
        percent: 100,
        statusText: "Tải xuống hoàn tất!"
      });
      hideDownloadPanel(4000);
      return;
    }

    showDownloadPanel({
      fileName,
      statusText: "Tải thất bại — đang mở link tải..."
    });
    fallbackDirectDownload(resolvedUrl, fileName);
  };

  xhr.onerror = () => {
    activeDownloadXhr = null;
    showDownloadPanel({
      fileName,
      statusText: "Lỗi kết nối — đang mở link tải..."
    });
    fallbackDirectDownload(resolvedUrl, fileName);
  };

  xhr.onabort = () => {
    activeDownloadXhr = null;
    showDownloadPanel({
      fileName,
      statusText: "Đã hủy tải xuống"
    });
    hideDownloadPanel(2500);
  };

  xhr.send();
}

function handleDownloadClick(event) {
  let trigger = event.target.closest("[data-download-url]");

  if (!trigger) {
    const legacyLink = event.target.closest("a.msg-file");
    if (!legacyLink || !legacyLink.href || legacyLink.href.endsWith("#")) return;

    event.preventDefault();
    event.stopPropagation();

    const legacyName = legacyLink.querySelector(".msg-file-name")?.textContent?.trim() || "download";
    downloadFileWithProgress(legacyLink.href, legacyName, 0);
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const url = trigger.dataset.downloadUrl;
  const fileName = trigger.dataset.downloadName || "download";
  const expectedSize = Number(trigger.dataset.downloadSize) || 0;
  if (!url) return;

  downloadFileWithProgress(url, fileName, expectedSize);
}

function handleDownloadKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const trigger = event.target.closest("[data-download-url]");
  if (!trigger) return;
  event.preventDefault();
  handleDownloadClick(event);
}

if (downloadCancelBtn) {
  downloadCancelBtn.addEventListener("click", () => {
    if (activeDownloadXhr) {
      activeDownloadXhr.abort();
    }
  });
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

function addMessageNode(message, isLastMyMsg = false, convInitials = "?", container = messagesEl) {
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
        const safeFileName = escapeHtml(message.attachment.name || "download");
        const safeFileUrl = escapeHtml(message.attachment.url);
        const fileSize = Number(message.attachment.size) || 0;
        innerHTML += `
          <div class="msg-attachment">
            <div class="msg-file msg-file-download" role="button" tabindex="0"
              data-download-url="${safeFileUrl}" data-download-name="${safeFileName}" data-download-size="${fileSize}">
              <i class="ph ph-file-text"></i>
              <div class="msg-file-info">
                <span class="msg-file-name">${message.attachment.name}</span>
                <span class="msg-file-size">${sizeInMb} MB</span>
              </div>
            </div>
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

  container.appendChild(box);
  return box;
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
  const fragment = document.createDocumentFragment();
  messageList.forEach(m => addMessageNode(m, m.id === lastMyMsgId, convInitials, fragment));
  messagesEl.appendChild(fragment);
  
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
  const fragment = document.createDocumentFragment();
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

    fragment.appendChild(item);
  });
  usersListEl.appendChild(fragment);
}

let ctxConvId = null;

document.addEventListener("click", handleDownloadClick, true);
document.addEventListener("keydown", handleDownloadKeydown, true);

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
    showProgressToast(0);

    const onProgress = (percent) => {
      showProgressToast(percent);
    };

    const attachment = await chatService.uploadFile(file, onProgress);
    const text = messageInputEl.value.trim();
    await chatService.sendMessage(state.activeConversationId, text, attachment);
    e.target.value = '';
    messageInputEl.value = '';
    showToast("Tải lên hoàn tất!", "success");
  } catch (error) {
    console.error("Upload error:", error);
    showToast(error.message || "File upload failed.", "error");
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
    const safeFileName = escapeHtml(doc.attachment.name || "download");
    const safeFileUrl = escapeHtml(doc.attachment.url);
    const fileSize = Number(doc.attachment.size) || 0;
    filesHtml += `
      <div class="link-item msg-file-download" role="button" tabindex="0"
        data-download-url="${safeFileUrl}" data-download-name="${safeFileName}" data-download-size="${fileSize}"
        style="cursor:pointer;">
        <i class="ph ph-file-text"></i>
        <div class="msg-file-info">
          <span class="msg-file-name" style="color:var(--text);">${doc.attachment.name}</span>
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
    const safeFileName = escapeHtml(doc.attachment.name || "download");
    const safeFileUrl = escapeHtml(doc.attachment.url);
    const fileSize = Number(doc.attachment.size) || 0;
    html += `<div class="link-item msg-file-download" role="button" tabindex="0"
      data-download-url="${safeFileUrl}" data-download-name="${safeFileName}" data-download-size="${fileSize}"
      style="cursor:pointer;"><i class="ph ph-file"></i><span>${doc.attachment.name}</span></div>`;
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
        
        // Opt: Append single message node instead of re-rendering everything
        const activeConv = getActiveConversation();
        const convInitials = activeConv ? (activeConv.name || '?').substring(0, 2).toUpperCase() : '?';
        const shouldStickBottom = isNearBottom();
        
        emptyStateEl.classList.add("hidden");
        addMessageNode(message, message.senderName === state.me?.name, convInitials);
        
        if (shouldStickBottom) scrollMessagesToBottom();
        updateScrollToBottomButton();

        // Update right sidebar if visible and has media
        if (rightSidebar && !rightSidebar.classList.contains("hidden")) {
          if (message.attachment || (message.text && message.text.match(/(https?:\/\/[^\s]+)/g))) {
            renderFiles();
            renderLinks();
          }
        }
      } else if (!message.isSystem) {
        if (!state.mutedConversations[message.conversationId]) {
          showToast(`New message from ${message.senderName || 'someone'}`);
        }
        updateUnreadBadge();
      }
      renderConversations(searchInputEl.value);
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