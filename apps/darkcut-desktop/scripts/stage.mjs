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
// Materialize workspace links: build-machine absolute symlinks cannot ship to users.
copyRuntime(standaloneDir, runtimeDir);

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

// Copy real files explicitly so absolute workspace links never enter the package.
function copyRuntime(source, destination, parents = new Set()) {
  const real = fs.realpathSync(source);
  if (parents.has(real)) throw new Error(`Circular runtime link: ${source}`);
  if (fs.statSync(real).isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    const next = new Set(parents);
    next.add(real);
    for (const entry of fs.readdirSync(real)) {
      copyRuntime(path.join(real, entry), path.join(destination, entry), next);
    }
  } else {
    fs.copyFileSync(real, destination);
  }
}
