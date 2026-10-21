import type { FrameDescriptor } from "./types";

/**
 * The published opencut-wasm compositor exposes one exceptional field name:
 * SceneEffect is an inline enum variant, so serde rename_all on the enum
 * does NOT rename its fields. It requires `effect_pass_groups` (snake_case).
 * Layers are structs with rename_all="camelCase" and require
 * `effectPassGroups` as usual.
 *
 * Normalize on the JS -> WASM boundary rather than changing the editor's
 * strongly typed descriptor or depending on a custom unpublished WASM build.
 */
export function toWasmFrameDescriptor(frame: FrameDescriptor): FrameDescriptor {
	if (!frame.items.some((item) => item.type === "sceneEffect")) return frame;
	return {
		...frame,
		items: frame.items.map((item) => {
			if (item.type !== "sceneEffect") return item;
			// Keep the camelCase property for the TS type and pass the exact
			// serialized field name expected by the published Rust enum.
			return {
				...item,
				effect_pass_groups: item.effectPassGroups,
			};
		}),
	};
}
