import { interpolate, spring } from "remotion";
import type { ParamValues } from "@/params";
import type { GraphicDefinition } from "@/graphics/types";
import { describeTemplateScene } from "@/darkcut/template-visual-profiles";
import { resolveRetroVisual, RETRO_COLORS } from "@/darkcut/retro-automotive";
import type { CrisSceneType, CrisVisualSlot } from "@/darkcut/cris";
import type { RetroIntensity, RetroVisualMode } from "@/darkcut/retro-automotive";

export const DARKCUT_REMOTION_GRAPHIC_ID = "darkcut-remotion-composition";
export const COMPOSITION_WIDTH = 960;
export const COMPOSITION_HEIGHT = 540;
export const COMPOSITION_FRAMES = 90;
export const COMPOSITION_FPS = 15;

export type ComposerFrameInput = {
  templateId: string;
  templateTitle: string;
  heading: string;
  subtitle: string;
  sceneType: CrisSceneType;
  visualSlot: CrisVisualSlot;
  retroMode: RetroVisualMode;
  intensity: RetroIntensity;
  frame: number;
};

export function parseComposerFrameInput(params: ParamValues): ComposerFrameInput {
  const sceneType = String(params.sceneType || "hook") as CrisSceneType;
  const visualSlot = String(params.visualSlot || "default") as CrisVisualSlot;
  const retroMode = String(params.retroMode || "auto") as RetroVisualMode;
  const intensity = String(params.intensity || "normal") as RetroIntensity;
  return {
    templateId: String(params.templateId || "documentary"),
    templateTitle: String(params.templateTitle || "Documentário"),
    heading: String(params.heading || "Uma decisão muda tudo").slice(0, 180),
    subtitle: String(params.subtitle || "").slice(0, 260),
    sceneType,
    visualSlot,
    retroMode,
    intensity,
    frame: Math.max(0, Math.min(COMPOSITION_FRAMES, Number(params.frame) || 0)),
  };
}

type DrawingContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function box(ctx: DrawingContext, x: number, y: number, w: number, h: number, fill: string, radius = 0) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), radius);
  ctx.fill();
}

function strokeBox(ctx: DrawingContext, x: number, y: number, w: number, h: number, stroke: string, lineWidth = 2) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x, y, w, h);
}

function textLines(ctx: DrawingContext, content: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const tokens = content.replace(/\s+/g, " ").trim().split(" ");
  let line = "";
  let used = 0;
  for (const word of tokens) {
    const candidate = line ? line + " " + word : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, y + used * lineHeight);
      used++;
      if (used >= maxLines) return;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line && used < maxLines) ctx.fillText(line, x, y + used * lineHeight);
}

function drawGrid(ctx: DrawingContext, color: string, size = 42) {
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let x = 0; x <= COMPOSITION_WIDTH; x += size) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, COMPOSITION_HEIGHT); ctx.stroke();
  }
  for (let y = 0; y <= COMPOSITION_HEIGHT; y += size) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(COMPOSITION_WIDTH, y); ctx.stroke();
  }
  ctx.restore();
}

function drawUniversal(ctx: DrawingContext, p: ComposerFrameInput, motion: number, fade: number, slide: number, zoom: number) {
  const visual = describeTemplateScene({
    profileId: p.templateId, sceneType: p.sceneType, visualSlot: p.visualSlot, intensity: p.intensity,
  });
  const style = visual.profile;
  const bg = ctx.createLinearGradient(0, 0, 960, 540);
  bg.addColorStop(0, style.background);
  bg.addColorStop(1, "#090b0e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 960, 540);
  if (style.family === "archive" || style.family === "explainer") drawGrid(ctx, style.accent);
  if (style.family === "cinema") strokeBox(ctx, 40, 40, 880, 460, style.accent, 2);
  if (style.family === "social") {
    ctx.strokeStyle = style.accent;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 28;
    ctx.beginPath(); ctx.arc(920, 80, 225 * zoom, 0, 2 * Math.PI); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (visual.isComparison) {
    ctx.globalAlpha = 0.48 * fade;
    box(ctx, 50, 125 + slide * 0.4, 421, 315, style.card);
    strokeBox(ctx, 50, 125 + slide * 0.4, 421, 315, style.accent, 3);
    box(ctx, 487, 125 + slide * 0.4, 423, 315, style.background);
    strokeBox(ctx, 487, 125 + slide * 0.4, 423, 315, style.foreground, 3);
    ctx.font = "bold 20px Arial";
    ctx.fillStyle = style.foreground;
    ctx.fillText("OPÇÃO A / ANTES", 72, 418 + slide * 0.4);
    ctx.fillText("OPÇÃO B / DEPOIS", 505, 418 + slide * 0.4);
    ctx.globalAlpha = 1;
  }
  if (visual.isLocation) {
    ctx.save();
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = style.accent; ctx.lineWidth = 6; ctx.setLineDash([17, 12]);
    ctx.beginPath();
    [[85,380],[190,245],[317,290],[410,180],[525,241],[670,125],[810,210],[890,116]].forEach(([x,y], i) => {
      if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke(); ctx.setLineDash([]);
    for (const [x,y] of [[85,380],[410,180],[670,125],[890,116]]) {
      ctx.fillStyle = style.accent; ctx.beginPath(); ctx.arc(x,y,11,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = style.foreground; ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.restore();
  }
  if (visual.isDocument) {
    ctx.save(); ctx.globalAlpha = 0.36;
    ctx.translate(778, 266); ctx.rotate(3 * motion * Math.PI / 180);
    box(ctx, -115, -138, 230, 276, style.card);
    box(ctx, -115, -138, 230, 15, style.accent);
    for (const [index,width] of [90,70,100,55,86,60].entries()) {
      box(ctx, -96, -100 + index * 31, width * 1.8, 8, style.cardText);
    }
    ctx.restore();
  }
  if (visual.isList) {
    ctx.save(); ctx.globalAlpha = 0.2;
    ctx.fillStyle = style.accent; ctx.font = "900 220px Arial"; ctx.fillText("01", 620, 292);
    ctx.restore();
  }
  ctx.fillStyle = style.foreground; ctx.font = "900 18px Arial";
  ctx.fillText("DARKCUT · " + p.templateTitle.toUpperCase().slice(0, 38), 55, 63);
  box(ctx, 705, 42, 207, 36, style.accent);
  ctx.fillStyle = "#101010"; ctx.font = "900 15px Arial";
  ctx.fillText(visual.label, 716, 65, 187);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(57 + slide, visual.isNumber ? 145 : 155);
  ctx.scale(zoom, zoom);
  box(ctx, 0, 0, 66, 7, style.accent);
  ctx.fillStyle = visual.isNumber || visual.isHook ? style.accent : style.foreground;
  const fontSize = Math.min(visual.fontSize, p.heading.length > 95 ? 45 : 90);
  ctx.font = "900 " + fontSize + "px Arial";
  textLines(ctx, p.heading, 0, fontSize + 22, 824 / zoom, fontSize * 1.08, 3);
  if (p.subtitle && p.subtitle !== p.heading) {
    ctx.font = "23px Arial"; ctx.fillStyle = style.foreground;
    textLines(ctx, p.subtitle, 0, 295, 820, 30, 2);
  }
  ctx.restore();
  box(ctx, 54, 497, interpolate(p.frame,[0,90],[0,590],{extrapolateRight:"clamp"}), 5, style.accent, 3);
}

function drawRetro(ctx: DrawingContext, p: ComposerFrameInput, motion: number, fade: number, slide: number, zoom: number) {
  const kind = resolveRetroVisual({
    mode: p.retroMode, visualSlot: p.visualSlot, sceneType: p.sceneType,
  });
  const { paper, ink, red, gold } = RETRO_COLORS;
  const dark = kind === "impact" || kind === "comparison" || kind === "evidence";
  ctx.fillStyle = dark ? ink : paper;
  ctx.fillRect(0, 0, 960, 540);
  drawGrid(ctx, dark ? paper : ink, 30);
  if (kind === "comparison" || kind === "split-screen") {
    ctx.save(); ctx.globalAlpha = Math.max(0, fade * 0.9);
    box(ctx, 50, 140 + slide / 3, 420, 270, paper);
    box(ctx, 490, 140 + slide / 3, 420, 270, gold);
    ctx.fillStyle = ink; ctx.font = "900 28px Arial";
    ctx.fillText("ANTES", 90, 374 + slide / 3);
    ctx.fillText("DEPOIS", 530, 374 + slide / 3);
    ctx.restore();
  } else if (kind === "map") {
    ctx.strokeStyle = red; ctx.lineWidth = 6;
    ctx.beginPath();
    [[110,380],[220,270],[350,310],[500,175],[640,230],[800,115]].forEach(([x,y],i) => {
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
    for (const [x,y] of [[110,380],[350,310],[640,230],[800,115]]) {
      ctx.beginPath(); ctx.arc(x,y,11,0,2*Math.PI); ctx.fillStyle=gold; ctx.fill();
    }
  } else if (kind === "file-card" || kind === "evidence") {
    ctx.save(); ctx.translate(655,260); ctx.rotate(3*motion*Math.PI/180);
    box(ctx,-154,-168,310,330,paper);
    box(ctx,-154,-168,310,18,red);
    ctx.fillStyle=ink;
    for (let i=0;i<6;i++) box(ctx,-123,-100+i*36,195-(i%3)*29,7,ink);
    ctx.restore();
  } else if (kind === "impact") {
    ctx.save(); ctx.globalAlpha=0.26*fade; ctx.fillStyle=gold;
    ctx.font="900 255px Impact, Arial"; ctx.fillText("01",580,360); ctx.restore();
  }
  ctx.fillStyle = dark ? paper : ink; ctx.font="900 19px Arial";
  ctx.fillText("DARKCUT / ARQUIVO AUTOMOTIVO",55,72);
  box(ctx,730,46,170,39,red);
  ctx.fillStyle=paper; ctx.font="bold 16px Arial";
  ctx.fillText(kind.replaceAll("-"," ").toUpperCase(),738,72,152);
  ctx.save();
  ctx.globalAlpha=fade;
  ctx.translate(58+slide,149); ctx.scale(zoom,zoom);
  const strong=kind==="impact";
  ctx.fillStyle=strong?red:(dark?paper:ink);
  const fontSize=strong?97:Math.min(72,p.heading.length>75?48:66);
  ctx.font="900 "+fontSize+"px Impact, Arial";
  textLines(ctx,p.heading,0,fontSize+14,820,fontSize*1.07,strong?3:3);
  if(p.subtitle && p.subtitle!==p.heading){
    ctx.fillStyle=dark?paper:ink;ctx.font="24px Arial";
    textLines(ctx,p.subtitle,0,300,800,30,2);
  }
  ctx.restore();
  box(ctx,52,497,interpolate(p.frame,[0,90],[0,590],{extrapolateRight:"clamp"}),5,red,3);
}

export function drawDarkcutComposerFrame({
  ctx, width, height, input,
}: {
  ctx: DrawingContext;
  width: number;
  height: number;
  input: ComposerFrameInput;
}) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.scale(width / COMPOSITION_WIDTH, height / COMPOSITION_HEIGHT);
  const frame = Math.min(COMPOSITION_FRAMES, Math.max(0, input.frame));
  const motion = input.intensity === "strong" ? 1.4 : input.intensity === "soft" ? 0.6 : 1;
  const enter = spring({frame, fps: COMPOSITION_FPS, config:{damping:20,stiffness:120,mass:0.85}});
  const fade = interpolate(frame,[0,10,82,90],[0,1,1,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const slide = interpolate(enter,[0,1],[65*motion,0]);
  const zoom = interpolate(frame,[0,90],[1,1+0.045*motion],{extrapolateRight:"clamp"});
  if(input.templateId==="retro-automotive") drawRetro(ctx,input,motion,fade,slide,zoom);
  else drawUniversal(ctx,input,motion,fade,slide,zoom);
  ctx.restore();
}

export const darkcutRemotionGraphicDefinition: GraphicDefinition = {
  id: DARKCUT_REMOTION_GRAPHIC_ID,
  name: "Remotion Composer • Cena completa",
  keywords: ["remotion","motion graphics","compositor","darkcut"],
  params: [
    {key:"templateId",label:"Template",type:"text",default:"documentary"},
    {key:"templateTitle",label:"Nome do template",type:"text",default:"Documentário"},
    {key:"heading",label:"Título da cena",type:"text",default:"Uma decisão muda tudo"},
    {key:"subtitle",label:"Texto secundário",type:"text",default:""},
    {key:"sceneType",label:"Tipo de cena",type:"text",default:"hook"},
    {key:"visualSlot",label:"Visual",type:"text",default:"default"},
    {key:"retroMode",label:"Modo automotivo",type:"select",default:"auto",options:[
      {value:"auto",label:"Automático"},{value:"file-card",label:"Ficha"},{value:"impact",label:"Impacto"},
      {value:"comparison",label:"Comparação"},{value:"evidence",label:"Evidências"},
      {value:"map",label:"Mapa"},{value:"split-screen",label:"Tela dividida"}]},
    {key:"intensity",label:"Intensidade",type:"select",default:"normal",options:[
      {value:"soft",label:"Suave"},{value:"normal",label:"Normal"},{value:"strong",label:"Forte"}]},
    {key:"frame",label:"Progresso do Remotion",type:"number",default:0,min:0,max:COMPOSITION_FRAMES,step:1,keyframable:true},
  ],
  render({ctx,params,width,height}){
    drawDarkcutComposerFrame({
      ctx,width,height,
      input:parseComposerFrameInput(params),
    });
  },
};
