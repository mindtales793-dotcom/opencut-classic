import { describe, expect, test } from "bun:test";
import { Command } from "@/commands/base-command";
import { CommandManager } from "../commands";
import type { EditorCore } from "@/core";

class CounterCommand extends Command {
	constructor(private counter: { value: number }, private amount = 1) { super(); }
	execute() { this.counter.value += this.amount; return undefined; }
	undo() { this.counter.value -= this.amount; }
}

function createManager() {
	const editor = {
		selection: { getSnapshot: () => ({}), restoreSnapshot: () => {} },
		scenes: { getActiveSceneOrNull: () => null },
	} as unknown as EditorCore;
	return new CommandManager(editor);
}

describe("CommandManager undo and redo", () => {
	test("emits reactive updates and invalidates redo on new edits", () => {
		const manager = createManager();
		const counter = { value: 0 };
		let updates = 0;
		const unsubscribe = manager.subscribe(() => { updates++; });
		expect(manager.canUndo()).toBe(false);
		manager.execute({ command: new CounterCommand(counter) });
		expect(manager.canUndo()).toBe(true);
		manager.undo();
		expect(counter.value).toBe(0);
		expect(manager.canRedo()).toBe(true);
		manager.redo();
		expect(counter.value).toBe(1);
		manager.undo();
		manager.execute({ command: new CounterCommand(counter, 3) });
		expect(manager.canRedo()).toBe(false);
		expect(counter.value).toBe(3);
		expect(updates).toBeGreaterThanOrEqual(5);
		unsubscribe();
	});

	test("groups many edits into a single reversible step", () => {
		const manager = createManager();
		const counter = { value: 0 };
		manager.runAsSingleUndoStep(() => {
			manager.execute({ command: new CounterCommand(counter, 1) });
			manager.execute({ command: new CounterCommand(counter, 2) });
			manager.execute({ command: new CounterCommand(counter, 3) });
		});
		expect(counter.value).toBe(6);
		manager.undo();
		expect(counter.value).toBe(0);
		expect(manager.canUndo()).toBe(false);
		manager.redo();
		expect(counter.value).toBe(6);
	});

	test("rolls back partial edits when a grouped operation fails", () => {
		const manager = createManager();
		const counter = { value: 0 };
		expect(() => manager.runAsSingleUndoStep(() => {
			manager.execute({ command: new CounterCommand(counter, 5) });
			throw new Error("abort");
		})).toThrow("abort");
		expect(counter.value).toBe(0);
		expect(manager.canUndo()).toBe(false);
	});

	test("caps retained history to 150 steps", () => {
		const manager = createManager();
		const counter = { value: 0 };
		for (let i = 0; i < 155; i++) {
			manager.execute({ command: new CounterCommand(counter) });
		}
		for (let i = 0; i < 160; i++) manager.undo();
		expect(counter.value).toBe(5);
		expect(manager.canUndo()).toBe(false);
	});
});
