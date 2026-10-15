// Executed only with --smoke-test, using an isolated profile in CI.
const fs = require('node:fs');
function report(value) {
  if (process.env.DARKCUT_SMOKE_REPORT) {
    fs.writeFileSync(process.env.DARKCUT_SMOKE_REPORT, JSON.stringify(value, null, 2));
  }
}
async function until(win, expression, timeout = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  const text = await win.webContents.executeJavaScript('document.body.innerText');
  throw new Error(`Smoke test timed out: ${expression}\n${text.slice(0, 2500)}`);
}
async function run(win) {
  await until(win, `Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Create your first project'))`);
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Create your first project')).click()`);
  await until(win, `location.pathname.startsWith('/editor/') && document.body.innerText.includes('Roteiro') && !document.body.innerText.includes('Loading project...')`);
  // Check that the event loop remains responsive after hydration and project creation.
  await win.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  const screenshot = await win.webContents.capturePage();
  if (process.env.DARKCUT_SMOKE_REPORT) fs.writeFileSync(process.env.DARKCUT_SMOKE_REPORT + '.png', screenshot.toPNG());
  report({ ok: true, checks: ['packaged server started', 'projects hydrated', 'project created', 'editor loaded', 'animation frames responsive'] });
}
module.exports = { report, run };
