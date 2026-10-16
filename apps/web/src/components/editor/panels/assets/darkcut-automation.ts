import type { EditorCore } from "@/core";
import { InsertElementCommand } from "@/commands/timeline";
import { buildElementFromMedia, buildTextElement } from "@/timeline/element-utils";
import { mediaTimeFromSeconds, mediaTimeToSeconds, ZERO_MEDIA_TIME } from "@/wasm";

export type DarkCutScene = {
	id: string;
	index: number;
	text: string;
	prompt: string;
	keywords: string[];
	durationSeconds: number;
	status: "ready" | "review" | "missing";
	mediaId?: string;
	mediaName?: string;
};

const STOPWORDS = new Set([
	"a","o","as","os","um","uma","uns","umas","de","da","do","das","dos","e","em","no","na","nos","nas",
	"para","por","com","sem","que","se","ao","aos","à","às","é","foi","ser","como","mais","menos","muito",
	"muita","muitos","muitas","você","voce","eu","ele","ela","eles","elas","isso","isto","esse","essa",
]);

function normalizeSentence(text: string) {
	return text.replace(/\s+/g, " ").trim();
}

function extractKeywords(text: string, limit = 6) {
	const counts = new Map<string, number>();
	for (const raw of text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) ?? []) {
		if (raw.length < 3 || STOPWORDS.has(raw)) continue;
		counts.set(raw, (counts.get(raw) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, limit)
		.map(([word]) => word);
}


const VISUAL_TERM_RULES: Array<{ test: RegExp; terms: string[] }> = [
	{ test: /\b(acordei|acordar|acordou|levant(ei|ar|ou))\b/, terms: ["waking up", "bedroom"] },
	{ test: /\b(cinco horas|5 horas|madrugada|amanhecer|cedo|de manha|manhã)\b/, terms: ["early morning", "sunrise"] },
	{ test: /\b(noite|noturno|anoitecer)\b/, terms: ["night", "city lights"] },
	{ test: /\b(gripado|gripe|resfriado|doente|febre|febril)\b/, terms: ["sick person", "in bed"] },
	{ test: /\b(frio|gelado|fria|inverno)\b/, terms: ["cold weather", "winter"] },
	{ test: /\b(chuva|chovendo|chuvoso)\b/, terms: ["rainy weather"] },
	{ test: /\b(calor|quente|ensolarado|sol forte)\b/, terms: ["hot sunny weather"] },
	{ test: /\b(sao paulo|são paulo)\b/, terms: ["Sao Paulo", "city"] },
	{ test: /\b(rio de janeiro)\b/, terms: ["Rio de Janeiro", "city"] },
	{ test: /\b(onibus|ônibus|busao|busão)\b/, terms: ["commuting by bus"] },
	{ test: /\b(metro|metrô)\b/, terms: ["subway commute"] },
	{ test: /\b(trabalho|trabalhar|empresa|escritorio|escritório)\b/, terms: ["going to work", "office worker"] },
	{ test: /\b(carro|dirigindo|dirigir|motorista)\b/, terms: ["driving car"] },
	{ test: /\b(transito|trânsito|engarrafamento)\b/, terms: ["city traffic"] },
	{ test: /\b(dinheiro|salario|salário|pagamento)\b/, terms: ["money", "personal finance"] },
	{ test: /\b(banco|agencia bancaria|agência bancária)\b/, terms: ["bank building"] },
	{ test: /\b(casa|apartamento|quarto)\b/, terms: ["home interior"] },
	{ test: /\b(rua|avenida|cidade|centro)\b/, terms: ["city street"] },
	{ test: /\b(celular|telefone|smartphone)\b/, terms: ["using smartphone"] },
	{ test: /\b(computador|notebook|pc)\b/, terms: ["using laptop"] },
	{ test: /\b(comer|almoco|almoço|jantar|cafe da manha|café da manhã)\b/, terms: ["eating meal"] },
	{ test: /\b(mercado|supermercado|compras)\b/, terms: ["grocery shopping"] },
	{ test: /\b(hospital|medico|médico|consulta)\b/, terms: ["hospital", "doctor visit"] },
];

const VISUAL_WORD_MAP: Record<string, string> = {
	homem: "man",
	mulher: "woman",
	pessoa: "person",
	familia: "family",
	família: "family",
	crianca: "child",
	criança: "child",
	jovem: "young adult",
	idoso: "elderly person",
	dormindo: "sleeping",
	correndo: "running",
	andando: "walking",
	caminhando: "walking",
	esperando: "waiting",
	comprando: "shopping",
	vendendo: "selling",
	pagando: "paying",
	estudando: "studying",
	estudar: "studying",
	escola: "school",
	faculdade: "university",
	chuva: "rain",
	neve: "snow",
	praia: "beach",
	campo: "countryside",
	fabrica: "factory",
	fábrica: "factory",
	loja: "store",
	concessionaria: "car dealership",
	concessionária: "car dealership",
};

function normalizeVisualText(text: string) {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function buildVisualSearchQuery(text: string) {
	const normalized = normalizeVisualText(text);
	const terms: string[] = [];

	for (const rule of VISUAL_TERM_RULES) {
		if (rule.test.test(normalized)) terms.push(...rule.terms);
	}

	for (const token of normalized.split(" ")) {
		const mapped = VISUAL_WORD_MAP[token];
		if (mapped) terms.push(mapped);
	}

	const unique = Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean)));
	if (unique.length) return unique.slice(0, 6).join(" ");

	const fallback = extractKeywords(text, 4)
		.map((word) => VISUAL_WORD_MAP[word] ?? word)
		.filter(Boolean);
	return fallback.join(" ");
}

function visualPrompt(text: string, keywords: string[]) {
	const subject = keywords.slice(0, 4).join(", ");
	return [
		"Cena documental cinematográfica para vídeo do YouTube.",
		subject ? `Elementos principais: ${subject}.` : "",
		`Representar visualmente: ${text}`,
		"Composição clara, assunto principal evidente, sem texto sobreposto, sem logotipos, proporção 16:9.",
	]
		.filter(Boolean)
		.join(" ");
}

export function buildDarkCutScenes({
	script,
	sceneSeconds,
}: {
	script: string;
	sceneSeconds: number;
}): DarkCutScene[] {
	const clean = normalizeSentence(script);
	if (!clean) return [];

	const sentences = clean
		.split(/(?<=[.!?])\s+|\n+/)
		.map(normalizeSentence)
		.filter(Boolean);

	const targetWords = Math.max(8, Math.round(sceneSeconds * 2.4));
	const blocks: string[] = [];
	let current: string[] = [];
	let words = 0;

	for (const sentence of sentences.length ? sentences : [clean]) {
		const sentenceWords = sentence.split(/\s+/).filter(Boolean).length;
		if (current.length && words + sentenceWords > targetWords * 1.45) {
			blocks.push(current.join(" "));
			current = [];
			words = 0;
		}
		current.push(sentence);
		words += sentenceWords;
		if (words >= targetWords) {
			blocks.push(current.join(" "));
			current = [];
			words = 0;
		}
	}
	if (current.length) blocks.push(current.join(" "));

	return blocks.map((text, index) => {
		const keywords = extractKeywords(text);
		return {
			id: `scene-${index + 1}`,
			index: index + 1,
			text,
			prompt: visualPrompt(text, keywords),
			keywords,
			durationSeconds: sceneSeconds,
			status: "missing" as const,
		};
	});
}

export function autoAssignLibraryMedia({
	scenes,
	editor,
}: {
	scenes: DarkCutScene[];
	editor: EditorCore;
}) {
	const visual = editor.media
		.getAssets()
		.filter((asset) => !asset.ephemeral && (asset.type === "image" || asset.type === "video"));

	if (visual.length === 0) {
		return scenes.map((scene) => ({ ...scene, status: "missing" as const, mediaId: undefined, mediaName: undefined }));
	}

	const unused = [...visual];
	return scenes.map((scene, index) => {
		const sceneTerms = new Set(scene.keywords.map((word) => word.toLowerCase()));
		let bestIndex = -1;
		let bestScore = -1;

		for (let i = 0; i < unused.length; i += 1) {
			const asset = unused[i];
			const haystack = asset.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
			const score = [...sceneTerms].reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
			if (score > bestScore) {
				bestScore = score;
				bestIndex = i;
			}
		}

		const fallbackIndex = index % visual.length;
		const asset = bestIndex >= 0 ? unused.splice(bestIndex, 1)[0] : visual[fallbackIndex];
		if (!asset) return { ...scene, status: "missing" as const };

		return {
			...scene,
			mediaId: asset.id,
			mediaName: asset.name,
			status: bestScore > 0 ? ("ready" as const) : ("review" as const),
		};
	});
}

export function assembleScenesOnTimeline({
	scenes,
	editor,
	addCaptions,
}: {
	scenes: DarkCutScene[];
	editor: EditorCore;
	addCaptions: boolean;
}) {
	const media = editor.media.getAssets();
	let cursorSeconds = mediaTimeToSeconds({ time: editor.timeline.getTotalDuration() });
	let inserted = 0;

	for (const scene of scenes) {
		const asset = media.find((item) => item.id === scene.mediaId);
		if (!asset || (asset.type !== "image" && asset.type !== "video")) continue;

		const durationSeconds =
			asset.type === "video" && asset.duration
				? Math.max(0.5, Math.min(scene.durationSeconds, asset.duration))
				: scene.durationSeconds;
		const startTime = mediaTimeFromSeconds({ seconds: cursorSeconds });
		const duration = mediaTimeFromSeconds({ seconds: durationSeconds });

		editor.command.execute({
			command: new InsertElementCommand({
				element: buildElementFromMedia({
					mediaId: asset.id,
					mediaType: asset.type,
					name: asset.name,
					duration,
					startTime,
				}),
				placement: { mode: "auto", trackType: "video" },
			}),
		});

		if (addCaptions && scene.text.trim()) {
			const caption = buildTextElement({
				raw: {
					name: `Cena ${scene.index}`,
					duration,
					params: { content: scene.text },
				},
				startTime,
			});
			editor.command.execute({
				command: new InsertElementCommand({
					element: caption,
					placement: { mode: "auto", trackType: "text" },
				}),
			});
		}

		cursorSeconds += durationSeconds;
		inserted += 1;
	}

	return inserted;
}

export function addNarrationAssetToTimeline({
	mediaId,
	editor,
}: {
	mediaId: string;
	editor: EditorCore;
}) {
	const asset = editor.media.getAssets().find((item) => item.id === mediaId);
	if (!asset || asset.type !== "audio") {
		throw new Error("Narração não encontrada na biblioteca.");
	}
	if (!asset.duration || asset.duration <= 0) {
		throw new Error("Não foi possível medir a duração da narração.");
	}

	const scene = editor.scenes.getActiveScene();
	const narrationTrack =
		scene.tracks.audio.find((track) => track.name === "A1 • Narração") ??
		null;
	const narrationTrackId =
		narrationTrack?.id ??
		editor.timeline.addTrack({
			type: "audio",
			name: "A1 • Narração",
		});

	editor.command.execute({
		command: new InsertElementCommand({
			element: buildElementFromMedia({
				mediaId: asset.id,
				mediaType: "audio",
				name: asset.name,
				duration: mediaTimeFromSeconds({ seconds: asset.duration }),
				startTime: ZERO_MEDIA_TIME,
			}),
			placement: { mode: "explicit", trackId: narrationTrackId },
		}),
	});

	return asset.duration;
}

export function downloadFlowZikaQueue(scenes: DarkCutScene[]) {
	const rows = scenes.map((scene) => scene.prompt);
	const blob = new Blob([rows.join("\n")], { type: "text/plain;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = "darkcut-flowzika-prompts.txt";
	link.click();
	URL.revokeObjectURL(url);
}
