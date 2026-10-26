// Cross-platform builds must include PDF.js's Windows canvas binary.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const pkg = require('../package.json');
const moduleName = '@napi-rs/canvas-win32-x64-msvc';
const version = pkg.optionalDependencies[moduleName];
const destination = path.join(__dirname, '..', 'node_modules', moduleName);
const binary = path.join(destination, 'skia.win32-x64-msvc.node');
if (!fs.existsSync(binary) || JSON.parse(fs.readFileSync(path.join(destination, 'package.json'), 'utf8')).version !== version) {
  if (!process.env.npm_execpath) throw new Error('Run this step using npm run dist:win.');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-win-deps-'));
  try {
    // Install only this target binary into an isolated directory. --force allows
    // downloading a Windows package on Linux without replacing host dependencies.
    const result = spawnSync(process.execPath, [process.env.npm_execpath, 'install', '--prefix', temporary, '--force', '--ignore-scripts', '--no-audit', '--no-fund', `${moduleName}@${version}`], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Unable to download the Windows PDF dependency.');
    fs.cpSync(path.join(temporary, 'node_modules', moduleName), destination, { recursive: true });
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
if (!fs.existsSync(binary)) throw new Error('The Windows PDF native module is missing.');
console.log('Windows PDF dependency ready.');
