export const runtime = "nodejs";
export async function POST(request: Request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "JSON inválido." }, { status: 400 });
	}
	if (!body || typeof body !== "object") return Response.json({error:"JSON inválido."},{status:400});
	let input = typeof body.channel === "string" ? body.channel.trim() : "";
	if (input.length > 300)
		return Response.json({ error: "Canal inválido." }, { status: 400 });
	if (/^https?:\/\//.test(input)) {
		try {
			const url = new URL(input);
			if (
				!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
					url.hostname,
				)
			)
				throw new Error();
			input = url.pathname.startsWith("/channel/")
				? url.pathname.split("/")[2]
				: url.pathname.split("/")[1];
		} catch {
			return Response.json(
				{ error: "Informe um link de canal do YouTube." },
				{ status: 400 },
			);
		}
	}
	const field = /^UC[\w-]{22}$/.test(input)
		? "id"
		: input.startsWith("@")
			? "forHandle"
			: null;
	if (!field)
		return Response.json(
			{ error: "Use o ID UC…, @handle ou link do canal." },
			{ status: 400 },
		);
	const keys = Array.isArray(body.keys)
		? body.keys
				.filter((k: unknown) => typeof k === "string" && k.trim())
				.slice(0, 3)
		: [];
	if (!keys.length)
		return Response.json(
			{ error: "Cadastre a chave YouTube em Configurações > APIs." },
			{ status: 400 },
		);
	for (const key of keys) {
		try {
			const params = new URLSearchParams({
				part: "snippet,statistics",
				[field]: input,
				key,
			});
			const response = await fetch(
				`https://www.googleapis.com/youtube/v3/channels?${params}`,
				{ cache: "no-store", signal: AbortSignal.timeout(15000) },
			);
			if (!response.ok) continue;
			const data = await response.json(),
				c = data.items?.[0];
			if (!c)
				return Response.json(
					{ error: "Canal não encontrado." },
					{ status: 404 },
				);
			return Response.json({
				id: c.id,
				name: c.snippet.title,
				description: c.snippet.description,
				thumbnail: c.snippet.thumbnails?.default?.url,
				created: c.snippet.publishedAt,
				subscribers: c.statistics.hiddenSubscriberCount
					? null
					: c.statistics.subscriberCount,
				views: c.statistics.viewCount,
				videos: c.statistics.videoCount,
			});
		} catch {}
	}
	return Response.json(
		{
			error:
				"Não foi possível consultar o canal. Verifique suas chaves e conexão.",
		},
		{ status: 502 },
	);
}
