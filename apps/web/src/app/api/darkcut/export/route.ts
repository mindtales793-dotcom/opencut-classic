import { NextResponse } from "next/server";
import {
	createJob,
	describeError,
	parseStartRequest,
} from "@/export/ffmpeg/jobs.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Creates an export job. Frames are streamed to it afterwards. */
export async function POST(request: Request) {
	try {
		const body: unknown = await request.json().catch(() => null);
		const job = await createJob(parseStartRequest(body));
		return NextResponse.json(job);
	} catch (error) {
		const { status, message } = describeError(error);
		return NextResponse.json({ error: message }, { status });
	}
}
