import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { cpus, freemem, platform, totalmem } from "node:os";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommandResult = {
	stdout: string;
	stderr: string;
	ok: boolean;
};

function run(executable: string, args: string[], timeoutMs = 15000) {
	return new Promise<CommandResult>((resolve) => {
		const child = spawn(executable, args, {
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk) => {
			stdout = (stdout + chunk).slice(-30000);
		});
		child.stderr?.on("data", (chunk) => {
			stderr = (stderr + chunk).slice(-30000);
		});
		const timer = setTimeout(() => {
			child.kill();
			resolve({ stdout, stderr, ok: false });
		}, timeoutMs);
		child.once("error", () => {
			clearTimeout(timer);
			resolve({ stdout, stderr, ok: false });
		});
		child.once("close", (code) => {
			clearTimeout(timer);
			resolve({ stdout, stderr, ok: code === 0 });
		});
	});
}

function ffmpegPath() {
	const tools = process.env.DARKCUT_VIDEO_TOOLS;
	if (tools) {
		const bundled = join(tools, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
		if (existsSync(bundled)) return bundled;
	}
	return "ffmpeg";
}

async function detectGpuNames() {
	if (process.platform !== "win32") return [] as string[];
	const command =
		"Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name";
	const result = await run(
		"powershell.exe",
		["-NoProfile", "-NonInteractive", "-Command", command],
		10000,
	);
	if (!result.ok) return [];
	return result.stdout
		.split(/\r?\n/)
		.map((value) => value.trim())
		.filter(Boolean);
}

export async function GET() {
	const ffmpeg = ffmpegPath();
	const [encoders, hwaccels, gpuNames] = await Promise.all([
		run(ffmpeg, ["-hide_banner", "-encoders"]),
		run(ffmpeg, ["-hide_banner", "-hwaccels"]),
		detectGpuNames(),
	]);

	const encoderText = `${encoders.stdout}\n${encoders.stderr}`.toLowerCase();
	const accelText = `${hwaccels.stdout}\n${hwaccels.stderr}`.toLowerCase();
	const cpu = cpus()[0]?.model ?? "CPU desconhecida";
	const logicalCores = cpus().length;
	const ramGb = Math.round((totalmem() / 1024 ** 3) * 10) / 10;
	const freeRamGb = Math.round((freemem() / 1024 ** 3) * 10) / 10;

	const capabilities = {
		ffmpeg: encoders.ok || hwaccels.ok,
		h264Qsv: encoderText.includes("h264_qsv"),
		hevcQsv: encoderText.includes("hevc_qsv"),
		h264Nvenc: encoderText.includes("h264_nvenc"),
		hevcNvenc: encoderText.includes("hevc_nvenc"),
		h264Amf: encoderText.includes("h264_amf"),
		hevcAmf: encoderText.includes("hevc_amf"),
		qsv: accelText.includes("qsv"),
		cuda: accelText.includes("cuda"),
		d3d11va: accelText.includes("d3d11va"),
		dxva2: accelText.includes("dxva2"),
	};

	const preferredEncoder = capabilities.h264Qsv
		? "h264_qsv"
		: capabilities.h264Nvenc
			? "h264_nvenc"
			: capabilities.h264Amf
				? "h264_amf"
				: "software";

	const lowPower = logicalCores <= 4 || ramGb <= 12;
	return NextResponse.json({
		ok: true,
		platform: platform(),
		cpu,
		logicalCores,
		ramGb,
		freeRamGb,
		gpuNames,
		ffmpegPath: ffmpeg,
		capabilities,
		recommendation: {
			mode: "auto",
			preferredEncoder,
			previewHeight: lowPower ? 540 : 720,
			proxyHeight: 720,
			maxHeavyJobs: 1,
			useProxies: true,
			useRenderCache: true,
			remotionPreviewFps: lowPower ? 15 : 24,
		},
	});
}
