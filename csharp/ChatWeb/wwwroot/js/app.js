// ═══════ SignalR Chat Client ═══════
(function () {
    'use strict';

    // ── State ──
    let connection = null;
    let currentUser = { id: null, displayName: '' };
    let currentRoomId = null;
    let isRegisterMode = false;
    let pendingFile = null; // { file, type, previewUrl }
    let typingTimeout = null;

    // ── DOM refs ──
    const $ = (s) => document.querySelector(s);
    const loginScreen = $('#login-screen');
    const chatScreen = $('#chat-screen');
    const loginForm = $('#login-form');
    const loginUsername = $('#login-username');
    const loginPassword = $('#login-password');
    const loginDisplayName = $('#login-displayname');
    const displayNameGroup = $('#display-name-group');
    const btnLogin = $('#btn-login');
    const btnToggle = $('#btn-toggle-register');
    const toggleText = $('#toggle-text');
    const loginError = $('#login-error');
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
    const btnCancelFile = $('#btn-cancel-file');
    const typingIndicator = $('#typing-indicator');
    const typingText = $('#typing-text');
    const btnLogout = $('#btn-logout');
    const btnVoiceCall = $('#btn-voice-call');
    const btnVideoCall = $('#btn-video-call');
    const btnBackSidebar = $('#btn-back-sidebar');
    const sidebar = $('#sidebar');
    const toastContainer = $('#toast-container');

    // ── Init SignalR ──
    function initSignalR() {
        connection = new signalR.HubConnectionBuilder()
            .withUrl('/chatHub')
            .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        // ── Hub events ──
        connection.on('LoginOk', (data) => {
            currentUser.id = data.userId;
            currentUser.displayName = data.displayName;
            userDisplayName.textContent = data.displayName;
            userAvatar.textContent = data.displayName.charAt(0).toUpperCase();
            showScreen('chat');
            showToast(data.message === 'Registered' ? 'Đăng ký thành công!' : 'Đăng nhập thành công!', 'success');
        });

        connection.on('Error', (msg) => {
            loginError.textContent = msg;
            loginError.style.display = 'block';
            btnLogin.disabled = false;
            btnLogin.querySelector('span').textContent = isRegisterMode ? 'Đăng ký' : 'Đăng nhập';
        });

        connection.on('Rooms', (rooms) => {
            renderRooms(rooms);
        });

        connection.on('Users', (users) => {
            renderUsers(users);
        });

        connection.on('History', (roomId, messages) => {
            messagesContainer.innerHTML = '';
            let lastDate = '';
            messages.forEach(m => {
                const d = new Date(m.sentAt).toLocaleDateString('vi-VN');
                if (d !== lastDate) {
                    lastDate = d;
                    addDateSeparator(d);
                }
                appendMessage(m);
            });
            scrollToBottom();
        });

        connection.on('NewMessage', (msg) => {
            if (msg.roomId === currentRoomId) {
                appendMessage(msg);
                scrollToBottom();
            }
            // Hide typing indicator when message arrives
            if (msg.senderId !== currentUser.id) {
                typingIndicator.style.display = 'none';
            }
        });

        connection.on('UserTyping', (data) => {
            if (data.roomId === currentRoomId) {
                typingText.textContent = `${data.displayName} đang nhập...`;
                typingIndicator.style.display = 'flex';
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    typingIndicator.style.display = 'none';
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
        loginScreen.classList.remove('active');
        chatScreen.classList.remove('active');
        if (name === 'login') loginScreen.classList.add('active');
        else chatScreen.classList.add('active');
    }

    // ── Render rooms ──
    function renderRooms(rooms) {
        const filter = searchRooms.value.toLowerCase();
        roomList.innerHTML = '';
        rooms.filter(r => r.name.toLowerCase().includes(filter)).forEach(r => {
            const div = document.createElement('div');
            div.className = 'room-item' + (r.id === currentRoomId ? ' active' : '');
            div.innerHTML = `
                <div class="room-icon">${r.name.charAt(0).toUpperCase()}</div>
                <span class="room-name">${escHtml(r.name)}</span>
            `;
            div.addEventListener('click', () => joinRoom(r.id, r.name));
            roomList.appendChild(div);
        });
    }

    // ── Render users ──
    function renderUsers(users) {
        userList.innerHTML = '';
        let online = 0;
        users.forEach(u => {
            if (u.online) online++;
            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `
                <div class="mini-avatar">${u.displayName.charAt(0).toUpperCase()}</div>
                <span class="user-item-name">${escHtml(u.displayName)}</span>
                <span class="status-dot ${u.online ? 'online' : 'offline'}"></span>
            `;
            userList.appendChild(div);
        });
        onlineCount.textContent = online;
    }

    // ── Join room ──
    async function joinRoom(roomId, roomName) {
        currentRoomId = roomId;
        chatRoomName.textContent = roomName;
        emptyState.style.display = 'none';
        chatHeader.style.display = 'flex';
        chatMessages.style.display = 'flex';
        chatInputArea.style.display = 'block';
        messagesContainer.innerHTML = '';

        // Highlight active room
        document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
        const items = document.querySelectorAll('.room-item');
        items.forEach(el => {
            if (el.querySelector('.room-name').textContent === roomName) el.classList.add('active');
        });

        // Mobile: hide sidebar
        if (window.innerWidth <= 768) sidebar.classList.add('hidden');

        await connection.invoke('JoinRoom', roomId);
    }

    // ── Append message ──
    function appendMessage(m) {
        const isMine = m.senderId === currentUser.id;
        const div = document.createElement('div');
        div.className = `msg ${isMine ? 'mine' : 'other'}` + (m.type === 4 ? ' msg-system' : '');

        let content = '';
        if (!isMine && m.type !== 4) {
            content += `<div class="msg-sender">${escHtml(m.senderName)}</div>`;
        }

        switch (m.type) {
            case 1: // Image
                content += `<div>${escHtml(m.content || '')}</div>`;
                if (m.fileUrl) content += `<img class="msg-image" src="${m.fileUrl}" alt="image" loading="lazy" onclick="window.open(this.src)">`;
                break;
            case 2: // File
                content += `<div>${escHtml(m.content || '')}</div>`;
                if (m.fileUrl) {
                    content += `<a class="msg-file" href="${m.fileUrl}" target="_blank" download>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>${escHtml(m.fileName || 'File')}</span>
                    </a>`;
                }
                break;
            case 4: // System
                content += `<div>${escHtml(m.content)}</div>`;
                break;
            default: // Text
                content += `<div>${escHtml(m.content)}</div>`;
        }

        const t = new Date(m.sentAt + (m.sentAt.endsWith('Z') ? '' : 'Z'));
        content += `<div class="msg-time">${t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>`;
        div.innerHTML = content;
        messagesContainer.appendChild(div);
    }

    function addDateSeparator(dateStr) {
        const div = document.createElement('div');
        div.className = 'date-separator';
        div.textContent = dateStr;
        messagesContainer.appendChild(div);
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }

    // ── Send message ──
    async function sendMessage() {
        const text = messageInput.value.trim();
        if (!text && !pendingFile) return;
        if (!currentRoomId) return;

        let fileId = null, fileUrl = null, fileName = null, type = 0;

        if (pendingFile) {
            // Upload file first
            const formData = new FormData();
            formData.append('file', pendingFile.file);
            try {
                const resp = await fetch('/api/files/upload', {
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
        messageInput.value = '';
        autoResize(messageInput);
    }

    // ── File handling ──
    function handleFileSelect(file, isImage) {
        if (!file) return;
        pendingFile = {
            file,
            type: isImage ? 1 : 2,
            previewUrl: isImage ? URL.createObjectURL(file) : null
        };
        previewFilename.textContent = file.name;
        if (isImage && pendingFile.previewUrl) {
            previewImage.src = pendingFile.previewUrl;
            previewImage.style.display = 'block';
        } else {
            previewImage.style.display = 'none';
        }
        filePreview.style.display = 'flex';
    }

    function clearFilePreview() {
        pendingFile = null;
        filePreview.style.display = 'none';
        previewImage.style.display = 'none';
        previewImage.src = '';
        previewFilename.textContent = '';
        fileInput.value = '';
        imageInput.value = '';
    }

    // ── Auto resize textarea ──
    function autoResize(el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    // ── Toast ──
    function showToast(msg, type = '') {
        const div = document.createElement('div');
        div.className = 'toast ' + type;
        div.textContent = msg;
        toastContainer.appendChild(div);
        setTimeout(() => {
            div.style.opacity = '0';
            div.style.transform = 'translateX(30px)';
            div.style.transition = '0.3s ease';
            setTimeout(() => div.remove(), 300);
        }, 3500);
    }

    // ── Helpers ──
    function escHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    // ── Event listeners ──
    // Login form
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.style.display = 'none';
        btnLogin.disabled = true;
        btnLogin.querySelector('span').textContent = 'Đang xử lý...';

        try {
            if (!connection || connection.state !== 'Connected') {
                await initSignalR();
            }

            const username = loginUsername.value.trim();
            const password = loginPassword.value;
            const displayName = loginDisplayName.value.trim() || null;

            if (isRegisterMode) {
                await connection.invoke('Register', username, password, displayName);
            } else {
                await connection.invoke('Login', username, password, null);
            }
        } catch (err) {
            loginError.textContent = 'Không thể kết nối đến server!';
            loginError.style.display = 'block';
            btnLogin.disabled = false;
            btnLogin.querySelector('span').textContent = isRegisterMode ? 'Đăng ký' : 'Đăng nhập';
        }
    });

    // Toggle register/login
    btnToggle.addEventListener('click', () => {
        isRegisterMode = !isRegisterMode;
        displayNameGroup.style.display = isRegisterMode ? 'block' : 'none';
        btnLogin.querySelector('span').textContent = isRegisterMode ? 'Đăng ký' : 'Đăng nhập';
        toggleText.textContent = isRegisterMode ? 'Đã có tài khoản?' : 'Chưa có tài khoản?';
        btnToggle.textContent = isRegisterMode ? 'Đăng nhập' : 'Đăng ký';
        loginError.style.display = 'none';
    });

    // Send
    btnSend.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    messageInput.addEventListener('input', () => {
        autoResize(messageInput);
        if (connection && currentRoomId) {
            connection.invoke('Typing', currentRoomId).catch(() => {});
        }
    });

    // Create room
    btnCreateRoom.addEventListener('click', () => { modalOverlay.style.display = 'flex'; newRoomName.focus(); });
    btnCloseModal.addEventListener('click', () => { modalOverlay.style.display = 'none'; });
    btnCancelCreate.addEventListener('click', () => { modalOverlay.style.display = 'none'; });
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; });
    btnConfirmCreate.addEventListener('click', async () => {
        const name = newRoomName.value.trim();
        if (!name) return;
        await connection.invoke('CreateRoom', name);
        newRoomName.value = '';
        modalOverlay.style.display = 'none';
    });
    newRoomName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); btnConfirmCreate.click(); }
    });

    // Files
    fileInput.addEventListener('change', () => handleFileSelect(fileInput.files[0], false));
    imageInput.addEventListener('change', () => handleFileSelect(imageInput.files[0], true));
    btnCancelFile.addEventListener('click', clearFilePreview);

    // Search rooms
    searchRooms.addEventListener('input', () => {
        if (connection && connection.state === 'Connected') {
            connection.invoke('GetRooms').catch(() => {});
        }
    });

    // Logout
    btnLogout.addEventListener('click', () => {
        if (connection) connection.stop();
        currentUser = { id: null, displayName: '' };
        currentRoomId = null;
        showScreen('login');
        btnLogin.disabled = false;
        btnLogin.querySelector('span').textContent = 'Đăng nhập';
        loginPassword.value = '';
    });

    // Calls
    btnVoiceCall.addEventListener('click', () => {
        if (currentRoomId && connection) {
            connection.invoke('StartCall', currentRoomId, 'voice').catch(() => {});
        }
    });
    btnVideoCall.addEventListener('click', () => {
        if (currentRoomId && connection) {
            connection.invoke('StartCall', currentRoomId, 'video').catch(() => {});
        }
    });

    // Mobile back
    btnBackSidebar.addEventListener('click', () => sidebar.classList.remove('hidden'));

    // ── Pre-connect SignalR on page load ──
    initSignalR().catch(() => {
        console.warn('SignalR pre-connect failed, will retry on login.');
    });
})();
