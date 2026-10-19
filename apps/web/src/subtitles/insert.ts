import type { EditorCore } from "@/core";
import {
	AddTrackCommand,
	BatchCommand,
	InsertElementCommand,
} from "@/commands";
import {
	buildKaraokeHighlightElements,
	buildSubtitleTextElement,
} from "./build-subtitle-text-element";
import type { CaptionAnimationMode } from "./karaoke";
import type { SubtitleCue } from "./types";

const MAX_KARAOKE_WORD_ELEMENTS = 2000;

export function insertCaptionChunksAsTextTrack({
	editor,
	captions,
	animation = "none",
	highlightColor = "#fde047",
}: {
	editor: EditorCore;
	captions: SubtitleCue[];
	animation?: CaptionAnimationMode;
	highlightColor?: string;
}): string | null {
	if (captions.length === 0) return null;
	const canvasSize = editor.project.getActive().settings.canvasSize;
	const baseTrack = new AddTrackCommand({ type: "text", index: 0 });
	const baseTrackId = baseTrack.getTrackId();
	const commands = [
		baseTrack,
		...captions.map((caption, index) =>
			new InsertElementCommand({
				placement: { mode: "explicit" as const, trackId: baseTrackId },
				element: buildSubtitleTextElement({ index, caption, canvasSize }),
			}),
		),
	];
	if (animation !== "none") {
		const highlights = captions.flatMap((caption, index) =>
			buildKaraokeHighlightElements({
				index,
				caption,
				canvasSize,
				animation,
				highlightColor,
			}),
		);
		if (highlights.length > MAX_KARAOKE_WORD_ELEMENTS) {
			throw new Error(`Este SRT contém ${highlights.length} palavras. O limite de animação é ${MAX_KARAOKE_WORD_ELEMENTS} para proteger a timeline; use legendas sem animação ou divida o arquivo.`);
		}
		if (highlights.length > 0) {
			const highlightTrack = new AddTrackCommand({ type: "text", index: 0 });
			const highlightTrackId = highlightTrack.getTrackId();
			commands.push(highlightTrack);
			for (const element of highlights) {
				commands.push(new InsertElementCommand({
					placement: { mode: "explicit", trackId: highlightTrackId },
					element,
				}));
			}
		}
	}
	editor.command.execute({ command: new BatchCommand(commands) });
	return baseTrackId;
}
