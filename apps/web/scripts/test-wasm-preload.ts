// Bun does not initialize wasm-bindgen's bundler target. Use the real binary.
import { mock } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const dir = dirname(fileURLToPath(import.meta.resolve("opencut-wasm")));
const glue = await import(pathToFileURL(join(dir, "opencut_wasm_bg.js")).href);
const { instance } = await WebAssembly.instantiate(
	await readFile(join(dir, "opencut_wasm_bg.wasm")),
	{ "./opencut_wasm_bg.js": glue },
);
glue.__wbg_set_wasm(instance.exports);
(instance.exports.__wbindgen_start as () => void)();
mock.module("opencut-wasm", () => glue);
