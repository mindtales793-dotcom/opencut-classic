const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");

let serverProcess = null;
let mainWindow = null;
let serverFailure = null;
let quitting = false;
const smokeTest = process.argv.includes("--smoke-test");
if (smokeTest && process.env.DARKCUT_SMOKE_PROFILE) {
  app.setPath("userData", process.env.DARKCUT_SMOKE_PROFILE);
}
const logFile = path.join(app.getPath("userData"), "startup.log");
fs.mkdirSync(path.dirname(logFile), { recursive: true });
fs.writeFileSync(logFile, `DarkCut ${app.getVersion()} - ${new Date().toISOString()}\n`);
function log(message) {
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
}
function fail(error) {
  const message = error instanceof Error ? error.message : String(error);
  log(message);
  if (smokeTest) {
    require("./smoke.cjs").report({ ok: false, error: message });
  } else {
    dialog.showErrorBox("DarkCut Studio — não foi possível iniciar", `${message}\n\nDetalhes: ${logFile}`);
  }
  stopServer();
  app.exit(1);
}
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});
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

async function ensurePortAvailable() {
  const net = require("node:net");
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(new Error(`A porta ${PORT} está ocupada. Feche outra versão do DarkCut e tente novamente.`)));
    probe.listen(PORT, HOST, () => probe.close(resolve));
  });
}

async function waitForServer(timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (serverFailure) throw serverFailure;
    const ready = await new Promise((resolve) => {
      const req = http.get({ host: HOST, port: PORT, path: "/api/health", timeout: 1500 }, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve(res.statusCode === 200 && body === "OK"));
        res.on("error", () => resolve(false));
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => req.destroy());
    });
    if (serverFailure) throw serverFailure;
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("O servidor local não respondeu em 60 segundos. Consulte startup.log.");
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
      NEXT_PUBLIC_SITE_URL:
        process.env.NEXT_PUBLIC_SITE_URL || `http://${HOST}:${PORT}`,
      NEXT_PUBLIC_MARBLE_API_URL:
        process.env.NEXT_PUBLIC_MARBLE_API_URL || `http://${HOST}:${PORT}`,
      DATABASE_URL:
        process.env.DATABASE_URL ||
        "postgresql://darkcut:darkcut@127.0.0.1:5432/darkcut",
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ||
        "darkcut-local-desktop-runtime-secret-2026",
      UPSTASH_REDIS_REST_URL:
        process.env.UPSTASH_REDIS_REST_URL || `http://${HOST}:${PORT}`,
      UPSTASH_REDIS_REST_TOKEN:
        process.env.UPSTASH_REDIS_REST_TOKEN || "darkcut-local-disabled",
      MARBLE_WORKSPACE_KEY:
        process.env.MARBLE_WORKSPACE_KEY || "darkcut-local-disabled",
      FREESOUND_CLIENT_ID:
        process.env.FREESOUND_CLIENT_ID || "darkcut-local-disabled",
      FREESOUND_API_KEY:
        process.env.FREESOUND_API_KEY || "darkcut-local-disabled",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout?.on("data", (data) => log(data.toString().trim()));
  serverProcess.stderr?.on("data", (data) => log(data.toString().trim()));
  serverProcess.on("error", (error) => { serverFailure = error; log(error.message); });
  serverProcess.on("exit", (code, signal) => {
    if (quitting) return;
    serverFailure = new Error(`O servidor do DarkCut encerrou (código ${code}, sinal ${signal}). Consulte startup.log.`);
    log(serverFailure.message);
    if (mainWindow && mainWindow.webContents.getURL().startsWith(`http://${HOST}:${PORT}`)) fail(serverFailure);
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: true,
    title: "DarkCut Studio",
    backgroundColor: "#0b0b0c",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = win;
  win.maximize();
  win.webContents.on("render-process-gone", (_event, details) => fail(new Error(`A janela do editor encerrou: ${details.reason}`)));
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) log(`[renderer] ${message}`);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== `http://${HOST}:${PORT}`) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent('<html lang="pt-BR"><body style="background:#0b0b0c;color:white;font:20px system-ui;display:grid;place-content:center;height:95vh"><h1>DarkCut Studio</h1><p>Iniciando o editor…</p></body></html>'));
  return win;
}

if (hasLock) app.whenReady().then(async () => {
  try {
    const win = await createWindow();
    await ensurePortAvailable();
    startServer();
    await waitForServer();
    await win.loadURL(`http://${HOST}:${PORT}/projects`);
    if (smokeTest) {
      await require("./smoke.cjs").run(win);
      // The test creates a dirty project; bypass its beforeunload prompt only in CI.
      stopServer();
      app.exit(0);
    }
  } catch (error) {
    fail(error);
  }
});

function stopServer() {
  quitting = true;
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
}
app.on("window-all-closed", () => app.quit());
app.on("before-quit", stopServer);
app.on("will-quit", stopServer);
process.on("exit", stopServer);
