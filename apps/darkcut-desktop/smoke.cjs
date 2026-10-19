// Executed only with --smoke-test, using an isolated profile in CI.
const fs = require("node:fs");

function report(value) {
	if (process.env.DARKCUT_SMOKE_REPORT) {
		fs.writeFileSync(
			process.env.DARKCUT_SMOKE_REPORT,
			JSON.stringify(value, null, 2),
		);
	}
}

async function execute(win, expression, step) {
	try {
		return await win.webContents.executeJavaScript(expression);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Smoke step failed [${step}]: ${message}`);
	}
}

async function until(win, expression, timeout = 60000, step = expression) {
	const started = Date.now();
	while (Date.now() - started < timeout) {
		if (await execute(win, expression, step)) return;
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	const text = await execute(win, "document.body.innerText", step + ":body");
	throw new Error(
		`Smoke test timed out [${step}]: ${expression}\n${text.slice(0, 2500)}`,
	);
}

async function clickByAria(win, label, step) {
	const ok = await execute(
		win,
		`(()=>{const b=document.querySelector('button[aria-label="${label}"]'); if(!b) return false; b.click(); return true;})()`,
		step,
	);
	if (!ok)
		throw new Error(
			`Smoke selector missing [${step}]: button[aria-label="${label}"]`,
		);
}

async function clickByText(win, text, step) {
	const ok = await execute(
		win,
		`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()==="${text}" || b.textContent?.includes("${text}")); if(!b) return false; b.click(); return true;})()`,
		step,
	);
	if (!ok) throw new Error(`Smoke button missing [${step}]: ${text}`);
}

async function run(win) {
	await until(
		win,
		`Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Create your first project'))`,
		60000,
		"projects:create-button",
	);
	await execute(
		win,
		`localStorage.setItem('darkcut-production', JSON.stringify({state:{jamendoClientId:'smoke-fixture'},version:0}));`,
		"fixtures:configure",
	);
	await new Promise((resolve) => {
		win.webContents.once("did-finish-load", resolve);
		win.webContents.reload();
	});
	await until(
		win,
		`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Create your first project'))`,
		60000,
		"fixtures:reload",
	);

	await clickByText(win, "Create your first project", "projects:create");

	await until(
		win,
		`location.pathname.startsWith('/editor/') && document.body.innerText.includes('Produção') && !document.body.innerText.includes('Loading project...')`,
		60000,
		"editor:loaded",
	);
	await until(
		win,
		`document.body.innerText.includes('A1 • Narração') && document.body.innerText.includes('G1 • Stickers / Gráficos')`,
		60000,
		"timeline:default-lanes",
	);

	const visualLaneAdded = await execute(
		win,
		`(()=>{const b=document.querySelector('button[title="Adicionar faixa visual"]'); if(!b) return false; b.click(); return true;})()`,
		"timeline:add-visual-lane",
	);
	if (!visualLaneAdded)
		throw new Error("Smoke selector missing [timeline:add-visual-lane]");
	await until(
		win,
		`document.body.innerText.includes('V3 • Vídeo / Imagem')`,
		60000,
		"timeline:visual-lane-added",
	);

	const audioLaneAdded = await execute(
		win,
		`(()=>{const b=document.querySelector('button[title="Adicionar faixa de áudio"]'); if(!b) return false; b.click(); return true;})()`,
		"timeline:add-audio-lane",
	);
	if (!audioLaneAdded)
		throw new Error("Smoke selector missing [timeline:add-audio-lane]");
	await until(
		win,
		`document.body.innerText.includes('A4 • Áudio')`,
		60000,
		"timeline:audio-lane-added",
	);

	// Close onboarding dialogs if present.
	for (let i = 0; i < 3; i++) {
		await execute(
			win,
			`Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => /^(Next|Finish)$/.test(b.textContent.trim()))?.click()`,
			"onboarding:advance",
		);
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	await until(
		win,
		`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Ajustes do clipe' && b.getAttribute('aria-pressed')==='false')`,
		10000,
		"properties:hidden",
	);
	await clickByText(win, "Ajustes do clipe", "properties:open");
	await until(
		win,
		`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Ocultar ajustes' && b.getAttribute('aria-pressed')==='true')`,
		10000,
		"properties:shown",
	);
	await clickByText(win, "Ocultar ajustes", "properties:close");
	await clickByAria(win, "Templates", "templates:open");
	await until(
		win,
		`document.querySelectorAll('[data-template-library] canvas[data-preview-playing]').length>=11`,
		20000,
		"templates:all-previews",
	);
	await clickByAria(win, "Prévia de POV Financeiro", "templates:play");
	await until(
		win,
		`document.querySelectorAll('canvas[data-preview-playing="true"]').length===1`,
		10000,
		"templates:one-active",
	);
	const beforePreview = await execute(
		win,
		`document.querySelector('canvas[data-preview-playing="true"]').toDataURL()`,
		"templates:frame-one",
	);
	await new Promise((resolve) => setTimeout(resolve, 500));
	const afterPreview = await execute(
		win,
		`document.querySelector('canvas[data-preview-playing="true"]').toDataURL()`,
		"templates:frame-two",
	);
	if (beforePreview === afterPreview)
		throw new Error("Template preview did not animate");
	await clickByAria(win, "Sincronização", "tabs:sync-open");
	await until(
		win,
		`!!document.querySelector('input[aria-label="Importar narração"]')`,
		60000,
		"silence:import-visible",
	);

	await execute(
		win,
		`(()=>{
    const rate=16000,frames=rate*3,bytes=new ArrayBuffer(44+frames*2),v=new DataView(bytes);
    const str=(offset,s)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i));};
    str(0,'RIFF');v.setUint32(4,36+frames*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,frames*2,true);
    for(let i=0;i<frames;i++)v.setInt16(44+i*2,(i<rate||i>=2*rate)?Math.round(Math.sin(i*2*Math.PI*440/rate)*8192):0,true);
    window.__smokeAudioBytes=bytes;
    const transfer=new DataTransfer();
    transfer.items.add(new File([bytes],'silence-smoke.wav',{type:'audio/wav'}));
    const input=document.querySelector('input[aria-label="Importar narração"]');
    if(!input) throw new Error('Import narration input not found');
    input.files=transfer.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`,
		"silence:inject-audio",
	);

	await until(
		win,
		`document.querySelector('select[aria-label="Narração para remover silêncios"]')?.options[0]?.textContent.includes('silence-smoke.wav')`,
		60000,
		"silence:audio-imported",
	);

	await clickByText(win, "Analisar silêncios", "silence:analyze");
	await until(
		win,
		`document.body.innerText.includes('0.84 s removidos')`,
		60000,
		"silence:analysis-result",
	);

	await clickByText(
		win,
		"Aplicar cortes em todas as faixas",
		"silence:apply-cuts",
	);
	await until(
		win,
		`document.querySelector('select[aria-label="Narração para remover silêncios"]')?.options.length===2`,
		60000,
		"silence:cuts-applied",
	);

	const clips = await execute(
		win,
		`Array.from(document.querySelectorAll('[data-track-type="audio"][data-timeline-element-id]')).map(e=>({start:Number(e.dataset.startTime),duration:Number(e.dataset.duration)})).sort((a,b)=>a.start-b.start)`,
		"silence:verify-clips",
	);
	if (
		clips.length !== 2 ||
		clips[0].start !== 0 ||
		clips[1].start !== clips[0].duration
	) {
		throw new Error(
			"Silence cuts left a gap or wrong clip count: " + JSON.stringify(clips),
		);
	}

	await execute(win, `document.activeElement?.blur()`, "undo:blur");
	win.webContents.sendInputEvent({
		type: "keyDown",
		keyCode: "Z",
		modifiers: ["control"],
	});
	win.webContents.sendInputEvent({
		type: "keyUp",
		keyCode: "Z",
		modifiers: ["control"],
	});
	await until(
		win,
		`document.querySelector('select[aria-label="Narração para remover silêncios"]')?.options.length===1`,
		60000,
		"undo:cuts-restored",
	);

	// Switching tabs must keep the imported result and controls alive.
	await clickByAria(win, "Produção", "tabs:production-open");
	await clickByAria(win, "Sincronização", "tabs:sync-return");
	await until(
		win,
		`document.querySelector('select[aria-label="Narração para remover silêncios"]')?.options[0]?.textContent.includes('silence-smoke.wav')`,
		60000,
		"tabs:state-preserved",
	);

	await execute(
		win,
		`(()=>{
        const original=window.fetch.bind(window);
        window.fetch=async(input,init)=>{
            const url=String(input);
            if(url==='/api/darkcut/music/search')return Response.json({results:[{id:123,name:'Smoke Music',username:'Fixture',tags:['jamendo'],duration:3,previewUrl:'/__smoke_audio',downloadUrl:'/__smoke_audio',license:'CC0'}],hasMore:false});
            if(url==='/__smoke_audio'){await new Promise(r=>setTimeout(r,1500));return new Response(window.__smokeAudioBytes,{headers:{'Content-Type':'audio/wav'}});}
            return original(input,init);
        };
    })()`,
		"music:fixture",
	);
	await clickByAria(win, "Áudio", "music:open");
	await until(
		win,
		`document.body.innerText.includes('Smoke Music')`,
		20000,
		"music:loaded",
	);
	await execute(
		win,
		`document.querySelector('button[aria-label="Adicionar Smoke Music à timeline"]').click()`,
		"music:add",
	);
	await until(
		win,
		`!!document.querySelector('progress[aria-label="Smoke Music"]:not([value])')`,
		10000,
		"music:progress",
	);
	await until(
		win,
		`document.body.innerText.includes('Música adicionada à faixa A2.')`,
		30000,
		"music:timeline",
	);
	await clickByAria(win, "Sincronização", "music:leave");

	await execute(
		win,
		`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
		"renderer:responsive",
	);


	// Verify the actual MEDIA SORT menu, not just the sorting helper.
	await clickByAria(win, "Mídia", "media:open");
	await until(win, "!!document.querySelector('button[aria-label=\"Organizar mídias\"]')", 15000, "media:sort-visible");
	await clickByText(win, "1→N", "media:scene-sort-click");
	await until(win, "document.body.innerText.includes('Ordem: cenas numeradas · crescente')", 10000, "media:scene-sort-applied");
	for (const [order, label] of [["desc", "mais recentes"], ["asc", "mais antigas"]]) {
		const open = await execute(win, "(()=>{const button=document.querySelector('button[aria-label=\"Organizar mídias\"]');if(!button)return false;button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,pointerType:'mouse',isPrimary:true}));return true;})()", "media:sort-menu-open");
		if (!open) throw new Error("Media sort menu trigger did not respond");
		await until(win, "Array.from(document.querySelectorAll('[role=\"menuitem\"]')).some(item=>item.textContent?.includes(\"Data do arquivo\"))", 10000, "media:sort-menu-items");
		const chosen = await execute(win, "(()=>{const item=Array.from(document.querySelectorAll('[role=\"menuitem\"]')).find(item=>item.textContent?.includes(\"Data do arquivo\"));if(!item)return false;item.click();return true;})()", "media:sort-date-select");
		if (!chosen) throw new Error("Date sorting menu item did not respond");
		const expectedOrderLabel = order === "desc" ? "decrescente" : "crescente";
		await until(win, `document.body.innerText.includes(${JSON.stringify(`Ordem: data do arquivo · ${expectedOrderLabel}`)})`, 10000, "media:date-" + label);
	}

	// The effects library must expose functional category buttons.
	await clickByAria(win, "Efeitos", "filters:open");
	await until(win, "!!document.querySelector('input[aria-label=\"Pesquisar filtros e efeitos\"]')", 15000, "filters:search-visible");
	const onlyBlur = await execute(win, "(()=>{const item=Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Desfoque');if(!item)return false;item.click();return true;})()", "filters:select-blur");
	if (!onlyBlur) throw new Error("Filter category 'Desfoque' did not respond");
	await until(win, "document.body.innerText.includes('Efeitos e filtros · 1/22')", 10000, "filters:category-filtered");
	const allFilters = await execute(win, "(()=>{const item=Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Todos');if(!item)return false;item.click();return true;})()", "filters:reset-category");
	if (!allFilters) throw new Error("Filter category 'Todos' did not respond");
	await until(win, "document.body.innerText.includes('Efeitos e filtros · 22/22')", 10000, "filters:all-restored");

	await clickByAria(win, "Produção", "design:production");
	await until(
		win,
		`!!document.querySelector('.studio-script-grid') && !!document.querySelector('.studio-sidebar')`,
		10000,
		"design:dashboard",
	);
	// New workspace contract: content tools fill the upper area without a
	// visible video monitor. Timeline keeps the tracks below.
	const geometry = await execute(
		win,
		`(()=>{
		 const workspace=document.querySelector('[data-darkcut-workspace="tools"]')?.getBoundingClientRect();
		 const assets=document.querySelector('.studio-assets')?.getBoundingClientRect();
		 const sidebar=document.querySelector('.studio-sidebar')?.getBoundingClientRect();
		 const preview=document.querySelector('[aria-hidden="true"].invisible')?.getAttribute("class") || "";
		 return {workspaceWidth:workspace?.width, assetsWidth:assets?.width, sidebarWidth:sidebar?.width, previewHidden:preview.includes("invisible")};
		})()`,
		"design:workspace-geometry",
	);
	if (!(geometry.assetsWidth > geometry.workspaceWidth * 0.85 && geometry.sidebarWidth >= 140 && geometry.previewHidden))
		throw new Error("Full width tools or hidden monitor check failed: " + JSON.stringify(geometry));

	await clickByAria(win, "Linha do Tempo", "layout:timeline-tab");
	await until(win, `!!document.querySelector('[data-darkcut-workspace="timeline"]') &&
		!!document.querySelector('[aria-hidden="false"]')`, 10000, "layout:monitor-only-timeline");
	await clickByAria(win, "DarkMiner", "layout:miner-tab");
	await until(win, `!!document.querySelector('[data-darkcut-workspace="darkminer"]') &&
		!!document.querySelector('[data-darkcut-miner-workspace="true"]')`, 15000, "layout:miner-full-workspace");
	await clickByAria(win, "Produção", "layout:return-production");
	await until(win, `!!document.querySelector('[data-darkcut-workspace="tools"]')`, 10000, "layout:return-production-check");

	// The Electron package must bring up the actual bundled Python backend,
	// not merely display a DarkMiner placeholder or a disconnected iframe.
	let embeddedMinerReady = false;
	for (let attempt = 0; attempt < 35 && !embeddedMinerReady; attempt++) {
		for (let port = 8000; port <= 8010; port++) {
			try {
				const response = await fetch(`http://127.0.0.1:${port}/api/status`, {
					signal: AbortSignal.timeout(1200),
				});
				if (!response.ok) continue;
				const data = await response.json();
				if (data.ok === true && data.version === "3.6.2") {
					const channels = await fetch(`http://127.0.0.1:${port}/api/v3/channels`, {
						signal: AbortSignal.timeout(1200),
					});
					if (channels.ok) embeddedMinerReady = true;
					break;
				}
			} catch {
				// PyInstaller one-file extraction and service initialization take time.
			}
		}
		if (!embeddedMinerReady) await new Promise(resolve => setTimeout(resolve, 500));
	}
	if (!embeddedMinerReady) {
		throw new Error("Bundled DarkMiner 3.6.2 did not respond from the packaged Electron app.");
	}

	const screenshot = await win.webContents.capturePage();
	if (process.env.DARKCUT_SMOKE_REPORT) {
		fs.writeFileSync(
			process.env.DARKCUT_SMOKE_REPORT + ".png",
			screenshot.toPNG(),
		);
	}

	report({
		ok: true,
		checks: [
			"packaged server started",
			"embedded DarkMiner 3.6.2 API started from packaged Electron",
			"projects hydrated",
			"project created",
			"editor loaded",
			"default lanes preserved",
			"video and audio lanes added",
			"audio imported",
			"silence detected locally",
			"cuts applied without gaps",
			"cuts undone",
			"tab switch preserved audio",
			"animation frames responsive",
			"properties panel hidden and toggle works",
			"eleven or more template previews and live animation",
			"music fixture downloaded, decoded and inserted in A2",
			"indeterminate import progress visible",
			"media sort buttons: scene and date ascending/descending",
			"effects category buttons filter and reset 22 real filters",
			"workspace layout: full-width tools, timeline-only monitor and inline DarkMiner",
		],
	});
}

module.exports = { report, run };
