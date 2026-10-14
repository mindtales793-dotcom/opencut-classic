const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");

let serverProcess = null;
const PORT = 3217;
const HOST = "127.0.0.1";

function runtimeRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "runtime")
    : path.join(__dirname, "runtime");
}

function findServer() {
  const root = runtimeRoot();
  const candidates = [
    path.join(root, "server.js"),
    path.join(root, "apps", "web", "server.js"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function waitForServer(timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(
        { host: HOST, port: PORT, path: "/", timeout: 1500 },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error("DarkCut local server did not start in time."));
          return;
        }
        setTimeout(check, 500);
      });
      req.on("timeout", () => req.destroy());
    };
    check();
  });
}

function startServer() {
  const serverFile = findServer();
  if (!serverFile) {
    throw new Error(
      "DarkCut runtime not found. Build the web app and run the desktop stage step first.",
    );
  }

  const cwd = path.dirname(serverFile);
  const executable = process.execPath;
  const toolsDir = app.isPackaged
    ? path.join(process.resourcesPath, "tools")
    : path.join(__dirname, "tools");
  const inheritedPath = process.env.PATH || process.env.Path || "";
  const toolsPath = fs.existsSync(toolsDir)
    ? toolsDir + path.delimiter + inheritedPath
    : inheritedPath;

  serverProcess = spawn(executable, [serverFile], {
    cwd,
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOSTNAME: HOST,
      PORT: String(PORT),
      PATH: toolsPath,
      Path: toolsPath,
      DARKCUT_VIDEO_TOOLS: toolsDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout?.on("data", (data) =>
    console.log("[darkcut-server]", data.toString().trim()),
  );
  serverProcess.stderr?.on("data", (data) =>
    console.error("[darkcut-server]", data.toString().trim()),
  );
  serverProcess.on("exit", (code) => {
    if (code && code !== 0) {
      console.error("DarkCut server exited with code", code);
    }
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: "#0b0b0c",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });

  await win.loadURL(`http://${HOST}:${PORT}`);
}

app.whenReady().then(async () => {
  try {
    startServer();
    await waitForServer();
    await createWindow();
  } catch (error) {
    console.error(error);
    dialog.showErrorBox(
      "DarkCut Studio",
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});
