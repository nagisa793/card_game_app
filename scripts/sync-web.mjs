import { cp, mkdir, readFile, rename, rm, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory } from './files.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const configFile = path.join(root, 'upstream.json');
const config = JSON.parse(await readFile(configFile, 'utf8'));
if (config.repository !== 'nagisa793/card_game' || config.branch !== 'main' || config.directory !== 'dist') {
  throw new Error('Unexpected upstream configuration. Refusing to read a different repository.');
}
const cache = path.join(root, '.upstream-cache');
await mkdir(cache, { recursive: true });
const checkout = path.join(cache, 'source');
const git = (...args) => execFileSync('git', args, { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
try { await access(path.join(checkout, '.git')); }
catch { execFileSync('git', ['clone', '--depth=1', '--branch', config.branch, `https://github.com/${config.repository}.git`, checkout], { stdio: 'inherit' }); }
git('fetch', '--depth=1', 'origin', config.branch);
const commit = git('rev-parse', `origin/${config.branch}`);
git('checkout', '--detach', commit);
const source = path.join(checkout, config.directory);
const html = await readFile(path.join(source, 'index.html'), 'utf8');
for (const required of ['id="battleStage"', 'id="sceneCanvas"', 'id="controls"', 'id="ownHand"', 'id="oppHand"']) {
  if (!html.includes(required)) throw new Error(`Upstream UI changed (${required}). Keep the previous APP version for review.`);
}
const files = await inventory(source);
let installed = {};
try { installed = await inventory(path.join(root, 'web')); } catch {}
if (config.commit === commit && JSON.stringify(files) === JSON.stringify(installed)) {
  console.log(`WEB unchanged (${commit.slice(0, 7)}).`);
  process.exit(0);
}
const staged = path.join(cache, 'web-next');
await rm(staged, { recursive: true, force: true });
await cp(source, staged, { recursive: true });
const previous = path.join(cache, 'web-previous');
await rm(previous, { recursive: true, force: true });
try { await rename(path.join(root, 'web'), previous); } catch (error) { if (error.code !== 'ENOENT') throw error; }
try { await rename(staged, path.join(root, 'web')); }
catch (error) { await rename(previous, path.join(root, 'web')); throw error; }
const webVersion = Number(html.match(/interface\.css\?v=(\d+)/)?.[1] || 0);
await writeFile(configFile, JSON.stringify({ ...config, commit, webVersion, files }, null, 2) + '\n');
await mkdir(path.join(root, 'tests'), { recursive: true });
for (const name of ['rules-regression.cjs', 'audio-startup.cjs']) {
  const test = await readFile(path.join(checkout, 'tests', name), 'utf8');
  const appTest = test.replaceAll('../dist', '../www');
  await writeFile(path.join(root, 'tests', name), name === 'rules-regression.cjs'
    ? appTest.replace("root+'/index.html'", "root+'/game.html'") : appTest);
}
console.log(`Synced WEB v${webVersion} (${commit.slice(0, 7)}) into APP only. Game source and assets copied without edits.`);
