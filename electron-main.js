const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const REMOTE_SERVER = (process.env.CHAT_SERVER_URL || "").replace(/\/+$/, "");
const isClientOnly = Boolean(REMOTE_SERVER);
const appUrl = isClientOnly ? REMOTE_SERVER : `http://127.0.0.1:${PORT}`;

let serverProcess = null;

function waitForServer(url, retries = 40) {
  const client = url.startsWith("https:") ? https : http;

  return new Promise((resolve, reject) => {
    let attempt = 0;
    const check = () => {
      client
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          attempt += 1;
          if (attempt >= retries) {
            reject(
              new Error(
                `Khong ket noi duoc server: ${url}\nKiem tra may HOST da bat app + ngrok (neu khac mang).`
              )
            );
            return;
          }
          setTimeout(check, 500);
        });
    };
    check();
  });
}

function startServer() {
  serverProcess = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "inherit"
  });
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
  serverProcess = null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: isClientOnly ? "Chat Group (Client)" : "Chat Group (Host)",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadURL(appUrl);
}

app.whenReady().then(async () => {
  if (!isClientOnly) {
    startServer();
  }

  try {
    await waitForServer(appUrl);
    createWindow();
  } catch (error) {
    console.error(error.message);
    stopServer();
    app.quit();
  }
});

app.on("window-all-closed", () => {
  stopServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopServer();
});
