import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import type { MediaTime } from "@/wasm";
import { buildGraphicElement } from "@/timeline/element-utils";
import type { CreateGraphicElement } from "@/timeline/types";
import type { CrisSceneType, CrisVisualSlot } from "@/darkcut/cris";
import type { RetroIntensity, RetroVisualMode } from "@/darkcut/retro-automotive";
import { COMPOSITION_FRAMES, DARKCUT_REMOTION_GRAPHIC_ID } from "./remotion-compositor-canvas";

/**
 * Exports the complete composer (including backgrounds, numbers, map routes,
 * comparisons, dossiers and titles) as one editable graphic timeline clip.
 * Its frame is a keyframed graphic parameter, rendered by the same native
 * frame pipeline used by MP4, WebM and live timeline playback.
 */
export function buildRemotionCompositionClip({
  startTime, duration, canvasWidth, canvasHeight,
  templateId, templateTitle, heading, subtitle, sceneType, visualSlot,
  intensity, retroMode = "auto",
}: {
  startTime: MediaTime;
  duration: MediaTime;
  canvasWidth: number;
  canvasHeight: number;
  templateId: string;
  templateTitle: string;
  heading: string;
  subtitle: string;
  sceneType: CrisSceneType;
  visualSlot: CrisVisualSlot;
  intensity: RetroIntensity;
  retroMode?: RetroVisualMode;
}): CreateGraphicElement {
  const seconds = mediaTimeToSeconds({ time: duration });
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("Duração da cena Remotion inválida.");
  if (canvasWidth <= 0 || canvasHeight <= 0) throw new Error("Resolução da cena Remotion inválida.");
  const shortestSide = Math.min(canvasWidth, canvasHeight);
  const element = buildGraphicElement({
    definitionId: DARKCUT_REMOTION_GRAPHIC_ID,
    name: "Remotion • " + templateTitle + " • " + heading.slice(0, 28),
    startTime,
    params: {
      templateId, templateTitle, heading, subtitle, sceneType, visualSlot,
      intensity, retroMode, frame: 0,
      "transform.scaleX": canvasWidth / shortestSide,
      "transform.scaleY": canvasHeight / shortestSide,
      "transform.positionX": 0,
      "transform.positionY": 0,
    },
  });
  return {
    ...element,
    duration,
    animations: {
      "params.frame": {
        keys: [
          { id: "remotion-frame-start", time: mediaTimeFromSeconds({ seconds: 0 }),
            value: 0, segmentToNext: "linear", tangentMode: "auto" },
          { id: "remotion-frame-end", time: duration,
            value: COMPOSITION_FRAMES, segmentToNext: "linear", tangentMode: "auto" },
        ],
      },
    },
  };
}
