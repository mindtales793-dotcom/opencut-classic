"use client";

import { useLayoutEffect, useRef } from "react";
import { Player } from "@remotion/player";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { drawDarkcutComposerFrame, COMPOSITION_WIDTH, COMPOSITION_HEIGHT } from "@/darkcut/remotion-compositor-canvas";
import type { CrisSceneType, CrisVisualSlot } from "@/darkcut/cris";
import type { RetroIntensity, RetroVisualMode } from "@/darkcut/retro-automotive";

type ComposerProps = {
  templateTitle: string;
  templateId: string;
  sceneType: CrisSceneType;
  visualSlot: CrisVisualSlot;
  overlayText: string;
  summary: string;
  intensity: RetroIntensity;
  retroMode: RetroVisualMode;
};

/**
 * Preview uses Remotion's own frame clock, but paints each frame with the
 * same Canvas2D composition code that the timeline / GPU compositor exports.
 * This prevents the old "looks perfect in Remotion Player, disappears from
 * the final MP4" behavior for charts, maps, comparisons and backgrounds.
 */
function ExportMatchedComposer(props: ComposerProps) {
  const frame = useCurrentFrame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    drawDarkcutComposerFrame({
      ctx: context,
      width: COMPOSITION_WIDTH,
      height: COMPOSITION_HEIGHT,
      input: {
        templateId: props.templateId,
        templateTitle: props.templateTitle,
        sceneType: props.sceneType,
        visualSlot: props.visualSlot,
        heading: props.overlayText || props.summary || props.templateTitle,
        subtitle: props.summary,
        intensity: props.intensity,
        retroMode: props.retroMode,
        frame,
      },
    });
  }, [frame, props.templateId, props.templateTitle, props.sceneType, props.visualSlot,
      props.overlayText, props.summary, props.intensity, props.retroMode]);
  return (
    <AbsoluteFill style={{ backgroundColor: "#090b0e" }}>
      <canvas ref={canvasRef} width={COMPOSITION_WIDTH} height={COMPOSITION_HEIGHT}
        style={{ width: "100%", height: "100%", display: "block" }} />
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
}: Omit<ComposerProps, "templateId" | "intensity" | "retroMode"> & {
  fps?: number;
  templateId?: string;
  intensity?: RetroIntensity;
  retroMode?: RetroVisualMode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-black">
      <Player
        component={ExportMatchedComposer}
        inputProps={{
          templateTitle, templateId, sceneType, visualSlot,
          overlayText, summary, intensity, retroMode,
        }}
        durationInFrames={Math.max(60, fps * 6)}
        fps={fps}
        compositionWidth={COMPOSITION_WIDTH}
        compositionHeight={COMPOSITION_HEIGHT}
        controls
        loop
        style={{ width: "100%", aspectRatio: "16 / 9" }}
      />
    </div>
  );
}
