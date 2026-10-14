import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClipRequest = {
	query?: unknown;
	durationSeconds?: unknown;
	excludeVideoIds?: unknown;
};

type SearchEntry = {
	id?: string;
	title?: string;
	webpage_url?: string;
	url?: string;
	duration?: number;
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
						stderr.trim() || `yt-dlp encerrou com código ${code ?? "desconhecido"}.`,
					),
				);
			}
		});
	});
}

async function findCandidate({
	query,
	excluded,
}: {
	query: string;
	excluded: Set<string>;
}) {
	const { stdout } = await runYtDlp([
		"--dump-single-json",
		"--flat-playlist",
		"--no-warnings",
		"--playlist-end",
		"12",
		`ytsearch12:${query}`,
	]);

	const parsed = JSON.parse(stdout) as { entries?: SearchEntry[] };
	const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
	return (
		entries.find((entry) => {
			const id = typeof entry.id === "string" ? entry.id : "";
			return id && !excluded.has(id);
		}) ?? null
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
	const excluded = new Set(
		Array.isArray(body.excludeVideoIds)
			? body.excludeVideoIds.filter(
					(value): value is string =>
						typeof value === "string" && /^[a-zA-Z0-9_-]{3,32}$/.test(value),
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

	let workDir = "";
	const attemptedVideoIds: string[] = [];
	let lastDownloadError: unknown = null;

	try {
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const candidate = await findCandidate({ query, excluded });
			if (!candidate?.id) {
				return NextResponse.json(
					{
						error:
							attemptedVideoIds.length > 0
								? "Os resultados encontrados falharam e não há outro vídeo disponível para esta busca."
								: "Nenhum outro vídeo foi encontrado para esta busca.",
						exhausted: true,
						attemptedVideoIds,
					},
					{ status: 404 },
				);
			}

			excluded.add(candidate.id);
			attemptedVideoIds.push(candidate.id);
			const videoUrl =
				typeof candidate.webpage_url === "string" && candidate.webpage_url
					? candidate.webpage_url
					: `https://www.youtube.com/watch?v=${candidate.id}`;

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

		const message =
			lastDownloadError instanceof Error
				? lastDownloadError.message
				: "Os primeiros resultados falharam durante o download.";
		return NextResponse.json(
			{
				error:
					"Não consegui baixar os primeiros resultados automaticamente. Você pode tentar novamente ou alterar a palavra-chave.",
				detail: message.slice(0, 500),
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
