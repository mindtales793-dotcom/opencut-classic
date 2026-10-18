/**
 * Fish narrations are persisted per chunk: retries and app restarts never
 * replay successfully saved speech (and never make an hour-long one-shot call).
 */
export const MAX_NARRATION_CHARS_PER_CHUNK = 1350;

export function splitNarrationIntoChunks(text: string, maxChars = MAX_NARRATION_CHARS_PER_CHUNK): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 50) throw new Error("Tamanho de bloco inválido.");
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const phrases = normalized.match(/[^.!?…]+[.!?…]*/gu)?.map((phrase) => phrase.trim()).filter(Boolean) ?? [normalized];
  const chunks: string[] = [];
  let current = "";
  function push() {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  }
  for (const phrase of phrases) {
    // Sentence boundaries first; oversized sentences fall back to word boundaries.
    const words = phrase.split(/\s+/).filter(Boolean);
    for (const word of words) {
      if (word.length > maxChars) {
        push();
        for (let i = 0; i < word.length; i += maxChars) {
          chunks.push(word.slice(i, i + maxChars));
        }
        continue;
      }
      const candidate = current ? current + " " + word : word;
      if (candidate.length > maxChars) push();
      current = current ? current + " " + word : word;
    }
    // Prefer sentence ends, but combine consecutive sentences for fewer requests.
    if (/[.!?…]$/u.test(phrase) && current.length >= maxChars * 0.68) push();
  }
  push();
  return chunks;
}

export function narrationProgress(completed: number, total: number, finished = false): number {
  if (finished) return 100;
  if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(99, Math.floor((completed / total) * 100)));
}
