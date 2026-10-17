"use client";

import { Player } from "@remotion/player";
import {
	RetroAutomotiveComposition,
} from "@/remotion/retro-automotive-composer";
import type { RetroIntensity, RetroVisualMode } from "@/darkcut/retro-automotive";
import {
	AbsoluteFill,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";

export type DarkCutComposerSceneType =
	| "hook"
	| "context"
	| "list"
	| "number"
	| "emotion"
	| "problem"
	| "solution"
	| "turn"
	| "cta";

export type DarkCutComposerVisualSlot =
	| "default"
	| "location"
	| "date"
	| "number"
	| "quote"
	| "document"
	| "map"
	| "list-item"
	| "conflict"
	| "reveal"
	| "result"
	| "cta";

type ComposerProps = {
	templateTitle: string;
	sceneType: DarkCutComposerSceneType;
	visualSlot: DarkCutComposerVisualSlot;
	overlayText: string;
	summary: string;
};

function DarkCutComposerScene({
	templateTitle,
	sceneType,
	visualSlot,
	overlayText,
	summary,
}: ComposerProps) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const enter = spring({
		frame,
		fps,
		config: { damping: 18, stiffness: 120, mass: 0.8 },
	});
	const opacity = interpolate(frame, [0, 8, 80, 90], [0, 1, 1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const x = interpolate(enter, [0, 1], [80, 0]);
	const scale = interpolate(enter, [0, 1], [0.94, 1]);

	const isNumber = sceneType === "number" || visualSlot === "number";
	const isList = sceneType === "list" || visualSlot === "list-item";
	const isTurn =
		sceneType === "turn" ||
		sceneType === "hook" ||
		visualSlot === "reveal";
	const isLocation = visualSlot === "location" || visualSlot === "map";
	const isDocument = visualSlot === "document" || visualSlot === "quote";

	return (
		<AbsoluteFill
			style={{
				background:
					sceneType === "problem"
						? "linear-gradient(145deg,#140909,#090b11 58%,#111827)"
						: isTurn
							? "linear-gradient(145deg,#170a0a,#0a0d14 52%,#131722)"
							: "linear-gradient(145deg,#080b12,#101521 58%,#0c111c)",
				color: "white",
				fontFamily: "Arial, sans-serif",
				overflow: "hidden",
			}}
		>
			<div
				style={{
					position: "absolute",
					inset: 0,
					backgroundImage:
						"radial-gradient(circle at 20% 20%, rgba(255,255,255,.08), transparent 30%), linear-gradient(120deg, transparent 0 45%, rgba(255,255,255,.035) 45% 46%, transparent 46%)",
					transform: `scale(${1 + frame / 1800})`,
				}}
			/>
			<div
				style={{
					position: "absolute",
					left: 54,
					top: 42,
					fontSize: 18,
					fontWeight: 700,
					letterSpacing: 4,
					opacity: 0.65,
				}}
			>
				DARKCUT • {templateTitle.toUpperCase()}
			</div>
			<div
				style={{
					position: "absolute",
					left: 54,
					right: 54,
					top: isNumber ? 72 : 105,
					transform: `translateX(${x}px) scale(${scale})`,
					opacity,
				}}
			>
				{isLocation && (
					<div
						style={{
							fontSize: 18,
							fontWeight: 800,
							letterSpacing: 6,
							opacity: 0.52,
							marginBottom: 14,
						}}
					>
						LOCALIZAÇÃO • CONTEXTO
					</div>
				)}
				{isDocument && (
					<div
						style={{
							width: 84,
							height: 7,
							borderRadius: 999,
							background: "rgba(255,255,255,.72)",
							marginBottom: 18,
						}}
					/>
				)}
				{isList && (
					<div
						style={{
							fontSize: 36,
							fontWeight: 900,
							opacity: 0.42,
							marginBottom: 12,
						}}
					>
						01
					</div>
				)}
				<div
					style={{
						fontSize: isNumber ? 72 : isTurn ? 54 : 42,
						lineHeight: 1.02,
						fontWeight: 900,
						maxWidth: 760,
						textTransform: isNumber || isTurn ? "uppercase" : "none",
						textShadow: "0 12px 30px rgba(0,0,0,.45)",
					}}
				>
					{overlayText || summary || "Cris Composer"}
				</div>
				{summary && summary !== overlayText && (
					<div
						style={{
							marginTop: 22,
							fontSize: 22,
							lineHeight: 1.35,
							maxWidth: 720,
							opacity: 0.72,
						}}
					>
						{summary}
					</div>
				)}
			</div>
			<div
				style={{
					position: "absolute",
					left: 54,
					bottom: 42,
					width: interpolate(frame, [0, 90], [0, 520], {
						extrapolateRight: "clamp",
					}),
					height: 5,
					borderRadius: 999,
					background: "rgba(255,255,255,.84)",
					opacity: 0.8,
				}}
			/>
		</AbsoluteFill>
	);
}

export function DarkCutRemotionPreview({
	templateTitle,
	sceneType = "hook",
	visualSlot = "default",
	overlayText = "Cris Composer",
	summary = "Motion graphics avançado controlado pelo plano de edição.",
	fps = 15,
	templateId,
	intensity = "normal",
	retroMode = "auto",
}: ComposerProps & {
	fps?: number;
	templateId?: string;
	intensity?: RetroIntensity;
	retroMode?: RetroVisualMode;
}) {
	return (
		<div className="overflow-hidden rounded-lg border bg-black">
			{templateId === "retro-automotive" ? (
				<Player
					component={RetroAutomotiveComposition}
					inputProps={{
						heading: overlayText || summary || "Arquivo Automotivo",
						subtitle: summary || "Investigação · Carros · Comparativo",
						sceneType,
						visualSlot,
						mode: retroMode,
						intensity,
					}}
					durationInFrames={Math.max(60, fps * 6)}
					fps={fps}
					compositionWidth={960}
					compositionHeight={540}
					controls
					loop
					style={{ width: "100%", aspectRatio: "16 / 9" }}
				/>
			) : (
			<Player
				component={DarkCutComposerScene}
				inputProps={{
					templateTitle,
					sceneType,
					visualSlot,
					overlayText,
					summary,
				}}
				durationInFrames={Math.max(60, fps * 6)}
				fps={fps}
				compositionWidth={960}
				compositionHeight={540}
				controls
				loop
				style={{ width: "100%", aspectRatio: "16 / 9" }}
			/>
			)}
		</div>
	);
}
