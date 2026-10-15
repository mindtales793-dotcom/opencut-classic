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
  await until(win, `document.body.innerText.includes('A1 • Narração') && document.body.innerText.includes('G1 • Stickers / Gráficos')`);
  await win.webContents.executeJavaScript(`document.querySelector('button[title="Adicionar faixa visual"]').click()`);
  await until(win, `document.body.innerText.includes('V3 • Vídeo / Imagem')`);
  await win.webContents.executeJavaScript(`document.querySelector('button[title="Adicionar faixa de áudio"]').click()`);
  await until(win, `document.body.innerText.includes('A4 • Áudio')`);
  // Exercise the shipped worker, audio import, timeline cuts and undo together.
  for (let i=0;i<3;i++) {
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => /^(Next|Finish)$/.test(b.textContent.trim()))?.click()`);
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  await win.webContents.executeJavaScript(`document.querySelector('button[aria-label="Sincronização"]').click()`);
  await until(win, `!!document.querySelector('input[aria-label="Importar narração"]')`);
  await win.webContents.executeJavaScript(`(()=>{
    const rate=16000,frames=rate*3,bytes=new ArrayBuffer(44+frames*2),v=new DataView(bytes);
    const str=(offset,s)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i));};
    str(0,'RIFF');v.setUint32(4,36+frames*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,frames*2,true);
    for(let i=0;i<frames;i++)v.setInt16(44+i*2,(i<rate||i>=2*rate)?Math.round(Math.sin(i*2*Math.PI*440/rate)*8192):0,true);
    const transfer=new DataTransfer();transfer.items.add(new File([bytes],'silence-smoke.wav',{type:'audio/wav'}));
    const input=document.querySelector('input[aria-label="Importar narração"]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await until(win, `document.querySelector('select[aria-label="Narração para remover silêncios"]')?.options[0]?.textContent.includes('silence-smoke.wav')`);
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Analisar silêncios').click()`);
  await until(win, `document.body.innerText.includes('0.84 s removidos')`);
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Aplicar cortes em todas as faixas').click()`);
  await until(win, `document.querySelector('select[aria-label="Narração para remover silêncios"]')?.options.length===2`);
  const clips=await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[data-track-type="audio"][data-timeline-element-id]')).map(e=>({start:Number(e.dataset.startTime),duration:Number(e.dataset.duration)})).sort((a,b)=>a.start-b.start)`);
  if(clips.length!==2 || clips[0].start!==0 || clips[1].start!==clips[0].duration) throw new Error('Silence cuts left a gap or wrong clip count: '+JSON.stringify(clips));
  await win.webContents.executeJavaScript(`document.activeElement?.blur()`);
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Z',modifiers:['control']});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Z',modifiers:['control']});
  await until(win, `document.querySelector('select[aria-label="Narração para remover silêncios"]')?.options.length===1`);
  // Switching tabs must keep the imported result and controls alive.
  await win.webContents.executeJavaScript(`document.querySelector('button[aria-label="Roteiro"]').click()`);
  await win.webContents.executeJavaScript(`document.querySelector('button[aria-label="Sincronização"]').click()`);
  await until(win, `document.querySelector('select[aria-label="Narração para remover silêncios"]')?.options[0]?.textContent.includes('silence-smoke.wav')`);
  // Check that the event loop remains responsive after hydration and project creation.
  await win.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  const screenshot = await win.webContents.capturePage();
  if (process.env.DARKCUT_SMOKE_REPORT) fs.writeFileSync(process.env.DARKCUT_SMOKE_REPORT + '.png', screenshot.toPNG());
  report({ ok: true, checks: ['packaged server started', 'projects hydrated', 'project created', 'editor loaded', 'default lanes preserved', 'video and audio lanes added', 'audio imported', 'silence detected locally', 'cuts applied without gaps', 'cuts undone', 'tab switch preserved audio', 'animation frames responsive'] });
}
module.exports = { report, run };
