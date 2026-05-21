const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const PORT = process.env.PORT || 3000;
let serverProcess = null;

function waitForServer(retries = 40) {
  const url = `http://127.0.0.1:${PORT}`;
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const check = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          attempt += 1;
          if (attempt >= retries) {
            reject(new Error("Khong ket noi duoc server chat."));
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
    title: "Chat Group",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadURL(`http://127.0.0.1:${PORT}`);
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer();
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
