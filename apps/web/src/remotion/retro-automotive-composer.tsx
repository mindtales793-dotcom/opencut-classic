"use client";

import type { CSSProperties, ReactNode } from "react";
import {
	AbsoluteFill,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import {
	RETRO_COLORS,
	resolveRetroVisual,
	type RetroIntensity,
	type RetroVisualMode,
} from "@/darkcut/retro-automotive";
import type { CrisSceneType, CrisVisualSlot } from "@/darkcut/cris";

export type RetroAutomotiveProps = {
	heading: string;
	subtitle: string;
	sceneType: CrisSceneType;
	visualSlot: CrisVisualSlot;
	mode: RetroVisualMode;
	intensity: RetroIntensity;
};

const paper = RETRO_COLORS.paper;
const ink = RETRO_COLORS.ink;
const red = RETRO_COLORS.red;
const gold = RETRO_COLORS.gold;
const sans = "'Arial Narrow', Impact, Arial, sans-serif";
const mono = "'Courier New', Courier, monospace";
const grid = `linear-gradient(to right, ${RETRO_COLORS.grid} 1px, transparent 1px),
	linear-gradient(to bottom, ${RETRO_COLORS.grid} 1px, transparent 1px)`;

function useMotion(intensity: RetroIntensity) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const amount = intensity === "soft" ? 0.56 : intensity === "strong" ? 1.4 : 1;
	const enter = spring({
		frame: Math.max(0, frame - 1),
		fps,
		config: { damping: 21, stiffness: 135, mass: 0.9 },
	});
	const opacity = interpolate(frame, [0, 7, 76, 89], [0, 1, 1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	return {
		frame, amount, enter, opacity,
		x: interpolate(enter, [0, 1], [64 * amount, 0]),
		y: interpolate(enter, [0, 1], [70 * amount, 0]),
		zoom: interpolate(frame, [0, 90], [1, 1 + amount * 0.038], {
			extrapolateRight: "clamp",
		}),
	};
}

function PageGrid({ dark = false }: { dark?: boolean }) {
	return (
		<AbsoluteFill
			style={{
				background: dark ? "#161918" : paper,
				backgroundImage: grid,
				backgroundSize: "42px 42px",
				opacity: dark ? 0.16 : 0.28,
			}}
		/>
	);
}

function Label({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
	return (
		<div
			style={{
				fontFamily: mono, fontWeight: 800, textTransform: "uppercase",
				letterSpacing: 3, fontSize: 19,
				color: dark ? paper : ink,
			}}
		>
			{children}
		</div>
	);
}

function CarOutline({ color = ink }: { color?: string }) {
	return (
		<svg viewBox="0 0 540 244" style={{ width: "100%", height: "100%" }} fill="none">
			<path d="M39 162 Q48 145 86 138 L142 129 184 67 Q206 44 258 42 L388 48 Q432 52 457 91 L481 131 Q516 145 520 166 L520 191 40 191Z" stroke={color} strokeWidth={8} strokeLinejoin="round" />
			<path d="M180 131L208 79 269 74 277 131ZM298 131L295 75 390 81Q410 85 426 117L432 131Z" stroke={color} strokeWidth={6}/>
			<circle cx="132" cy="189" r="37" fill={paper} stroke={color} strokeWidth={10}/>
			<circle cx="422" cy="189" r="37" fill={paper} stroke={color} strokeWidth={10}/>
			<path d="M49 154L80 149M486 152L510 155" stroke={color} strokeWidth={12} strokeLinecap="round"/>
			<path d="M278 132L289 191" stroke={color} strokeWidth={4}/>
		</svg>
	);
}

function FileCard({ heading, subtitle, intensity }: RetroAutomotiveProps) {
	const { opacity, y, zoom } = useMotion(intensity);
	return (
		<AbsoluteFill style={{ background: "#25241e", overflow: "hidden" }}>
			<PageGrid dark />
			<div style={{ position: "absolute", inset: 42, background: paper, transform: `translateY(${y}px) scale(${zoom})`, opacity, border: `3px solid ${ink}`, boxShadow: "20px 22px 0 #070807" }}>
				<PageGrid/>
				<div style={{ position: "absolute", top: -2, left: 45, padding: "12px 35px", background: gold, border: `2px solid ${ink}`, font: `bold 22px ${mono}` }}>ARQUIVO / FILE 001</div>
				<div style={{ position: "absolute", top: 100, left: 56, right: 50 }}>
					<div style={{ color: red, font: `900 63px/1 ${sans}`, textTransform: "uppercase", overflowWrap: "anywhere" }}>{heading.slice(0, 65)}</div>
					<div style={{ height: 4, background: ink, width: "100%", margin: "24px 0 18px" }}/>
					<p style={{ font: `bold 25px/1.3 ${mono}`, color: ink, margin: 0 }}>{subtitle.slice(0, 132)}</p>
				</div>
				<div style={{ position: "absolute", right: 46, bottom: 27, color: red, border: `4px double ${red}`, transform: "rotate(-9deg)", padding: 10, font: `900 25px ${mono}` }}>DOCUMENTADO</div>
			</div>
		</AbsoluteFill>
	);
}

function Impact({ heading, subtitle, intensity }: RetroAutomotiveProps) {
	const { opacity, enter, amount } = useMotion(intensity);
	const zoom = interpolate(enter, [0, 1], [0.77, 1]);
	return (
		<AbsoluteFill style={{ background: "#151617", color: paper, overflow: "hidden" }}>
			<PageGrid dark />
			<div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", transform: `scale(${1 + (zoom - 1) * amount})`, opacity }}>
				<Label dark>O DADO QUE MUDA TUDO</Label>
				<div style={{ width: 3, height: 54, background: red, margin: "17px 0" }}/>
				<div style={{ color: "#d62d2d", font: `900 112px/.95 ${sans}`, letterSpacing: -3, textTransform: "uppercase", textAlign: "center", maxWidth: 900, overflowWrap: "anywhere" }}>
					{heading.slice(0, 42)}
				</div>
				<p style={{ font: `bold 26px ${mono}`, letterSpacing: 2, color: paper, textAlign: "center", maxWidth: 800 }}>{subtitle.slice(0, 100)}</p>
			</div>
			<div style={{ position: "absolute", bottom: 30, left: 36, right: 36, height: 2, background: gold }}/>
		</AbsoluteFill>
	);
}

function Comparison({ heading, subtitle, intensity }: RetroAutomotiveProps) {
	const { opacity, amount, enter } = useMotion(intensity);
	const offset = interpolate(enter, [0, 1], [100 * amount, 0]);
	return (
		<AbsoluteFill style={{ background: paper, padding: 42, color: ink }}>
			<PageGrid/>
			<Label>COMPARATIVO · DUAS ESCOLHAS</Label>
			<h1 style={{ font: `900 52px/1 ${sans}`, margin: "14px 0 20px", maxWidth: 870, textTransform: "uppercase" }}>{heading.slice(0, 65)}</h1>
			<div style={{ display: "flex", flex: 1, gap: 17, opacity }}>
				<div style={{ flex: 1, border: `4px solid ${ink}`, padding: 26, background: "#e9dfc7", transform: `translateX(${-offset}px)` }}>
					<Label>OPÇÃO A · ANTES</Label>
					<div style={{ height: 168, marginTop: 12, display: "flex", alignItems: "center" }}><CarOutline/></div>
					<div style={{ background: ink, height: 9, width: "80%", marginTop: 7 }}/>
				</div>
				<div style={{ flex: 1, border: `4px solid ${red}`, padding: 26, background: "#fff9eb", transform: `translateX(${offset}px)` }}>
					<Label>OPÇÃO B · DEPOIS</Label>
					<div style={{ height: 168, marginTop: 12, display: "flex", alignItems: "center" }}><CarOutline color={red}/></div>
					<div style={{ background: red, height: 9, width: "60%", marginTop: 7 }}/>
				</div>
			</div>
			<p style={{ font: `bold 22px ${mono}`, margin: "16px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle.slice(0, 100)}</p>
		</AbsoluteFill>
	);
}

function Evidence({ heading, subtitle, intensity }: RetroAutomotiveProps) {
	const { opacity, enter, amount } = useMotion(intensity);
	const progress = interpolate(enter, [0, 1], [0, 1]);
	const entries = ["DOCUMENTO A", "EVIDÊNCIA B", "CONSEQUÊNCIA C"];
	return (
		<AbsoluteFill style={{ background: "#222323", padding: "40px 55px", color: paper }}>
			<PageGrid dark/>
			<Label dark>PAINEL INVESTIGATIVO</Label>
			<div style={{ font: `900 64px/1 ${sans}`, color: gold, marginTop: 15, textTransform: "uppercase" }}>{heading.slice(0, 65)}</div>
			<svg viewBox="0 0 860 265" style={{ position: "absolute", top: 170, left: 55, width: 860, height: 265 }} fill="none">
				<path d="M150 90L430 45L705 90M430 45L430 210" stroke={red} strokeWidth="5" strokeDasharray="14 8" strokeDashoffset={(1 - progress) * 320 * amount}/>
				{[[150,90],[430,45],[705,90],[430,210]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r={10} fill={gold} stroke={red} strokeWidth="4"/>)}
			</svg>
			<div style={{ position: "absolute", left: 60, right: 60, top: 218, display: "flex", justifyContent: "space-between", gap: 20, opacity }}>
				{entries.map((item,index)=>(
					<div key={item} style={{ width: 250, padding: 17, background: paper, color: ink, borderTop: `9px solid ${index === 1 ? gold : red}`, boxShadow: "8px 10px 0 #080808" }}>
						<div style={{ font: `900 32px ${sans}`, color: red }}>0{index+1}</div>
						<div style={{ font: `bold 20px ${mono}` }}>{item}</div>
						<div style={{ height: 48, marginTop: 15, backgroundImage: grid, backgroundSize: "14px 14px" }}/>
					</div>
				))}
			</div>
			<div style={{ position: "absolute", left: 60, right: 60, bottom: 18, font: `bold 22px ${mono}`, opacity: .82 }}>{subtitle.slice(0, 90)}</div>
		</AbsoluteFill>
	);
}

function MapPanel({ heading, subtitle, intensity }: RetroAutomotiveProps) {
	const { opacity, frame, amount } = useMotion(intensity);
	const pathProgress = Math.min(1, frame / (26 / amount));
	return (
		<AbsoluteFill style={{ background: "#242723", color: paper, padding: 44 }}>
			<PageGrid dark/>
			<Label dark>MAPA DE CONTEXTO · TRAJETO ILUSTRATIVO</Label>
			<svg viewBox="0 0 880 340" style={{ position: "absolute", top: 115, left: 40, width: 880, height: 340, opacity }} fill="none">
				<path d="M75 252L113 186L159 202L206 151L229 93L291 103L341 60L402 99L460 54L513 99L553 151L631 121L660 181L723 155L805 221L770 300L689 270L595 307L541 247L461 280L371 247L270 289L184 259L106 301Z" stroke={gold} strokeWidth="3" strokeLinejoin="round" fill="#45463c"/>
				<path d="M105 252Q270 98 410 215T776 139" stroke="#d42b2b" strokeWidth="8" strokeDasharray="15 12" strokeDashoffset={(1-pathProgress)*720}/>
				{[[105,252],[410,215],[776,139]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="16" fill={red} stroke={paper} strokeWidth="4"/><text x={x+22} y={y-15} fill={paper} fontSize="24" fontWeight="bold" fontFamily={mono}>PONTO 0{i+1}</text></g>)}
			</svg>
			<div style={{ position: "absolute", bottom: 25, left: 45, right: 45, background: paper, borderLeft: `12px solid ${red}`, padding: 16, color: ink }}>
				<div style={{ font: `900 44px ${sans}`, textTransform: "uppercase" }}>{heading.slice(0, 55)}</div>
				<div style={{ font: `bold 19px ${mono}` }}>{subtitle.slice(0, 100)}</div>
			</div>
		</AbsoluteFill>
	);
}

function SplitScreen({ heading, subtitle, intensity }: RetroAutomotiveProps) {
	const { opacity, enter, amount, zoom } = useMotion(intensity);
	const offset = interpolate(enter, [0, 1], [90 * amount, 0]);
	const leftStyle: CSSProperties = { width: "54%", background: paper, padding: 45, color: ink, transform: `translateX(${-offset}px)` };
	return (
		<AbsoluteFill style={{ display: "flex", background: "#161819", overflow: "hidden", opacity }}>
			<div style={leftStyle}>
				<PageGrid/>
				<div style={{ position: "relative" }}>
					<div style={{ background: gold, display: "inline-block", padding: "8px 14px", border: `2px solid ${ink}` }}><Label>EXCLUSIVO / ARQUIVO</Label></div>
					<h1 style={{ font: `900 75px/.98 ${sans}`, margin: "32px 0", textTransform: "uppercase", color: red, overflowWrap: "anywhere" }}>{heading.slice(0, 43)}</h1>
					<div style={{ height: 5, background: ink, width: "75%" }}/>
					<p style={{ font: `bold 24px/1.4 ${mono}` }}>{subtitle.slice(0, 100)}</p>
				</div>
			</div>
			<div style={{ flex: 1, padding: "110px 15px", transform: `translateX(${offset}px) scale(${zoom})` }}>
				<div style={{ height: "100%", border: `3px solid ${gold}`, display: "flex", alignItems: "center", justifyContent: "center", background: "#303030" }}>
					<CarOutline color={paper}/>
				</div>
				<div style={{ color: gold, font: `bold 20px ${mono}`, marginTop: 12 }}>IMAGEM ILUSTRATIVA</div>
			</div>
		</AbsoluteFill>
	);
}

export function RetroAutomotiveComposition(props: RetroAutomotiveProps) {
	const visual = resolveRetroVisual({
		mode: props.mode,
		sceneType: props.sceneType,
		visualSlot: props.visualSlot,
	});
	switch (visual) {
		case "impact": return <Impact {...props}/>;
		case "comparison": return <Comparison {...props}/>;
		case "evidence": return <Evidence {...props}/>;
		case "map": return <MapPanel {...props}/>;
		case "split-screen": return <SplitScreen {...props}/>;
		default: return <FileCard {...props}/>;
	}
}
