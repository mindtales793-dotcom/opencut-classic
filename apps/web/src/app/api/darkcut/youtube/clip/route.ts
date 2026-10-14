import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClipRequest = {
	query?: unknown;
	durationSeconds?: unknown;
	excludeVideoIds?: unknown;
	youtubeApiKeys?: unknown;
};

type SearchEntry = {
	id: string;
	title: string;
};

type YouTubeSearchResponse = {
	items?: Array<{
		id?: { videoId?: string };
		snippet?: { title?: string };
	}>;
	error?: {
		message?: string;
		errors?: Array<{ reason?: string }>;
	};
};

function runYtDlp(args: string[], timeoutMs = 120_000) {
	return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
		const child = spawn("yt-dlp", args, {
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});

		const timer = setTimeout(() => {
			child.kill();
			reject(new Error("O yt-dlp demorou demais para responder."));
		}, timeoutMs);

		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0) {
				resolve({ stdout, stderr });
			} else {
				reject(
					new Error(
						stderr.trim() ||
							`yt-dlp encerrou com código ${code ?? "desconhecido"}.`,
					),
				);
			}
		});
	});
}

function normalizeApiKeys(value: unknown) {
	if (!Array.isArray(value)) return [];
	return Array.from(
		new Set(
			value
				.filter((key): key is string => typeof key === "string")
				.map((key) => key.trim())
				.filter(Boolean)
				.slice(0, 3),
		),
	);
}

async function searchWithYouTubeApi({
	query,
	apiKeys,
	excluded,
}: {
	query: string;
	apiKeys: string[];
	excluded: Set<string>;
}): Promise<{ entries: SearchEntry[]; keyIndex: number }> {
	let lastError = "A busca do YouTube falhou.";

	for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex += 1) {
		const params = new URLSearchParams({
			part: "snippet",
			type: "video",
			maxResults: "25",
			q: query,
			safeSearch: "moderate",
			key: apiKeys[keyIndex],
		});

		try {
			const response = await fetch(
				`https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
				{ cache: "no-store" },
			);
			const data = (await response.json()) as YouTubeSearchResponse;

			if (!response.ok) {
				const reason = data.error?.errors?.[0]?.reason || "";
				const message = data.error?.message || "Chave recusada pelo YouTube.";
				lastError = message;

				const shouldRotate =
					response.status === 403 ||
					response.status === 429 ||
					/quota|limit|key|forbidden|rate/i.test(`${reason} ${message}`);
				if (shouldRotate) continue;
				continue;
			}

			const entries = (data.items || [])
				.map((item) => ({
					id: item.id?.videoId || "",
					title: item.snippet?.title || "",
				}))
				.filter(
					(entry) =>
						entry.id &&
						/^[a-zA-Z0-9_-]{3,32}$/.test(entry.id) &&
						!excluded.has(entry.id),
				);

			return { entries, keyIndex };
		} catch (error) {
			lastError =
				error instanceof Error ? error.message : "Falha ao acessar o YouTube.";
		}
	}

	throw new Error(
		`Nenhuma das chaves da YouTube Data API respondeu corretamente. ${lastError}`,
	);
}

export async function POST(request: Request) {
	let body: ClipRequest;
	try {
		body = (await request.json()) as ClipRequest;
	} catch {
		return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
	}

	const query = typeof body.query === "string" ? body.query.trim() : "";
	const requestedDuration =
		typeof body.durationSeconds === "number" ? body.durationSeconds : 3;
	const durationSeconds = Math.max(1, Math.min(15, requestedDuration));
	const apiKeys = normalizeApiKeys(body.youtubeApiKeys);
	const excluded = new Set(
		Array.isArray(body.excludeVideoIds)
			? body.excludeVideoIds.filter(
					(value): value is string =>
						typeof value === "string" &&
						/^[a-zA-Z0-9_-]{3,32}$/.test(value),
				)
			: [],
	);

	if (!query) {
		return NextResponse.json(
			{ error: "Informe uma palavra-chave para buscar o vídeo." },
			{ status: 400 },
		);
	}
	if (query.length > 220) {
		return NextResponse.json(
			{ error: "A palavra-chave é longa demais." },
			{ status: 400 },
		);
	}
	if (!apiKeys.length) {
		return NextResponse.json(
			{
				error:
					"Cadastre pelo menos uma chave da YouTube Data API v3 na aba Vídeos com Vídeos.",
			},
			{ status: 400 },
		);
	}

	let workDir = "";
	const attemptedVideoIds: string[] = [];
	let lastDownloadError: unknown = null;

	try {
		const { entries, keyIndex } = await searchWithYouTubeApi({
			query,
			apiKeys,
			excluded,
		});

		if (!entries.length) {
			return NextResponse.json(
				{
					error: "Nenhum outro vídeo foi encontrado para esta busca.",
					exhausted: true,
					attemptedVideoIds,
				},
				{ status: 404 },
			);
		}

		for (const candidate of entries.slice(0, 5)) {
			excluded.add(candidate.id);
			attemptedVideoIds.push(candidate.id);
			const videoUrl = `https://www.youtube.com/watch?v=${candidate.id}`;

			try {
				workDir = await mkdtemp(join(tmpdir(), "darkcut-youtube-"));
				const outputTemplate = join(workDir, "clip.%(ext)s");
				await runYtDlp(
					[
						"--no-playlist",
						"--no-warnings",
						"--download-sections",
						`*0-${durationSeconds}`,
						"--force-keyframes-at-cuts",
						"-f",
						"best[ext=mp4]/best",
						"--merge-output-format",
						"mp4",
						"-o",
						outputTemplate,
						videoUrl,
					],
					180_000,
				);

				const files = (await readdir(workDir)).filter((name) =>
					name.startsWith("clip."),
				);
				const selected =
					files.find((name) => name.endsWith(".mp4")) ?? files[0];
				if (!selected) {
					throw new Error(
						"O download terminou sem gerar um arquivo de vídeo.",
					);
				}

				const bytes = await readFile(join(workDir, selected));
				const safeTitle =
					(candidate.title || `YouTube ${candidate.id}`)
						.replace(/[\r\n"]/g, " ")
						.slice(0, 140) || `YouTube ${candidate.id}`;

				return new Response(bytes, {
					status: 200,
					headers: {
						"Content-Type": selected.endsWith(".mp4")
							? "video/mp4"
							: "application/octet-stream",
						"Cache-Control": "no-store",
						"X-DarkCut-Video-Id": candidate.id,
						"X-DarkCut-Video-Title": encodeURIComponent(safeTitle),
						"X-DarkCut-Tried-Ids": attemptedVideoIds.join(","),
						"X-DarkCut-YouTube-Key": String(keyIndex + 1),
					},
				});
			} catch (error) {
				lastDownloadError = error;
				console.warn(
					`DarkCut YouTube candidate ${candidate.id} failed; trying another result.`,
					error,
				);
			} finally {
				if (workDir) {
					await rm(workDir, { recursive: true, force: true }).catch(
						() => undefined,
					);
					workDir = "";
				}
			}
		}

		const detail =
			lastDownloadError instanceof Error
				? lastDownloadError.message
				: "Os primeiros resultados falharam durante o download.";
		return NextResponse.json(
			{
				error:
					"Não consegui baixar os primeiros resultados automaticamente. Tente novamente para buscar outros candidatos.",
				detail: detail.slice(0, 500),
				attemptedVideoIds,
			},
			{ status: 502 },
		);
	} catch (error) {
		console.error("DarkCut YouTube clip error:", error);
		const message =
			error instanceof Error
				? error.message
				: "Falha ao buscar ou baixar o vídeo.";
		const missingDependency =
			/ENOENT|not found|não foi possível encontrar/i.test(message);
		return NextResponse.json(
			{
				error: missingDependency
					? "O mecanismo interno de vídeos (yt-dlp/FFmpeg) ainda não está disponível neste runtime."
					: message,
				attemptedVideoIds,
			},
			{ status: missingDependency ? 503 : 502 },
		);
	} finally {
		if (workDir) {
			await rm(workDir, { recursive: true, force: true }).catch(
				() => undefined,
			);
		}
	}
}
