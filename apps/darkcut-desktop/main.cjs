const { app, BrowserWindow, dialog, shell, Tray, Menu, nativeImage, nativeTheme } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");

// Prefer the discrete GPU on notebooks/dual-GPU systems. Electron documents this
// switch and it must be set before the ready event.
app.commandLine.appendSwitch("force_high_performance_gpu");

let serverProcess = null;
let mainWindow = null;
let serverFailure = null;
let quitting = false;
let taskTray = null;
// Exports keep rendering frames in this window while it is minimized or hidden
// in the tray; without these switches Windows/Chromium throttle it and the
// FFmpeg encoder starves. Must be set before the app is ready.
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
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
// Random per-run capability. Only the UI at the loopback origin may reveal it for pairing.
const MEDIA_BRIDGE_TOKEN = randomBytes(32).toString("hex");

function runtimeRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "runtime")
    : path.join(__dirname, "runtime");
}

async function logGpuState() {
  try {
    log(`Hardware acceleration enabled: ${app.isHardwareAccelerationEnabled()}`);
    log(`GPU feature status: ${JSON.stringify(app.getGPUFeatureStatus())}`);
    const gpuInfo = await app.getGPUInfo("basic");
    log(`GPU info: ${JSON.stringify(gpuInfo)}`);
  } catch (error) {
    log(`GPU probe failed: ${error instanceof Error ? error.message : String(error)}`);
  }
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
      DARKCUT_DATA_DIR: app.getPath("userData"),
       DARKCUT_MEDIA_BRIDGE_TOKEN: MEDIA_BRIDGE_TOKEN,
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
  nativeTheme.themeSource = "dark";
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
      backgroundThrottling: false,
    },
  });

  mainWindow = win;
  let checkingClose = false;
  let allowClose = false;
  win.on("close", event => {
    if (quitting || allowClose || smokeTest) return;
    event.preventDefault();
    if (checkingClose) return;
    checkingClose = true;
    win.webContents.executeJavaScript(`document.querySelector('[data-darkcut-running="true"]') !== null`).then(active => {
      if (active) {
        if (!taskTray) {
          const icon = nativeImage.createFromPath(path.join(path.dirname(findServer()), "public", "icons", "favicon-16x16.png"));
          taskTray = new Tray(icon);
          taskTray.setToolTip("DarkCut Studio — tarefas em segundo plano");
          const show = () => { win.show(); win.focus(); };
          taskTray.on("click", show);
          taskTray.setContextMenu(Menu.buildFromTemplate([
            {label:"Abrir DarkCut Studio",click:show},
            {label:"Encerrar e interromper tarefas",click:()=>{stopServer();app.exit(0);}},
          ]));
        }
        win.hide();
        taskTray.displayBalloon({title:"DarkCut continua trabalhando",content:"As tarefas continuam em segundo plano. Clique no ícone perto do relógio para voltar."});
      } else { allowClose=true;win.close();allowClose=false; }
    }).catch(() => {allowClose=true;win.close();allowClose=false;}).finally(()=>{checkingClose=false;});
  });
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
  // Lightweight local startup splash: no network, fonts, timers or extra BrowserWindow.
  // The bar is indeterminate while the local server boots (not a fake percent).
  const startupSplash = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>DarkCut Studio</title>
  <style>
    *{box-sizing:border-box} html,body{height:100%;margin:0}
    body{display:grid;place-items:center;background:radial-gradient(circle at 50% 38%,#311017 0,#121216 42%,#09090b 85%);color:#fff;font-family:"Segoe UI",Arial,sans-serif;overflow:hidden}
    .glow{position:absolute;width:580px;height:580px;border:1px solid #f93a4c22;border-radius:50%;box-shadow:0 0 0 100px #e91c3210,0 0 0 210px #e91c3208}
    main{position:relative;text-align:center;width:min(90vw,620px);animation:enter .65s ease-out both}
    .mark{width:142px;height:142px;margin:0 auto 18px;border-radius:32px;background:linear-gradient(135deg,#fb3456,#8d0d27);display:grid;place-items:center;box-shadow:0 18px 70px #e9163d55,inset 0 1px #ffffff77}
    svg{width:88px;height:88px;fill:none;stroke:#fff;stroke-width:8;stroke-linecap:round;stroke-linejoin:round}
    h1{margin:0;font-size:clamp(58px,10vw,92px);letter-spacing:-.09em;font-weight:900;line-height:1.1}
    h1 em{color:#fa3856;font-style:normal}.studio{letter-spacing:.48em;font-size:17px;font-weight:700;margin:8px 0 42px;padding-left:.48em;color:#b6b7be}
    .track{height:5px;border-radius:999px;background:#343138;overflow:hidden;max-width:390px;margin:0 auto 14px}
    .fill{height:100%;width:38%;background:linear-gradient(90deg,transparent,#f72e4c,#ff8e9b);border-radius:999px;animation:loading 1.35s ease-in-out infinite}
    p{color:#a8a9af;letter-spacing:.05em;font-size:13px;margin:0}small{position:fixed;bottom:26px;left:0;right:0;color:#717279;font-size:11px;letter-spacing:.12em}
    @keyframes loading{from{transform:translateX(-110%)}to{transform:translateX(380%)}}
    @keyframes enter{from{opacity:0;transform:translateY(24px) scale(.96)}to{opacity:1;transform:none}}
    @media (prefers-reduced-motion:reduce){.fill,.mark,main{animation:none}}
  </style></head><body><div class="glow"></div><main>
    <div class="mark"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M25 15L80 75M75 15L20 75"/><circle cx="23" cy="79" r="10"/><circle cx="77" cy="79" r="10"/><path d="M48 42l8 8"/></svg></div>
    <h1>DARK<em>CUT</em></h1><div class="studio">STUDIO</div>
    <div class="track" role="progressbar" aria-label="Iniciando o DarkCut"><div class="fill"></div></div>
    <p>Preparando seus projetos e ferramentas de edição…</p>
  </main><small>SEU ESTÚDIO DE EDIÇÃO</small></body></html>`;
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(startupSplash));
  return win;
}

if (hasLock) app.whenReady().then(async () => {
  try {
    await logGpuState();
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
