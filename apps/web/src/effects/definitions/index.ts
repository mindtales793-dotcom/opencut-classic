import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { COLOR_GRADE_EFFECTS } from "./color-grade";

const defaultEffects = [blurEffectDefinition, ...COLOR_GRADE_EFFECTS];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}
