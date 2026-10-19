import type { EditorCore } from "@/core";
import type { Command, CommandResult } from "@/commands";
import { BatchCommand } from "@/commands/batch-command";
import type { EditorSelectionSnapshot } from "@/selection/editor-selection";
import { applyRippleAdjustments, computeRippleAdjustments } from "@/ripple";
import type { SceneTracks } from "@/timeline/types";

interface CommandHistoryEntry {
	command: Command;
	previousSelection: EditorSelectionSnapshot;
	selectionOverride?: EditorSelectionSnapshot;
}

const MAX_UNDO_STEPS = 150;

export class CommandManager {
	public isRippleEnabled = false;
	private history: CommandHistoryEntry[] = [];
	private redoStack: CommandHistoryEntry[] = [];
	private reactors: Array<() => void> = [];
	private listeners = new Set<() => void>();
	private transaction: CommandHistoryEntry[] | null = null;

	constructor(private editor: EditorCore) {}

	execute({ command }: { command: Command }): Command {
		const beforeTracks = this.isRippleEnabled
			? (this.editor.scenes.getActiveSceneOrNull()?.tracks ?? null)
			: null;
		const previousSelection = this.getSelectionSnapshot();
		const result = command.execute();
		this.applyRippleIfEnabled({ beforeTracks });
		const selectionOverride = this.applySelectionOverride(result);
		this.runReactors();
		this.record({ command, previousSelection, selectionOverride });
		return command;
	}

	push({ command }: { command: Command }): void {
		this.record({ command, previousSelection: this.getSelectionSnapshot() });
	}

	/** Groups synchronous editor operations (including track creation) into one undo step. */
	runAsSingleUndoStep(callback: () => void): void {
		if (this.transaction) {
			callback();
			return;
		}

		const entries: CommandHistoryEntry[] = [];
		this.transaction = entries;
		try {
			callback();
			this.transaction = null;
			if (entries.length === 0) return;
			const lastSelectionOverride = [...entries]
				.reverse()
				.find((entry) => entry.selectionOverride !== undefined)
				?.selectionOverride;
			this.record({
				command: entries.length === 1
					? entries[0].command
					: new BatchCommand(entries.map((entry) => entry.command)),
				previousSelection: entries[0].previousSelection,
				selectionOverride: lastSelectionOverride,
			});
		} catch (error) {
			this.transaction = null;
			for (const entry of [...entries].reverse()) entry.command.undo();
			if (entries.some((entry) => entry.selectionOverride !== undefined)) {
				this.editor.selection.restoreSnapshot({ snapshot: entries[0].previousSelection });
			}
			this.notify();
			throw error;
		}
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}

	private record(entry: CommandHistoryEntry): void {
		if (this.transaction) {
			this.transaction.push(entry);
			return;
		}
		this.history.push(entry);
		if (this.history.length > MAX_UNDO_STEPS) {
			this.history.splice(0, this.history.length - MAX_UNDO_STEPS);
		}
		this.redoStack = [];
		this.notify();
	}

	registerReactor(reactor: () => void): void {
		this.reactors.push(reactor);
	}

	undo(): void {
		if (this.transaction || this.history.length === 0) return;
		const entry = this.history.pop();
		entry?.command.undo();
		if (entry) {
			// Only restore selection for commands that explicitly changed it.
			// Commands without selection intent leave selection untouched,
			// preserving any UI-driven selection changes (clicks, box select)
			// that happened between commands. Commands that remove editor-owned
			// selection targets must declare a selection override to clear stale refs.
			if (entry.selectionOverride !== undefined) {
				this.editor.selection.restoreSnapshot({
					snapshot: entry.previousSelection,
				});
			}
			this.redoStack.push(entry);
			this.notify();
		}
	}

	redo(): void {
		if (this.transaction || this.redoStack.length === 0) return;
		const entry = this.redoStack.pop();
		if (!entry) {
			return;
		}

		const beforeTracks = this.isRippleEnabled
			? (this.editor.scenes.getActiveSceneOrNull()?.tracks ?? null)
			: null;
		const previousSelection = this.getSelectionSnapshot();
		const result = entry.command.redo();
		this.applyRippleIfEnabled({ beforeTracks });
		const selectionOverride = this.applySelectionOverride(result);
		this.runReactors();

		this.history.push({
			command: entry.command,
			previousSelection,
			selectionOverride,
		});
		this.notify();
	}

	canUndo(): boolean {
		return this.history.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	clear(): void {
		this.history = [];
		this.redoStack = [];
		this.notify();
	}

	private getSelectionSnapshot(): EditorSelectionSnapshot {
		return this.editor.selection.getSnapshot();
	}

	private applySelectionOverride(
		result: CommandResult | undefined,
	): EditorSelectionSnapshot | undefined {
		if (!result?.selection) {
			return undefined;
		}
		return this.editor.selection.applySelectionPatch({
			patch: result.selection,
		});
	}

	private runReactors(): void {
		for (const reactor of this.reactors) {
			reactor();
		}
	}

	private applyRippleIfEnabled({
		beforeTracks,
	}: {
		beforeTracks: SceneTracks | null;
	}): void {
		if (!this.isRippleEnabled || !beforeTracks) {
			return;
		}

		const afterTracks = this.editor.scenes.getActiveSceneOrNull()?.tracks;
		if (!afterTracks) {
			return;
		}
		const adjustments = computeRippleAdjustments({
			beforeTracks,
			afterTracks,
		});
		if (adjustments.length === 0) {
			return;
		}

		const tracksWithRipple = applyRippleAdjustments({
			tracks: afterTracks,
			adjustments,
		});
		this.editor.timeline.updateTracks(tracksWithRipple);
	}
}
