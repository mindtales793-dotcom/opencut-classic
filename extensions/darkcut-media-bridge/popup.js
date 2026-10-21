"use strict";
const BASE = "http://127.0.0.1:3217/api/darkcut/media-bridge";
const MAX_SIZE = 64 * 1024 * 1024;
const $ = (id) => document.getElementById(id);
const status = (msg) => { $("status").textContent = msg; };
let uploading = false;

function projectId() {
  const value = $("project").value.trim();
  if (!/^[a-zA-Z0-9_-]{3,90}$/.test(value)) throw new Error("Copie o código do projeto no DarkCut.");
  return value;
}
function pairingToken() {
  const value = $("token").value.trim();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("Copie a chave temporária gerada pelo DarkCut aberto.");
  return value;
}
function sceneFromFilename(name) {
  const match = name.match(/(?:^|[\s_.-])(?:cena|scene|prompt)[\s_.-]*0*(\d{1,4})(?=[\s_.-]|$)/i)
    || name.match(/^0*(\d{1,4})(?=[\s_.-])/);
  return match ? Number(match[1]) : null;
}
function numberFor(file) {
  const n = sceneFromFilename(file.name) || Number($("scene").value.trim());
  if (!Number.isInteger(n) || n < 1 || n > 10000) throw new Error(`Informe a cena do arquivo ${file.name} (por nome ou campo manual).`);
  return n;
}
async function connect() {
  const id = projectId();
  const token = pairingToken();
  const response = await fetch(BASE + "?action=status", { headers: { "x-darkcut-bridge-token": token }, cache: "no-store" });
  if (!response.ok) throw new Error("Não conectado. Confira o DarkCut aberto e a chave temporária.");
  await chrome.storage.local.set({ darkcutProjectId: id });
  await chrome.storage.session.set({ darkcutBridgeToken: token });
  status("Conexão local pronta. Selecione arquivos já exportados para vincular às cenas.");
}
$("connect").addEventListener("click", async () => {
  $("connect").disabled = true;
  try { await connect(); } catch (error) { status(error.message); }
  finally { $("connect").disabled = false; }
});
$("upload").addEventListener("click", async () => {
  if (uploading) return;
  let files;
  let id;
  let token;
  try {
    id = projectId();
    token = pairingToken();
    files = [...$("files").files];
    if (!files.length) throw new Error("Selecione ao menos um arquivo.");
    files.forEach((file) => {
      numberFor(file);
      if (file.size > MAX_SIZE || !file.size) throw new Error(`Arquivo inválido/grande demais: ${file.name} (limite 64 MB).`);
    });
  } catch (error) { status(error.message); return; }
  uploading = true;
  $("upload").disabled = true;
  let sent = 0;
  try {
    for (const [index, file] of files.entries()) {
      const scene = numberFor(file);
      status(`Enviando ${index + 1}/${files.length}: Cena ${scene} — ${file.name}`);
      const form = new FormData();
      form.append("projectId", id);
      form.append("sceneIndex", String(scene));
      form.append("file", file, file.name);
      const result = await fetch(BASE + "?action=upload", {
        method: "POST", headers: { "x-darkcut-bridge-token": token }, body: form,
      });
      const data = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(data.error || `Falha HTTP ${result.status}`);
      sent++;
    }
    status(`${sent} arquivo(s) enviados. O DarkCut vinculará cada um à cena correspondente quando a sincronização estiver ativa.`);
    $("files").value = "";
  } catch (error) { status(`${sent} enviados. ${error.message}`); }
  finally { uploading = false; $("upload").disabled = false; }
});
Promise.all([chrome.storage.local.get(["darkcutProjectId"]), chrome.storage.session.get(["darkcutBridgeToken"])])
  .then(([local, session]) => {
    $("project").value = local.darkcutProjectId || "";
    $("token").value = session.darkcutBridgeToken || "";
  });
