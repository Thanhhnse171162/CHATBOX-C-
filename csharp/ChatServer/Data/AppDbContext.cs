using ChatServer.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace ChatServer.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<RoomMember> RoomMembers => Set<RoomMember>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<FileRecord> FileRecords => Set<FileRecord>();
    public DbSet<Call> Calls => Set<Call>();
    public DbSet<CallParticipant> CallParticipants => Set<CallParticipant>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Username).IsUnique();
        });

        modelBuilder.Entity<Room>(e =>
        {
            e.HasKey(x => x.Id);
        });

        modelBuilder.Entity<RoomMember>(e =>
        {
            e.HasKey(x => new { x.RoomId, x.UserId });
            e.HasOne(x => x.Room).WithMany(r => r.Members).HasForeignKey(x => x.RoomId);
            e.HasOne(x => x.User).WithMany(u => u.Memberships).HasForeignKey(x => x.UserId);
        });

        modelBuilder.Entity<Message>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne(x => x.Room).WithMany(r => r.Messages).HasForeignKey(x => x.RoomId);
            e.HasOne(x => x.Sender).WithMany(u => u.Messages).HasForeignKey(x => x.SenderId);
            e.HasOne(x => x.FileRecord).WithMany().HasForeignKey(x => x.FileRecordId);
        });

        modelBuilder.Entity<FileRecord>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne(x => x.UploadedBy).WithMany().HasForeignKey(x => x.UploadedById);
        });

        modelBuilder.Entity<Call>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne(x => x.Room).WithMany(r => r.Calls).HasForeignKey(x => x.RoomId);
        });

        modelBuilder.Entity<CallParticipant>(e =>
        {
            e.HasKey(x => new { x.CallId, x.UserId });
            e.HasOne(x => x.Call).WithMany(c => c.Participants).HasForeignKey(x => x.CallId);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
        });
    }
}
