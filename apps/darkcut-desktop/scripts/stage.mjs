import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const repoRoot = path.resolve(desktopDir, "..", "..");
const webDir = path.join(repoRoot, "apps", "web");
const standaloneDir = path.join(webDir, ".next", "standalone");
const runtimeDir = path.join(desktopDir, "runtime");

if (!fs.existsSync(standaloneDir)) {
  throw new Error(
    "Next standalone output not found. Run 'bun run build:web' before staging.",
  );
}

fs.rmSync(runtimeDir, { recursive: true, force: true });
fs.mkdirSync(runtimeDir, { recursive: true });
fs.cpSync(standaloneDir, runtimeDir, { recursive: true });

const candidateAppRoots = [
  runtimeDir,
  path.join(runtimeDir, "apps", "web"),
];
const appRoot =
  candidateAppRoots.find((candidate) =>
    fs.existsSync(path.join(candidate, "server.js")),
  ) ?? null;

if (!appRoot) {
  throw new Error("Could not locate server.js inside Next standalone output.");
}

const staticSource = path.join(webDir, ".next", "static");
const staticTarget = path.join(appRoot, ".next", "static");
if (fs.existsSync(staticSource)) {
  fs.mkdirSync(path.dirname(staticTarget), { recursive: true });
  fs.cpSync(staticSource, staticTarget, { recursive: true });
}

const publicSource = path.join(webDir, "public");
const publicTarget = path.join(appRoot, "public");
if (fs.existsSync(publicSource)) {
  fs.cpSync(publicSource, publicTarget, { recursive: true });
}

console.log("DarkCut desktop runtime staged at:", runtimeDir);
