import { NextResponse } from "next/server";
import {
	ExportRequestError,
	assertEnabled,
	describeError,
	finishJob,
	getJob,
	pushFrames,
	saveAudio,
} from "@/export/ffmpeg/jobs.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; action: string }> };

/**
 * POST /api/darkcut/export/:id/audio   body: WAV file
 * POST /api/darkcut/export/:id/frames  body: N raw frames, back to back
 * POST /api/darkcut/export/:id/finish  closes the stream and waits for FFmpeg
 */
// eslint-disable-next-line opencut/prefer-object-params -- Next.js route handlers are called as (request, context).
export async function POST(request: Request, { params }: RouteContext) {
	try {
		assertEnabled();
		const { id, action } = await params;
		const job = getJob(id);

		if (action === "audio") {
			await saveAudio({
				job,
				data: Buffer.from(await request.arrayBuffer()),
			});
			return NextResponse.json({ ok: true });
		}

		if (action === "frames") {
			const framesWritten = await pushFrames({
				job,
				data: Buffer.from(await request.arrayBuffer()),
			});
			return NextResponse.json({ framesWritten });
		}

		if (action === "finish") {
			const { size, verified } = await finishJob({ job });
			return NextResponse.json({
				size,
				verified,
				downloadUrl: `/api/darkcut/export/${job.id}`,
			});
		}

		throw new ExportRequestError(404, "Ação desconhecida.");
	} catch (error) {
		const { status, message } = describeError(error);
		return NextResponse.json({ error: message }, { status });
	}
}
