"use client";

import { Player } from "@remotion/player";
import {
	AbsoluteFill,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import { RetroAutomotiveComposition } from "@/remotion/retro-automotive-composer";
import type { RetroIntensity, RetroVisualMode } from "@/darkcut/retro-automotive";
import { describeTemplateScene } from "@/darkcut/template-visual-profiles";
import type { CrisSceneType, CrisVisualSlot } from "@/darkcut/cris";

type ComposerProps = {
	templateTitle: string;
	templateId: string;
	sceneType: CrisSceneType;
	visualSlot: CrisVisualSlot;
	overlayText: string;
	summary: string;
	intensity: RetroIntensity;
};

function UniversalComposer({
	templateTitle,
	templateId,
	sceneType,
	visualSlot,
	overlayText,
	summary,
	intensity,
}: ComposerProps) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const visual = describeTemplateScene({
		profileId: templateId, sceneType, visualSlot, intensity,
	});
	const style = visual.profile;
	const motion = intensity === "strong" ? 1.4 : intensity === "soft" ? 0.6 : 1;
	const enter = spring({
		frame, fps, config: { damping: 20, stiffness: 120, mass: 0.85 },
	});
	const fade = interpolate(frame, [0, 10, 82, 90], [0, 1, 1, 0], {
		extrapolateLeft: "clamp", extrapolateRight: "clamp",
	});
	const offset = interpolate(enter, [0, 1], [65 * motion, 0]);
	const zoom = interpolate(frame, [0, 90], [1, 1 + 0.045 * motion], {
		extrapolateRight: "clamp",
	});
	const heading = (overlayText || summary || templateTitle).slice(0, 78);
	const secondary = summary !== heading ? summary.slice(0, 110) : "";
	const isGrid = style.family === "archive" || style.family === "explainer";
	return (
		<AbsoluteFill style={{
			background: `linear-gradient(125deg,${style.background},#090b0e 95%)`,
			color: style.foreground, fontFamily: "Arial, sans-serif",
			overflow: "hidden",
		}}>
			<AbsoluteFill style={{
				backgroundImage: isGrid
					? `linear-gradient(${style.accent}21 1px,transparent 1px),linear-gradient(90deg,${style.accent}21 1px,transparent 1px)`
					: "radial-gradient(circle at 78% 28%,#ffffff0a,transparent 32%),linear-gradient(110deg,transparent 25%,#ffffff08 26%,transparent 28%)",
				backgroundSize: isGrid ? "42px 42px" : "100% 100%",
				opacity: 0.55,
				transform: `scale(${zoom})`,
			}} />
			{style.family === "cinema" && (
				<div style={{
					position: "absolute", inset: 40, border: `2px solid ${style.accent}63`,
					boxShadow: `inset 0 0 90px ${style.accent}1a`,
					transform: `scale(${zoom})`,
				}} />
			)}
			{style.family === "social" && (
				<div style={{
					position: "absolute", width: 520, height: 520, right: -170,
					top: -175, borderRadius: "50%",
					border: `28px solid ${style.accent}2b`,
					transform: `scale(${zoom})`,
				}} />
			)}
			{visual.isComparison && (
				<div style={{
					display: "flex", gap: 16, position: "absolute",
					left: 50, right: 50, top: 125, bottom: 100,
					opacity: 0.48 * fade,
					transform: `translateY(${offset}px)`,
				}}>
					{["OPÇÃO A / ANTES", "OPÇÃO B / DEPOIS"].map((label, index) => (
						<div key={label} style={{
							flex: 1, background: index === 0 ? style.accent + "19" : "#ffffff08",
							border: `3px solid ${index === 0 ? style.accent : style.foreground + "69"}`,
							padding: 20, display: "flex", alignItems: "end",
							fontWeight: 800, fontSize: 19, letterSpacing: 2,
						}}>{label}</div>
					))}
				</div>
			)}
			{visual.isLocation && (
				<svg viewBox="0 0 960 540" width="960" height="540"
					style={{ position: "absolute", inset: 0, opacity: 0.52 * fade }}>
					<path
						d="M85 380L190 245L317 290L410 180L525 241L670 125L810 210L890 116"
						stroke={style.accent} strokeWidth="6" fill="none"
						strokeDasharray="17 12"
						strokeDashoffset={interpolate(enter, [0, 1], [300, 0])}
					/>
					{[[85,380],[410,180],[670,125],[890,116]].map(([cx,cy], i) => (
						<circle key={i} cx={cx} cy={cy} r="11" fill={style.accent}
							stroke={style.foreground} strokeWidth="4"/>
					))}
				</svg>
			)}
			{visual.isDocument && (
				<div style={{
					position: "absolute", right: 68, top: 130,
					width: 226, height: 272, padding: 14,
					background: style.card, opacity: .35,
					borderTop: `15px solid ${style.accent}`,
					boxShadow: "12px 15px 0 #0008",
					transform: `rotate(${3 * motion}deg)`,
				}}>
					{[90,70,100,55,86,60].map((width, i) => (
						<div key={i} style={{
							marginTop: 16, width: `${width}%`, height: 8,
							background: style.cardText, opacity: 0.3,
						}} />
					))}
				</div>
			)}
			{visual.isList && (
				<div style={{
					position: "absolute", right: 52, top: 100,
					fontWeight: 900, color: style.accent,
					fontSize: 220, opacity: .2, letterSpacing: -18,
				}}>01</div>
			)}
			<div style={{
				position: "absolute", top: 44, left: 55, right: 55,
				display: "flex", alignItems: "center", justifyContent: "space-between",
			}}>
				<span style={{ fontSize: 18, fontWeight: 900, letterSpacing: 3 }}>
					DARKCUT · {templateTitle.toUpperCase()}
				</span>
				<span style={{
					background: style.accent, color: "#101010", padding: "9px 14px",
					fontSize: 16, fontWeight: 900, letterSpacing: 2,
				}}>{visual.label}</span>
			</div>
			<div style={{
				position: "absolute", left: 57, right: 65,
				top: visual.isNumber ? 145 : 155,
				opacity: fade,
				transform: `translateX(${offset}px) scale(${zoom})`,
			}}>
				<div style={{
					width: 66, height: 7, marginBottom: 22,
					background: style.accent,
				}} />
				<div style={{
					maxWidth: visual.isComparison ? 790 : 825,
					fontSize: visual.fontSize,
					fontWeight: 900, lineHeight: 1.08,
					overflowWrap: "anywhere",
					color: visual.isNumber || visual.isHook ? style.accent : style.foreground,
					textShadow: "0 8px 24px #000a",
				}}>{heading}</div>
				{secondary && (
					<div style={{
						fontSize: 23, opacity: .85, maxWidth: 820,
						marginTop: 20, lineHeight: 1.4,
						textShadow: "0 5px 18px #0009",
					}}>{secondary}</div>
				)}
			</div>
			<div style={{
				position: "absolute", left: 54, bottom: 38,
				width: interpolate(frame, [0, 90], [0, 590], {
					extrapolateRight: "clamp",
				}),
				height: 5, borderRadius: 8,
				background: style.accent,
			}}/>
		</AbsoluteFill>
	);
}

export function DarkCutRemotionPreview({
	templateTitle,
	sceneType = "hook",
	visualSlot = "default",
	overlayText = "Cris Composer",
	summary = "Animações editáveis conforme o roteiro",
	fps = 15,
	templateId = "documentary",
	intensity = "normal",
	retroMode = "auto",
}: Omit<ComposerProps, "templateId" | "intensity"> & {
	fps?: number;
	templateId?: string;
	intensity?: RetroIntensity;
	retroMode?: RetroVisualMode;
}) {
	const isRetro = templateId === "retro-automotive";
	return (
		<div className="overflow-hidden rounded-lg border bg-black">
			{isRetro ? (
				<Player
					component={RetroAutomotiveComposition}
					inputProps={{
						heading: overlayText || summary || "Arquivo Automotivo",
						subtitle: summary || "Investigação • dados • comparações",
						sceneType, visualSlot, mode: retroMode, intensity,
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
					component={UniversalComposer}
					inputProps={{
						templateTitle, templateId, sceneType, visualSlot,
						overlayText, summary, intensity,
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
