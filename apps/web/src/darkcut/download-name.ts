/**
 * Safe file name for a browser/Electron download. Characters Windows forbids
 * (\ / : * ? " < > |), control characters and trailing dots/spaces are replaced,
 * because the save dialog can silently refuse such names.
 */
export function safeDownloadName({
	name,
	extension,
	fallback = "darkcut-narracao",
}: {
	name: string;
	extension: string;
	fallback?: string;
}): string {
	const suffix = extension.startsWith(".") ? extension : `.${extension}`;
	const withoutExtension = name.toLowerCase().endsWith(suffix.toLowerCase())
		? name.slice(0, -suffix.length)
		: name;
	const cleaned = Array.from(withoutExtension)
		.map((character) =>
			character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character)
				? "-"
				: character,
		)
		.join("")
		.replace(/\s+/g, " ")
		.replace(/-{2,}/g, "-")
		.replace(/^[\s.-]+|[\s.-]+$/g, "")
		.slice(0, 120);
	return `${cleaned || fallback}${suffix}`;
}
