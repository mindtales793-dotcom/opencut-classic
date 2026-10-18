/** Scene matching is explicit: never assign a file to a random scene. */
export function sceneNumberFromMediaFilename(filename: string): number | null {
  const clean = filename.normalize("NFKC").trim();
  const match = clean.match(/(?:^|[\s_.-])(?:cena|scene|prompt)[\s_.-]*0*(\d{1,4})(?=[\s_.-]|$)/i) ||
    clean.match(/^0*(\d{1,4})(?=[\s_.-])/);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 1 && index <= 10000 ? index : null;
}

export function isSupportedBridgeMedia(filename: string) {
  return /\.(png|jpe?g|webp|mp4|webm)$/i.test(filename);
}
