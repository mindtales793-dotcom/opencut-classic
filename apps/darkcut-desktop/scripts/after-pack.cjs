const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

// Copy the complete standalone tree after electron-builder's dependency filters.
// Its node_modules belong to the Next server, not to the Electron main process.
module.exports = async function afterPack(context) {
  const source = path.join(context.packager.projectDir, 'runtime');
  const destination = path.join(context.appOutDir, 'resources', 'runtime');
  fs.rmSync(destination, { recursive: true, force: true });
  function copy(from, to) {
    if (fs.statSync(from).isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      for (const entry of fs.readdirSync(from)) copy(path.join(from, entry), path.join(to, entry));
    } else fs.copyFileSync(from, to);
  }
  copy(source, destination);
  const server = [path.join(destination, 'apps', 'web', 'server.js'), path.join(destination, 'server.js')].find(fs.existsSync);
  if (!server) throw new Error('Packaged server.js is missing');
  const requireServer = createRequire(server);
  const next = requireServer.resolve('next');
  const relative = path.relative(destination, next);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Next resolved outside packaged runtime: ' + next);
  console.log('Packaged Next runtime verified:', next);
};
