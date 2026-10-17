/**
 * Pure, quota-free visual search planning and candidate ranking.
 * The source script is never translated word-for-word into a stock query.
 * Keep exact vehicle models; do not silently substitute a different car.
 */
export type MediaSearchPlan = {
	query: string;
	fallbackQuery: string;
	subject: string;
	exactVehicle: boolean;
	reason: string;
};

function normalize(value: string) {
	return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const CARS: Array<[RegExp, string]> = [
	[/\b(?:hb\s?20)\b/, "Hyundai HB20"],
	[/\bonix\b/, "Chevrolet Onix"],
	[/\bcompass\b/, "Jeep Compass"],
	[/\bcorsa\b/, "Chevrolet Corsa"],
	[/\bgol(?:\s+g[1-8])?\b/, "Volkswagen Gol"],
	[/\bpalio\b/, "Fiat Palio"],
	[/\buno\b/, "Fiat Uno"],
	[/\bfiesta\b/, "Ford Fiesta"],
	[/\bfocus\b/, "Ford Focus"],
	[/\bcorolla\b/, "Toyota Corolla"],
	[/\bcivic\b/, "Honda Civic"],
	[/\bkwid\b/, "Renault Kwid"],
	[/\bmobi\b/, "Fiat Mobi"],
	[/\bsandero\b/, "Renault Sandero"],
	[/\bcelta\b/, "Chevrolet Celta"],
	[/\bvoyage\b/, "Volkswagen Voyage"],
	[/\bprisma\b/, "Chevrolet Prisma"],
	[/\bs10\b/, "Chevrolet S10"],
	[/\bstrada\b/, "Fiat Strada"],
	[/\brenegade\b/, "Jeep Renegade"],
	[/\btracker\b/, "Chevrolet Tracker"],
	[/\bcreta\b/, "Hyundai Creta"],
	[/\branger\b/, "Ford Ranger"],
	[/\bhilux\b/, "Toyota Hilux"],
	[/\bskyline(?:\s+gt\s?r)?\s?r?34\b/, "Nissan Skyline GTR R34"],
];

export function carModel(text: string): string | null {
	const normalized = normalize(text);
	return CARS.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
}

const INTENTS: Array<{ pattern: RegExp; query: string; description: string }> = [
	{ pattern: /\b(concessionaria|showroom|loja de carros|vendedor|vitrine)\b/, query: "car dealership showroom", description: "concessionária" },
	{ pattern: /\b(financiar|financiamento|financiei|financiado|parcelas?|juros|divida|credito|emprestimo|banco|contrato|assinou|assinar)\b/, query: "auto loan paperwork", description: "financiamento" },
	{ pattern: /\b(mecanico|oficina|manutencao|conserto|motor|oleo)\b/, query: "auto mechanic workshop", description: "oficina" },
	{ pattern: /\b(segunda mao|usado|seminovo|antigo|velho|quitado)\b/, query: "used car", description: "carro usado" },
	{ pattern: /\b(a vista|dinheiro|economizar|poupanca|salario|reais|preco|comprou|comprar)\b/, query: "car buying cash", description: "compra à vista" },
	{ pattern: /\b(uber|taxi|motorista de aplicativo|corrida)\b/, query: "ride sharing driver", description: "transporte por aplicativo" },
	{ pattern: /\b(onibus|busao|passagem|ponto de onibus)\b/, query: "public bus commute", description: "ônibus" },
	{ pattern: /\b(transito|engarrafamento|avenida|estrada|rodovia)\b/, query: "car city driving traffic", description: "trânsito" },
	{ pattern: /\b(acordar|acordei|manha|madrugada)\b/, query: "person early morning", description: "manhã" },
	{ pattern: /\b(trabalho|clt|empresa|escritorio)\b/, query: "office employee work", description: "trabalho" },
	{ pattern: /\b(casa|quarto|familia)\b/, query: "home family", description: "vida pessoal" },
	{ pattern: /\b(chuva|chovendo)\b/, query: "rainy street", description: "chuva" },
];

const SCENES = [
	{ pattern: /\b(suv|caminhonete|picape)\b/, query: "SUV car driving" },
	{ pattern: /\b(carro|veiculo|automovel|dirigir|volante)\b/, query: "car driving" },
	{ pattern: /\b(documento|contrato|assinou|papel)\b/, query: "document paperwork" },
];

const COMMON = new Set(["para","porque","quando","entao","disse","voce","tinha","estava","seria","podia","assim","muito","ainda","sobre","outro","outra","decidiu","mesmo","fazer","ficou","agora","depois","aquele","aquela","apenas","todos","todas","como","isso","esta","hoje","pelo","pela","com","sem","uma","uns","umas","por","dos","das","seus","suas","nao","mais","menos"]);

function uniquePhrases(input: string[]) {
	return Array.from(new Set(input.map(value=>value.trim()).filter(Boolean)));
}

export function buildMediaSearchPlan(text: string, previousText = ""): MediaSearchPlan {
	const current = normalize(text);
	const previous = normalize(previousText);
	const exact = carModel(current);
	const inherited = exact ? null : carModel(previous);
	const subject = exact ?? (inherited && !/\b(onibus|busao|metro|trem|moto|bicicleta)\b/.test(current) ? inherited : null);
	const intent = INTENTS.find(({ pattern }) => pattern.test(current));
	const scene = SCENES.find(({ pattern }) => pattern.test(current));
	let primary = "";
	let fallback = "";
	let reason = "";
	if (subject) {
		// Keep brand and model intact even when the spoken sentence is abstract.
		primary = uniquePhrases([subject, intent?.query || "car"]).join(" ");
		fallback = uniquePhrases([subject, "car driving"]).join(" ");
		reason = `${subject} · ${intent?.description || "veículo específico"}`;
	} else if (intent) {
		primary = intent.query;
		fallback = scene?.query ?? "documentary real life footage";
		reason = intent.description;
	} else if (scene) {
		primary = scene.query;
		fallback = "cinematic real life footage";
		reason = "ação ou objeto identificado";
	} else {
		// Avoid sending untranslated Portuguese speech as a stock-search term.
		const meaningful = current.split(" ").filter(w=>w.length>=4 && !COMMON.has(w));
		if (meaningful.some(w=>["dinheiro","salario","pagar","paguei"].includes(w))) {
			primary = "personal finance money";
			fallback = "person counting cash";
			reason = "finanças pessoais";
		} else {
			primary = "person thinking cinematic";
			fallback = "everyday life documentary";
			reason = "cena abstrata — sugestão genérica para revisão";
		}
	}
	// Stock sites benefit from shorter queries. Exact model retained to protect context.
	return { query:primary.slice(0,110),fallbackQuery:fallback.slice(0,110),subject:subject ?? "",exactVehicle:!!subject,reason };
}

function tokenize(s:string) {
	return normalize(s).split(" ").filter(w => w.length >= 3 && !COMMON.has(w));
}

export type RankedMediaCandidate = {
	title: string;
	kind?: "image" | "video";
	source?: string;
	id?: string;
};

/** Heuristic score. Not an AI image-understanding confidence probability. */
export function scoreMediaCandidate({
	query,
	title,
	prefer = "video",
}: {
	query:string;
	title:string;
	prefer?: "image" | "video";
}) {
	const expected = tokenize(query);
	const actual = new Set(tokenize(title));
	const matches = expected.filter(w=>actual.has(w)).length;
	const ratio = expected.length ? matches/expected.length : 0;
	const exact = carModel(query);
	const competing = carModel(title);
	if (exact && competing && competing !== exact) return -100;
	const exactBonus = exact && competing === exact ? 10 : 0;
	const junk = /\b(shorts?|reaction|gameplay|review|unboxing|subscribe|podcast|top\s*10)\b/i.test(title) ? 3 : 0;
	return Math.round(ratio*10 + exactBonus - junk);
}

export function sortMediaCandidates<T extends RankedMediaCandidate>(
	candidates:readonly T[],
	query:string,
	options:{prefer?: "video" | "image"; exclude?: ReadonlySet<string>} = {},
):T[] {
	const excluded=options.exclude;
	return candidates.filter(c=>!excluded?.has(`${c.source ?? "youtube"}:${c.kind ?? "video"}:${c.id ?? ""}`))
		.map((c,i)=>({
			c,i,
			score:scoreMediaCandidate({query,title:c.title}) +
				(c.kind=== (options.prefer??"video") ? 2:0),
		}))
		.filter(item => item.score > -90)
		.sort((a,b)=>b.score-a.score || a.i-b.i)
		.map(x=>x.c);
}
