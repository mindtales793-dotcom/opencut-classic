import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { EXPORT_MIME_TYPES } from "@/export/mime-types";
import {
	assertEnabled,
	cancelJob,
	describeError,
	getFinishedFile,
	getJob,
} from "@/export/ffmpeg/jobs.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function contentDisposition(filename: string): string {
	const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Streams the finished file from disk, so it never passes through JS memory. */
// eslint-disable-next-line opencut/prefer-object-params -- Next.js route handlers are called as (request, context).
export async function GET(_request: Request, { params }: RouteContext) {
	try {
		assertEnabled();
		const { id } = await params;
		const file = getFinishedFile(getJob(id));
		const info = await stat(file.path);

		// Node's web stream type is structurally the same as the DOM one.
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const body = Readable.toWeb(createReadStream(file.path)) as ReadableStream;
		return new Response(body, {
			headers: {
				"Content-Type": EXPORT_MIME_TYPES[file.format],
				"Content-Length": String(info.size),
				"Content-Disposition": contentDisposition(file.filename),
				"Cache-Control": "no-store",
			},
		});
	} catch (error) {
		const { status, message } = describeError(error);
		return NextResponse.json({ error: message }, { status });
	}
}

/** Cancels the export, stops FFmpeg and deletes the temporary files. */
// eslint-disable-next-line opencut/prefer-object-params -- Next.js route handlers are called as (request, context).
export async function DELETE(_request: Request, { params }: RouteContext) {
	try {
		assertEnabled();
		const { id } = await params;
		await cancelJob(id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		const { status, message } = describeError(error);
		return NextResponse.json({ error: message }, { status });
	}
}
