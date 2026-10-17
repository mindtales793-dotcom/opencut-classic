import { NextResponse } from "next/server";
import { EXPORT_FORMAT_VALUES } from "@/export";
import {
	isFfmpegExportEnabled,
	probeFfmpeg,
} from "@/export/ffmpeg/probe.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tells the editor whether FFmpeg export is available and which encoder
 * (GPU or CPU) was verified with a real test encode.
 */
export async function GET(request: Request) {
	if (!isFfmpegExportEnabled()) {
		return NextResponse.json({
			available: false,
			selected: null,
			tested: [],
			reason: "Disponível apenas no aplicativo para Windows.",
		});
	}

	const { searchParams } = new URL(request.url);
	const format = EXPORT_FORMAT_VALUES.find(
		(value) => value === searchParams.get("format"),
	);
	if (!format) {
		return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
	}

	const result = await probeFfmpeg({
		format,
		refresh: searchParams.get("refresh") === "1",
	});
	return NextResponse.json(result);
}
