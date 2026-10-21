// Packaged Windows smoke test for the lightweight, offline-first editor.
const fs = require("node:fs");

function report(value) {
  if (process.env.DARKCUT_SMOKE_REPORT) {
    fs.writeFileSync(process.env.DARKCUT_SMOKE_REPORT, JSON.stringify(value, null, 2));
  }
}
async function execute(win, code) {
  return win.webContents.executeJavaScript(code);
}
async function until(win, code, label, timeout = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await execute(win, code)) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Smoke timeout: " + label);
}
async function clickAria(win, label) {
  // Use a direct attribute comparison; avoid CSS escaping problems in labels.
  const safe = '(()=>{const b=Array.from(document.querySelectorAll("button")).find(x=>x.getAttribute("aria-label")===' + JSON.stringify(label) + ');if(!b)return false;b.click();return true;})()';
  if (!(await execute(win, safe))) throw new Error("Missing tab: " + label);
}
async function run(win) {
  await until(win, 'Array.from(document.querySelectorAll("button")).some(b=>b.textContent.includes("Create your first project"))', "projects");
  const created = await execute(win, '(()=>{const b=Array.from(document.querySelectorAll("button")).find(x=>x.textContent.includes("Create your first project"));if(!b)return false;b.click();return true;})()');
  if (!created) throw new Error("Cannot create project");
  await until(win, 'location.pathname.startsWith("/editor/") && !!document.querySelector(".studio-sidebar")', "editor");
  const steps = [
    ["Roteiro", "Dividir em cenas"],
    ["Narração e sincronização", "Importar narração do computador"],
    ["Templates", "Aplicar template"],
    ["Legendas", "Importar SRT/ASS"],
    ["Transições", "Biblioteca de transições"],
    ["Efeitos", "Efeitos"],
  ];
  for (const [tab, text] of steps) {
    await clickAria(win, tab);
    await until(win, 'document.body.innerText.includes(' + JSON.stringify(text) + ')', tab);
  }
  await clickAria(win, "Linha do Tempo");
  await until(win, '!!document.querySelector("[data-darkcut-workspace=timeline]") && !!document.querySelector(".studio-timeline")', "timeline");
  const legacyVisible = await execute(win, '["DarkMiner","Roteiro → SRT","Auto Edit","Remotion Composer"].some(t=>Array.from(document.querySelectorAll(".studio-sidebar button")).some(b=>b.textContent.includes(t)))');
  if (legacyVisible) throw new Error("Legacy AI tools remain visible");
  const shot = await win.webContents.capturePage();
  if (process.env.DARKCUT_SMOKE_REPORT) fs.writeFileSync(process.env.DARKCUT_SMOKE_REPORT + ".png", shot.toPNG());
  report({ ok: true, checks: [
    "packaged Next server started", "project created",
    "timeline opened", "script editor available",
    "local narration import available", "native templates available",
    "manual captions import available", "transitions and effects available",
    "legacy AI, DarkMiner and Remotion UI hidden",
  ] });
}
module.exports = { report, run };
