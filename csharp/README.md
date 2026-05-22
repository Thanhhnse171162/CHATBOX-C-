# chatting-group.sln

```
chatting-group.sln
├── ChatShared/
│   ├── ChatMessageDtos.cs    ← 1 class, 9 properties + computed
│   └── WireProtocol.cs       ← TCP/HTTP ports + JSON packets
├── ChatServer/
│   ├── Program.cs            ← TCP :7000 + HTTP :7001 + EF Core
│   ├── appsettings.json      ← PostgreSQL
│   └── Data/
│       ├── AppDbContext.cs   ← 7 DbSet
│       └── Models/           ← User, Room, RoomMember, Message,
│                             FileRecord, Call, CallParticipant
└── ChatClient/               ← WPF code-behind (không MVVM)
    ├── LoginWindow.xaml/.cs  ← parse host:port
    ├── MainWindow.xaml/.cs   ← TCP + HTTP upload
    ├── CallWindow.xaml/.cs
    └── Assets/Stickers/
```

## Yêu cầu

- .NET 8 SDK
- **Mặc định: SQLite** (`chatting_group.db`) — chạy được ngay, không cần cài PostgreSQL

Đổi sang PostgreSQL trong `ChatServer/appsettings.json`:

```json
"Database": { "Provider": "Postgres" }
```

và bật service PostgreSQL + `CREATE DATABASE chatting_group;`

## Chạy

```powershell
cd D:\THANH\PRN222\csharp

dotnet run --project ChatServer
dotnet run --project ChatClient
```

Login: `localhost:7000`, HTTP `7001`, đăng ký user mới lần đầu (bấm **Register** nếu chưa có tài khoản).

Máy khác: `192.168.x.x:7000` + HTTP port `7001`.

> Cổng 5000 thường bị PostgreSQL chiếm trên Windows — server dùng **7000/7001** để tránh xung đột.
