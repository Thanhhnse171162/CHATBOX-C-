# Chat Group — Desktop App

## Chat với người khác (cùng thấy tin nhắn)

Cần **1 máy làm HOST** (chạy server), các máy khác **kết nối vào HOST**.

### Bước 1 — Máy HOST (người tạo phòng)

```bash
npm start
```

Lấy IP máy (PowerShell):

```powershell
ipconfig
```

Tìm dòng **IPv4** (ví dụ `192.168.1.25`).

### Bước 2 — Máy người kia (CLIENT)

Cùng WiFi/LAN với HOST, chạy:

```powershell
$env:CHAT_SERVER_URL="http://192.168.1.25:3000"
npm start
```

(Thay `192.168.1.25` bằng IP của máy HOST.)

### Bước 3 — Nhắn tin

- Cả hai đăng nhập **tên khác nhau**
- Vào nhóm **"Thế giới"** (global) hoặc cùng một nhóm đã tạo
- Gửi tin → bên kia thấy ngay (Socket.IO realtime)

### Test nhanh trên 1 máy

Mở **2 cửa sổ**: một lần `npm start`, một lần set `CHAT_SERVER_URL` như trên (vẫn trỏ `http://127.0.0.1:3000`).

## Chạy app (một mình)

```bash
npm install
npm start
```

## Lưu ý

- Mỗi máy chạy `npm start` **không set** `CHAT_SERVER_URL` = mỗi người một server riêng → **không thấy nhau**.
- Windows Firewall có thể chặn port 3000 — cho phép Node.js khi được hỏi.
