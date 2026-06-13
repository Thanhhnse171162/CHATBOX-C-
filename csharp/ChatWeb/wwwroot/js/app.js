// ═══════ Zalo-style SignalR Chat Client ═══════
(function () {
    'use strict';

    // ── State ──
    let connection = null;
    let currentUser = { id: null, displayName: '' };
    let currentRoomId = null;
    let isRegisterMode = false;
    let pendingFile = null;
    let typingTimeout = null;
    let serverBase = '';
    let lastRenderedSenderId = null;
    let roomPhotos = [];
    let roomFiles = [];
    let roomLinks = [];

    // ── DOM refs ──
    const $ = (s) => document.querySelector(s);
    const loginScreen = $('#login-screen');
    const chatScreen = $('#chat-screen');
    const loginForm = $('#login-form');
    const loginServerHost = $('#login-server-host');
    const loginUsername = $('#login-username');
    const loginPassword = $('#login-password');
    const loginDisplayName = $('#login-displayname');
    const displayNameGroup = $('#display-name-group');
    const btnLogin = $('#btn-login');
    const btnLoginText = $('#btn-login-text');
    const btnToggle = $('#btn-toggle-register');
    const toggleText = $('#toggle-text');
    const loginError = $('#login-error');
    const pwToggle = $('#pw-toggle');

    const userDisplayName = $('#user-display-name');
    const userAvatar = $('#user-avatar');
    const roomList = $('#room-list');
    const userList = $('#user-list');
    const onlineCount = $('#online-count');
    const searchRooms = $('#search-rooms');
    const emptyState = $('#empty-state');

    const chatHeader = $('#chat-header');
    const chatMessages = $('#chat-messages');
    const chatInputArea = $('#chat-input-area');
    const chatRoomName = $('#chat-room-name');
    const messagesContainer = $('#messages-container');
    const messageInput = $('#message-input');
    const btnSend = $('#btn-send');
    const btnCreateRoom = $('#btn-create-room');

    const modalOverlay = $('#modal-overlay');
    const newRoomName = $('#new-room-name');
    const btnConfirmCreate = $('#btn-confirm-create');
    const btnCancelCreate = $('#btn-cancel-create');
    const btnCloseModal = $('#btn-close-modal');

    const fileInput = $('#file-input');
    const imageInput = $('#image-input');
    const filePreview = $('#file-preview');
    const previewImage = $('#preview-image');
    const previewFilename = $('#preview-filename');
    const fpFileIcon = $('#fp-file-icon');
    const btnCancelFile = $('#btn-cancel-file');

    const typingIndicator = $('#typing-indicator');
    const typingText = $('#typing-text');
    const peerOnline = $('#peer-online');

    const btnLogout = $('#btn-logout');
    const btnVoiceCall = $('#btn-voice-call');
    const btnVideoCall = $('#btn-video-call');
    const btnBackSidebar = $('#btn-back-sidebar');
    const sidebar = $('#sidebar');
    const toastContainer = $('#toast-container');

    // Avatar color palette
    const avatarColors = ['#0068FF', '#06c755', '#ffc300', '#e94560', '#a695c7', '#13cf13', '#ff7e29', '#d696bb', '#44bec7'];
    function getAvatarColor(name) {
        let hash = 0;
        for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return avatarColors[Math.abs(hash) % avatarColors.length];
    }
    function getInitial(name) {
        return (name || '?').charAt(0).toUpperCase();
    }

    // Toggle Password Visibility
    if (pwToggle) {
        pwToggle.addEventListener('click', () => {
            if (loginPassword.type === 'password') {
                loginPassword.type = 'text';
                pwToggle.style.color = 'var(--blue)';
            } else {
                loginPassword.type = 'password';
                pwToggle.style.color = 'var(--text3)';
            }
        });
    }

    // Toggle Send Button Mode (Like vs Send)
    function updateSendButtonMode() {
        if (!messageInput || !btnSend) return;
        const text = messageInput.value.trim();
        if (text.length > 0 || pendingFile) {
            btnSend.classList.remove('like-mode');
        } else {
            btnSend.classList.add('like-mode');
        }
    }

    // ── Init SignalR ──
    function initSignalR(serverHost) {
        if (!serverHost) serverHost = '26.53.186.37:5000';
        let protocol = window.location.protocol;

        // Fix for file:// protocol
        if (protocol === 'file:') protocol = 'http:';

        if (serverHost.startsWith('http://')) { protocol = 'http:'; serverHost = serverHost.substring(7); }
        else if (serverHost.startsWith('https://')) { protocol = 'https:'; serverHost = serverHost.substring(8); }

        if (serverHost.endsWith('/')) serverHost = serverHost.slice(0, -1);

        serverBase = `${protocol}//${serverHost}`;

        connection = new signalR.HubConnectionBuilder()
            .withUrl(serverBase + '/chatHub')
            .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        // ── Hub events ──
        connection.on('LoginOk', (data) => {
            currentUser.id = data.userId;
            currentUser.displayName = data.displayName;
            if (userDisplayName) userDisplayName.textContent = data.displayName;
            if (userAvatar) {
                userAvatar.textContent = getInitial(data.displayName);
                userAvatar.style.background = getAvatarColor(data.displayName);
                userAvatar.style.color = '#fff';
            }
            showScreen('chat');
            showToast(data.message === 'Registered' ? 'Đăng ký thành công!' : 'Đăng nhập thành công!', 'success');
        });

        connection.on('Error', (msg) => {
            loginError.textContent = msg;
            loginError.style.display = 'block';
            btnLogin.disabled = false;
            if (btnLoginText) btnLoginText.textContent = isRegisterMode ? 'Đăng ký ngay' : 'Đăng nhập';
        });

        connection.on('Rooms', (rooms) => renderRooms(rooms));
        connection.on('Users', (users) => renderUsers(users));

        // ── FIX 1: Gọi updateInfoSidebar() sau khi load toàn bộ history ──
        connection.on('History', (roomId, messages) => {
            messagesContainer.innerHTML = '';
            lastRenderedSenderId = null;
            let lastDate = '';
            roomPhotos = [];
            roomFiles = [];
            roomLinks = [];
            messages.forEach(m => {
                const d = new Date(m.sentAt).toLocaleDateString('vi-VN');
                if (d !== lastDate) { lastDate = d; addDateSeparator(d); }
                appendMessage(m);
            });
            updateInfoSidebar(); // ← FIX 1: render sidebar sau khi load history xong
            scrollToBottom();
        });

        connection.on('NewMessage', (msg) => {
            if (msg.roomId === currentRoomId) {
                appendMessage(msg);
                scrollToBottom();
            }
            if (msg.senderId !== currentUser.id) {
                if (typingIndicator) typingIndicator.style.display = 'none';
                if (peerOnline) peerOnline.style.display = 'flex';
            }
            updateRoomPreview(msg);
        });

        connection.on('UserTyping', (data) => {
            if (data.roomId === currentRoomId) {
                if (typingText) typingText.textContent = `${data.displayName} đang nhập...`;
                if (typingIndicator) typingIndicator.style.display = 'flex';
                if (peerOnline) peerOnline.style.display = 'none';

                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    if (typingIndicator) typingIndicator.style.display = 'none';
                    if (peerOnline) peerOnline.style.display = 'flex';
                }, 3000);
            }
        });

        connection.on('CallStarted', (data) => {
            showToast(`📞 ${data.startedBy} đã bắt đầu cuộc gọi ${data.kind}`, 'success');
        });
        connection.on('CallEnded', () => {
            showToast('📞 Cuộc gọi đã kết thúc', 'success');
        });

        connection.onreconnecting(() => showToast('Đang kết nối lại...', 'error'));
        connection.onreconnected(() => showToast('Đã kết nối lại!', 'success'));
        connection.onclose(() => showToast('Mất kết nối server!', 'error'));

        return connection.start();
    }

    // ── Screen switching ──
    function showScreen(name) {
        if (loginScreen) loginScreen.classList.remove('active');
        if (chatScreen) chatScreen.classList.remove('active');
        if (name === 'login') loginScreen.classList.add('active');
        else chatScreen.classList.add('active');
    }

    // ── Render rooms ──
    function renderRooms(rooms) {
        const filter = searchRooms ? searchRooms.value.toLowerCase() : '';
        if (!roomList) return;
        roomList.innerHTML = '';
        rooms.filter(r => r.name.toLowerCase().includes(filter)).forEach(r => {
            const div = document.createElement('div');
            div.className = 'room-item' + (r.id === currentRoomId ? ' active' : '');
            const color = getAvatarColor(r.name);
            div.innerHTML = `
                <div class="room-avatar-wrap">
                    <div class="room-ava" style="background:${color}">${getInitial(r.name)}</div>
                    <span class="room-online-dot" style="display:none"></span>
                </div>
                <div class="room-body">
                    <span class="room-name">${escHtml(r.name)}</span>
                    <span class="room-preview" id="room-preview-${r.id}"></span>
                </div>
                <div class="room-meta">
                    <span class="room-time" id="room-time-${r.id}"></span>
                </div>
            `;
            div.addEventListener('click', () => joinRoom(r.id, r.name, color));
            roomList.appendChild(div);
        });
    }

    function updateRoomPreview(msg) {
        const el = document.getElementById(`room-preview-${msg.roomId}`);
        const timeEl = document.getElementById(`room-time-${msg.roomId}`);
        if (el) {
            const prefix = msg.senderId === currentUser.id ? 'Bạn: ' : `${msg.senderName}: `;
            let text = msg.content || '';
            if (msg.type === 1) text = '📷 Đã gửi ảnh';
            else if (msg.type === 2) text = '📎 Đã gửi file';
            el.textContent = prefix + text;
        }
        if (timeEl && msg.sentAt) {
            const t = new Date(msg.sentAt + (msg.sentAt.endsWith('Z') ? '' : 'Z'));
            timeEl.textContent = t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }
    }

    // ── Render users ──
    function renderUsers(users) {
        if (!userList) return;
        userList.innerHTML = '';
        let online = 0;
        users.forEach(u => {
            if (u.online) online++;
            const div = document.createElement('div');
            div.className = 'user-item';
            const color = getAvatarColor(u.displayName);
            div.innerHTML = `
                <div class="user-mini-ava" style="background:${color}">
                    ${getInitial(u.displayName)}
                    <span class="u-dot ${u.online ? 'on' : 'off'}"></span>
                </div>
                <span class="user-item-name">${escHtml(u.displayName)}</span>
            `;
            userList.appendChild(div);
        });
        if (onlineCount) onlineCount.textContent = online;
    }

    // ── Join room ──
    async function joinRoom(roomId, roomName, color) {
        currentRoomId = roomId;
        if (chatRoomName) chatRoomName.textContent = roomName;

        // Update header avatar
        const roomAvatar = $('#room-avatar');
        if (roomAvatar) {
            roomAvatar.style.background = color || getAvatarColor(roomName);
            roomAvatar.innerHTML = `<span style="color:#fff;font-weight:700">${getInitial(roomName)}</span>`;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (chatHeader) chatHeader.style.display = 'flex';
        if (chatMessages) chatMessages.style.display = 'flex';
        if (chatInputArea) chatInputArea.style.display = 'block';
        if (messagesContainer) messagesContainer.innerHTML = '';
        lastRenderedSenderId = null;

        document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
        const items = document.querySelectorAll('.room-item');
        items.forEach(el => {
            if (el.querySelector('.room-name').textContent === roomName) el.classList.add('active');
        });

        if (window.innerWidth <= 768 && sidebar) sidebar.classList.add('hidden');
        await connection.invoke('JoinRoom', roomId);
        updateSendButtonMode();
    }

    // ── Append message ──
    function appendMessage(m) {
        // ── FIX 2: Tách biệt push data và gọi updateInfoSidebar() ──
        let infoChanged = false;
        const isImageFile = m.fileName && /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(m.fileName);

        if ((m.type === 1 || isImageFile) && m.fileUrl) {
            const fullUrl = m.fileUrl.startsWith('http') ? m.fileUrl : (serverBase + m.fileUrl);
            if (!roomPhotos.find(p => p.url === fullUrl)) {
                roomPhotos.push({ url: fullUrl });
                infoChanged = true;
            }
        } else if (m.type === 2 && m.fileUrl) {
            const fullUrl = m.fileUrl.startsWith('http') ? m.fileUrl : (serverBase + m.fileUrl);
            const isAudio = m.fileName && (
                m.fileName.endsWith('.webm') || m.fileName.endsWith('.mp3') ||
                m.fileName.endsWith('.wav') || m.fileName.endsWith('.ogg')
            );
            if (!isAudio && !isImageFile && !roomFiles.find(f => f.url === fullUrl)) {
                roomFiles.push({ url: fullUrl, name: m.fileName || 'File' });
                infoChanged = true;
            }
        }

        if (m.content) {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const matches = m.content.match(urlRegex);
            if (matches) {
                matches.forEach(url => {
                    if (!roomLinks.find(l => l.url === url)) {
                        roomLinks.push({ url });
                        infoChanged = true;
                    }
                });
            }
        }

        // Chỉ update sidebar khi tin nhắn thực sự là real-time (NewMessage),
        // không gọi ở đây khi đang load History (History event sẽ gọi 1 lần sau cùng)
        // → dùng flag để tránh gọi N lần khi load history
        if (infoChanged && m._realtimeUpdate) {
            updateInfoSidebar();
        }

        const isMine = m.senderId === currentUser.id;
        const isSystem = m.type === 4;

        if (isSystem) {
            const sysDiv = document.createElement('div');
            sysDiv.className = 'msg-system';
            sysDiv.textContent = m.content;
            messagesContainer.appendChild(sysDiv);
            lastRenderedSenderId = null;
            return;
        }

        const isSameSender = m.senderId === lastRenderedSenderId;
        lastRenderedSenderId = m.senderId;

        // Message row
        const row = document.createElement('div');
        row.className = `msg-row ${isMine ? 'mine' : 'other'} ${isSameSender ? 'cont' : ''}`;

        // Avatar (only for other's messages)
        if (!isMine) {
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'msg-avatar' + (isSameSender ? ' ghost' : '');
            avatarDiv.style.background = getAvatarColor(m.senderName);
            avatarDiv.textContent = getInitial(m.senderName);
            row.appendChild(avatarDiv);
        }

        // Content wrapper
        const contentWrap = document.createElement('div');
        contentWrap.className = 'msg-content';

        // Sender name (only for other, first in group)
        if (!isMine && !isSameSender) {
            const senderDiv = document.createElement('div');
            senderDiv.className = 'msg-sender-name';
            senderDiv.textContent = m.senderName;
            contentWrap.appendChild(senderDiv);
        }

        // Bubble content
        switch (m.type) {
            case 1: // Image
                if (m.content) {
                    const bubble = document.createElement('div');
                    bubble.className = 'msg-bubble';
                    bubble.textContent = m.content;
                    contentWrap.appendChild(bubble);
                }
                if (m.fileUrl) {
                    const fullUrl = m.fileUrl.startsWith('http') ? m.fileUrl : (serverBase + m.fileUrl);
                    const imgWrap = document.createElement('div');
                    imgWrap.className = 'msg-img-wrap';
                    const img = document.createElement('img');
                    img.src = fullUrl;
                    img.alt = 'image';
                    img.loading = 'lazy';
                    img.addEventListener('click', () => openLightbox(fullUrl));
                    imgWrap.appendChild(img);
                    contentWrap.appendChild(imgWrap);
                }
                break;
            case 2: // File
                if (m.content) {
                    const bubble = document.createElement('div');
                    bubble.className = 'msg-bubble';
                    bubble.textContent = m.content;
                    contentWrap.appendChild(bubble);
                }
                if (m.fileUrl) {
                    const fullUrl = m.fileUrl.startsWith('http') ? m.fileUrl : (serverBase + m.fileUrl);
                    const isAudio = m.fileName && (
                        m.fileName.endsWith('.webm') || m.fileName.endsWith('.mp3') ||
                        m.fileName.endsWith('.wav') || m.fileName.endsWith('.ogg')
                    );
                    const isImage = m.fileName && /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(m.fileName);
                    if (isAudio) {
                        const audio = document.createElement('audio');
                        audio.controls = true;
                        audio.src = fullUrl;
                        audio.style.cssText = 'max-width:250px;margin-top:4px;border-radius:8px;';
                        contentWrap.appendChild(audio);
                    } else if (isImage) {
                        const imgWrap = document.createElement('div');
                        imgWrap.className = 'msg-img-wrap';
                        const img = document.createElement('img');
                        img.src = fullUrl;
                        img.alt = m.fileName || 'image';
                        img.loading = 'lazy';
                        img.addEventListener('click', () => openLightbox(fullUrl));
                        imgWrap.appendChild(img);
                        contentWrap.appendChild(imgWrap);
                    } else {
                        const fileLink = document.createElement('a');
                        fileLink.className = 'msg-file';
                        fileLink.href = fullUrl;
                        fileLink.target = '_blank';
                        fileLink.download = true;
                        fileLink.innerHTML = `
                            <div class="file-ico">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                                    <polyline points="13 2 13 9 20 9"/>
                                </svg>
                            </div>
                            <div class="file-meta">
                                <span class="file-name">${escHtml(m.fileName || 'File')}</span>
                                <span class="file-size">Nhấn để tải về</span>
                            </div>
                        `;
                        contentWrap.appendChild(fileLink);
                    }
                }
                break;
            default: // Text
                if (m.content === '👍') {
                    const likeImg = document.createElement('img');
                    likeImg.src = 'data:image/svg+xml;utf8,<svg viewBox="0 0 24 24" fill="%230068FF" xmlns="http://www.w3.org/2000/svg"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>';
                    likeImg.style.cssText = 'width:48px;height:48px;margin-top:4px;';
                    contentWrap.appendChild(likeImg);
                } else {
                    const bubble = document.createElement('div');
                    bubble.className = 'msg-bubble';
                    bubble.textContent = m.content;
                    contentWrap.appendChild(bubble);
                }
        }

        // Time
        const t = new Date(m.sentAt + (m.sentAt.endsWith?.('Z') ? '' : 'Z'));
        const timeRow = document.createElement('div');
        timeRow.className = 'msg-time';
        timeRow.innerHTML = `
            ${t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            ${isMine ? `<span class="seen-tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>` : ''}
        `;
        contentWrap.appendChild(timeRow);

        row.appendChild(contentWrap);
        messagesContainer.appendChild(row);
    }

    function addDateSeparator(dateStr) {
        const div = document.createElement('div');
        div.className = 'date-sep';
        div.innerHTML = `<span>${dateStr}</span>`;
        messagesContainer.appendChild(div);
        lastRenderedSenderId = null;
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }

    // ── Lightbox ──
    // FIX 3: Hàm này là private trong IIFE — KHÔNG được gọi qua inline onclick string.
    // Tất cả chỗ dùng phải dùng addEventListener(() => openLightbox(url))
    function openLightbox(src) {
        const lb = document.createElement('div');
        lb.className = 'lightbox';
        lb.innerHTML = `
            <button class="lb-close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
            <img src="${src}" alt="preview">
        `;
        lb.addEventListener('click', (e) => {
            if (e.target === lb || e.target.closest('.lb-close')) lb.remove();
        });
        document.body.appendChild(lb);
    }

    // ── Send message ──
    async function sendMessage() {
        let text = messageInput.value.trim();

        // Handle "Like" mode
        if (!text && !pendingFile && btnSend.classList.contains('like-mode')) {
            text = '👍';
        }

        if (!text && !pendingFile) return;
        if (!currentRoomId) return;

        let fileId = null, fileUrl = null, fileName = null, type = 0;

        if (pendingFile) {
            const formData = new FormData();
            formData.append('file', pendingFile.file);
            try {
                const resp = await fetch(serverBase + '/api/files/upload', {
                    method: 'POST',
                    headers: { 'X-User-Id': currentUser.id },
                    body: formData
                });
                if (resp.ok) {
                    const data = await resp.json();
                    fileId = data.fileId;
                    fileUrl = data.url;
                    fileName = data.name;
                    type = pendingFile.type;
                }
            } catch (e) {
                showToast('Upload file thất bại!', 'error');
            }
            clearFilePreview();
        }

        await connection.invoke('SendMessage', currentRoomId, text, type, fileId, fileUrl, fileName);
        if (text !== '👍') {
            messageInput.value = '';
            autoResize(messageInput);
        }
        updateSendButtonMode();
    }

    // ── File handling ──
    function handleFileSelect(file, isImage) {
        if (!file) return;

        const actuallyImage = isImage || file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.name);

        if (isImage) {
            pendingFile = { file, type: 1, previewUrl: null };
            sendMessage();
            return;
        }

        if (actuallyImage) {
            const previewUrl = URL.createObjectURL(file);
            pendingFile = { file, type: 1, previewUrl };
            if (previewFilename) previewFilename.textContent = file.name;
            if (previewImage) {
                previewImage.src = previewUrl;
                previewImage.style.display = 'block';
            }
            if (fpFileIcon) fpFileIcon.style.display = 'none';
            if (filePreview) filePreview.style.display = 'flex';
        } else {
            pendingFile = { file, type: 2, previewUrl: null };
            if (previewFilename) previewFilename.textContent = file.name;
            if (previewImage) {
                previewImage.src = '';
                previewImage.style.display = 'none';
            }
            if (fpFileIcon) fpFileIcon.style.display = 'flex';
            if (filePreview) filePreview.style.display = 'flex';
        }
        updateSendButtonMode();
    }

    function clearFilePreview() {
        if (pendingFile && pendingFile.previewUrl) {
            URL.revokeObjectURL(pendingFile.previewUrl);
        }
        pendingFile = null;
        if (filePreview) filePreview.style.display = 'none';
        if (previewImage) {
            previewImage.style.display = 'none';
            previewImage.src = '';
        }
        if (fpFileIcon) fpFileIcon.style.display = 'none';
        if (previewFilename) previewFilename.textContent = '';
        if (fileInput) fileInput.value = '';
        if (imageInput) imageInput.value = '';
        updateSendButtonMode();
    }

    function autoResize(el) {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    // ── Toast ──
    function showToast(msg, type = '') {
        const div = document.createElement('div');
        div.className = 'toast ' + type;
        div.textContent = msg;
        if (toastContainer) toastContainer.appendChild(div);
        setTimeout(() => {
            div.style.opacity = '0';
            div.style.transform = 'translateX(28px)';
            div.style.transition = '0.3s ease';
            setTimeout(() => div.remove(), 300);
        }, 3500);
    }

    function escHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    // ── Event listeners ──
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (loginError) loginError.style.display = 'none';
            if (btnLogin) btnLogin.disabled = true;
            if (btnLoginText) btnLoginText.textContent = 'Đang xử lý...';
            try {
                const serverHost = loginServerHost.value.trim() || window.location.host;
                if (!connection || !serverBase.includes(serverHost) || connection.state !== 'Connected') {
                    if (connection) await connection.stop().catch(() => { });
                    await initSignalR(serverHost);
                }
                const username = loginUsername.value.trim();
                const password = loginPassword.value;
                const displayName = loginDisplayName.value.trim() || null;
                if (isRegisterMode) await connection.invoke('Register', username, password, displayName);
                else await connection.invoke('Login', username, password, null);
            } catch (err) {
                if (loginError) {
                    loginError.textContent = 'Không thể kết nối đến server!';
                    loginError.style.display = 'block';
                }
                if (btnLogin) btnLogin.disabled = false;
                if (btnLoginText) btnLoginText.textContent = isRegisterMode ? 'Đăng ký ngay' : 'Đăng nhập';
            }
        });
    }

    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            isRegisterMode = !isRegisterMode;
            if (displayNameGroup) displayNameGroup.style.display = isRegisterMode ? 'block' : 'none';
            if (btnLoginText) btnLoginText.textContent = isRegisterMode ? 'Đăng ký ngay' : 'Đăng nhập';
            if (toggleText) toggleText.textContent = isRegisterMode ? 'Đã có tài khoản?' : 'Chưa có tài khoản?';
            btnToggle.textContent = isRegisterMode ? 'Đăng nhập' : 'Đăng ký ngay';
            if (loginError) loginError.style.display = 'none';
        });
    }

    if (btnSend) btnSend.addEventListener('click', sendMessage);
    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
        messageInput.addEventListener('input', () => {
            autoResize(messageInput);
            updateSendButtonMode();
            if (connection && currentRoomId) connection.invoke('Typing', currentRoomId).catch(() => { });
        });
    }

    if (btnCreateRoom) btnCreateRoom.addEventListener('click', () => {
        if (modalOverlay) modalOverlay.style.display = 'flex';
        if (newRoomName) newRoomName.focus();
    });
    if (btnCloseModal) btnCloseModal.addEventListener('click', () => { if (modalOverlay) modalOverlay.style.display = 'none'; });
    if (btnCancelCreate) btnCancelCreate.addEventListener('click', () => { if (modalOverlay) modalOverlay.style.display = 'none'; });
    if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; });

    if (btnConfirmCreate) {
        btnConfirmCreate.addEventListener('click', async () => {
            const name = newRoomName.value.trim();
            if (!name) return;
            await connection.invoke('CreateRoom', name);
            newRoomName.value = '';
            if (modalOverlay) modalOverlay.style.display = 'none';
        });
    }

    if (newRoomName) {
        newRoomName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (btnConfirmCreate) btnConfirmCreate.click(); }
        });
    }

    if (fileInput) fileInput.addEventListener('change', () => handleFileSelect(fileInput.files[0], false));
    if (imageInput) imageInput.addEventListener('change', () => handleFileSelect(imageInput.files[0], true));
    if (btnCancelFile) btnCancelFile.addEventListener('click', clearFilePreview);

    if (searchRooms) {
        searchRooms.addEventListener('input', () => {
            if (connection && connection.state === 'Connected') connection.invoke('GetRooms').catch(() => { });
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (connection) connection.stop();
            currentUser = { id: null, displayName: '' };
            currentRoomId = null;
            showScreen('login');
            if (btnLogin) btnLogin.disabled = false;
            if (btnLoginText) btnLoginText.textContent = 'Đăng nhập';
            if (loginPassword) loginPassword.value = '';
        });
    }

    if (btnVoiceCall) btnVoiceCall.addEventListener('click', () => {
        if (currentRoomId && connection) connection.invoke('StartCall', currentRoomId, 'voice').catch(() => { });
    });
    if (btnVideoCall) btnVideoCall.addEventListener('click', () => {
        if (currentRoomId && connection) connection.invoke('StartCall', currentRoomId, 'video').catch(() => { });
    });

    if (btnBackSidebar) btnBackSidebar.addEventListener('click', () => {
        if (sidebar) sidebar.classList.remove('hidden');
    });

    // Drag & drop images
    const chatMain = $('#chat-main');
    if (chatMain) {
        chatMain.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
        chatMain.addEventListener('drop', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (!currentRoomId) return;
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                const isImg = file.type.startsWith('image/');
                handleFileSelect(file, isImg);
            }
        });
    }

    // Paste images
    if (messageInput) {
        messageInput.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    e.preventDefault();
                    const file = items[i].getAsFile();
                    if (file) handleFileSelect(file, true);
                    return;
                }
            }
        });
    }

    // ── Emoji Picker ──
    const btnEmoji = $('#btn-emoji');
    const btnSticker = $('#btn-sticker');
    const emojiPickerContainer = $('#emoji-picker-container');
    const emojiPicker = $('emoji-picker');

    if (emojiPickerContainer && emojiPicker) {
        const togglePicker = (e) => {
            e.stopPropagation();
            emojiPickerContainer.style.display = emojiPickerContainer.style.display === 'none' ? 'block' : 'none';
        };
        if (btnEmoji) btnEmoji.addEventListener('click', togglePicker);
        if (btnSticker) btnSticker.addEventListener('click', togglePicker);

        document.addEventListener('click', (e) => {
            if (!emojiPickerContainer.contains(e.target) && e.target !== btnEmoji && e.target !== btnSticker) {
                emojiPickerContainer.style.display = 'none';
            }
        });

        emojiPicker.addEventListener('emoji-click', event => {
            if (messageInput) {
                messageInput.value += event.detail.unicode;
                autoResize(messageInput);
                updateSendButtonMode();
            }
        });
    }

    // ── Voice Recording ──
    const btnRecordVoice = $('#btn-record-voice');
    const composeBox = $('#compose-box');
    const recordBox = $('#record-box');
    const btnCancelRecord = $('#btn-cancel-record');
    const btnStopRecord = $('#btn-stop-record');
    const recordTimer = $('#record-timer');
    
    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;
    let isCancelled = false;
    let recordInterval;
    let recordSeconds = 0;

    const startTimer = () => {
        recordSeconds = 0;
        if(recordTimer) recordTimer.textContent = '0:00';
        recordInterval = setInterval(() => {
            recordSeconds++;
            const m = Math.floor(recordSeconds / 60);
            const s = recordSeconds % 60;
            if(recordTimer) recordTimer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
        }, 1000);
    };

    const stopTimer = () => {
        clearInterval(recordInterval);
    };

    const resetRecordUI = () => {
        if (composeBox && recordBox) {
            composeBox.style.display = '';
            recordBox.style.display = 'none';
        }
    };

    if (btnRecordVoice) {
        btnRecordVoice.addEventListener('click', async () => {
            if (!isRecording) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];
                    isCancelled = false;

                    mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };

                    mediaRecorder.onstop = () => {
                        if (!isCancelled && audioChunks.length > 0) {
                            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                            const file = new File([audioBlob], 'voice-message.webm', { type: 'audio/webm' });
                            pendingFile = { file, type: 2, previewUrl: null };
                            sendMessage();
                        }
                    };

                    mediaRecorder.start();
                    isRecording = true;
                    
                    if (composeBox && recordBox) {
                        composeBox.style.display = 'none';
                        recordBox.style.display = 'flex';
                    }
                    startTimer();
                } catch (err) {
                    showToast('Không có quyền sử dụng Microphone', 'error');
                }
            }
        });
    }

    if (btnCancelRecord) {
        btnCancelRecord.addEventListener('click', () => {
            if (isRecording) {
                isCancelled = true;
                mediaRecorder.stop();
                isRecording = false;
                stopTimer();
                resetRecordUI();
            }
        });
    }

    if (btnStopRecord) {
        btnStopRecord.addEventListener('click', () => {
            if (isRecording) {
                mediaRecorder.stop();
                isRecording = false;
                stopTimer();
                resetRecordUI();
            }
        });
    }

    // Pre-connect
    const defaultHost = '26.53.186.37:5000';
    if (loginServerHost) loginServerHost.value = defaultHost;
    initSignalR(defaultHost).catch(() => console.warn('SignalR pre-connect failed.'));

    // ── FIX 4: Search — lọc đúng theo .room-item div (không phải li) và .user-item div ──
    const searchInput = $('#search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();

            // Lọc rooms: dùng .room-item (div), tìm theo text của .room-name span
            document.querySelectorAll('#room-list .room-item').forEach(item => {
                const nameEl = item.querySelector('.room-name');
                const name = nameEl ? nameEl.textContent.toLowerCase() : '';
                item.style.display = name.includes(query) ? '' : 'none';
            });

            // Lọc users: dùng .user-item (div), tìm theo text của .user-item-name span
            document.querySelectorAll('#user-list .user-item').forEach(item => {
                const nameEl = item.querySelector('.user-item-name');
                const name = nameEl ? nameEl.textContent.toLowerCase() : '';
                item.style.display = name.includes(query) ? '' : 'none';
            });
        });
    }

    // ── Right Sidebar Toggle ──
    const btnInfoToggle = $('#btn-info-toggle');
    const chatInfoSidebar = $('#chat-info-sidebar');
    if (btnInfoToggle && chatInfoSidebar) {
        chatInfoSidebar.classList.add('hidden');
        btnInfoToggle.addEventListener('click', () => {
            chatInfoSidebar.classList.toggle('hidden');
            // Khi mở sidebar, re-render để đảm bảo data mới nhất
            if (!chatInfoSidebar.classList.contains('hidden')) {
                updateInfoSidebar();
            }
        });
    }

    // Init state
    updateSendButtonMode();

    // ── FIX 1+2+3: updateInfoSidebar dùng đúng selector + addEventListener thay inline onclick ──
    function updateInfoSidebar() {
        // Đồng bộ với id thực tế trong HTML của bạn
        // Nếu HTML dùng id khác thì thay đổi tương ứng
        const photoContainer = document.querySelector('#info-media-grid, #info-photos');
        const fileContainer = document.querySelector('#info-file-list, #info-files');
        const linkContainer = document.querySelector('#info-link-list, #info-links');

        // ── Ảnh/Video ──
        if (photoContainer) {
            photoContainer.innerHTML = '';
            if (roomPhotos.length === 0) {
                photoContainer.innerHTML = '<p style="color:var(--text3,#9ca3af);font-size:13px;padding:8px 0;">Chưa có ảnh nào</p>';
            } else {
                roomPhotos.forEach(p => {
                    const img = document.createElement('img');
                    img.src = p.url;
                    img.loading = 'lazy';
                    img.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;cursor:pointer;';
                    // FIX 3: dùng addEventListener, không dùng inline onclick string
                    img.addEventListener('click', () => openLightbox(p.url));
                    photoContainer.appendChild(img);
                });
            }
        }

        // ── File ──
        if (fileContainer) {
            fileContainer.innerHTML = '';
            if (roomFiles.length === 0) {
                fileContainer.innerHTML = '<p style="color:var(--text3,#9ca3af);font-size:13px;padding:8px 0;">Chưa có file nào</p>';
            } else {
                roomFiles.forEach(f => {
                    const wrapper = document.createElement('li');

                    const a = document.createElement('a');
                    a.href = f.url;
                    a.target = '_blank';
                    a.download = true;
                    a.style.cssText = 'text-decoration:none;color:inherit;display:flex;align-items:center;gap:8px;padding:6px 0;';

                    a.innerHTML = `
                        <div class="file-ico">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                                <polyline points="13 2 13 9 20 9"/>
                            </svg>
                        </div>
                        <div class="file-meta" style="overflow:hidden;">
                            <span class="file-name" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">
                                ${escHtml(f.name)}
                            </span>
                            <span class="file-size" style="opacity:0.6;font-size:12px;">Nhấn để tải</span>
                        </div>
                    `;

                    wrapper.appendChild(a);
                    fileContainer.appendChild(wrapper);
                });
            }
        }

        // ── Link ──
        if (linkContainer) {
            linkContainer.innerHTML = '';
            if (roomLinks.length === 0) {
                linkContainer.innerHTML = '<p style="color:var(--text3,#9ca3af);font-size:13px;padding:8px 0;">Chưa có link nào</p>';
            } else {
                roomLinks.forEach(l => {
                    const wrapper = document.createElement('li');

                    const a = document.createElement('a');
                    a.href = l.url;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.style.cssText = 'text-decoration:none;color:inherit;display:flex;align-items:center;gap:8px;padding:6px 0;';

                    a.innerHTML = `
                        <div class="file-ico" style="background:rgba(34,197,94,0.1);color:#22c55e;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                            </svg>
                        </div>
                        <div class="file-meta" style="overflow:hidden;">
                            <span class="file-name" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">
                                ${escHtml(l.url)}
                            </span>
                        </div>
                    `;

                    wrapper.appendChild(a);
                    linkContainer.appendChild(wrapper);
                });
            }
        }
    }

    // ── Accordion headers cho info sidebar ──
    // Dùng event delegation để tránh bind trước khi DOM ready
    document.addEventListener('click', (e) => {
        const hdr = e.target.closest('.chat-info-sidebar .section-hdr');
        if (!hdr) return;

        const content = hdr.nextElementSibling;
        const svg = hdr.querySelector('svg');
        if (!content) return;

        const isHidden = content.style.display === 'none' || content.style.display === '';
        if (isHidden) {
            content.style.display = 'block';
            if (svg) { svg.style.transform = 'rotate(0deg)'; svg.style.transition = 'transform 0.2s'; }
        } else {
            content.style.display = 'none';
            if (svg) { svg.style.transform = 'rotate(-90deg)'; svg.style.transition = 'transform 0.2s'; }
        }
    });

    // ── NewMessage: đánh dấu _realtimeUpdate để appendMessage biết cần update sidebar ──
    // Override lại handler NewMessage để gắn flag
    if (connection) {
        connection.off('NewMessage');
        connection.on('NewMessage', (msg) => {
            if (msg.roomId === currentRoomId) {
                msg._realtimeUpdate = true; // flag để updateInfoSidebar chạy real-time
                appendMessage(msg);
                scrollToBottom();
            }
            if (msg.senderId !== currentUser.id) {
                if (typingIndicator) typingIndicator.style.display = 'none';
                if (peerOnline) peerOnline.style.display = 'flex';
            }
            updateRoomPreview(msg);
        });
    }

})();