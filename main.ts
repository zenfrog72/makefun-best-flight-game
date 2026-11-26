// ISLAND COURIER — hand-in program (Node 22, standard library only).
// The game lives in this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html, its ES modules and the vendored PixiJS
// build under game/vendor/, no network request at all). This program copies
// game/ and screenshots/ from beside this file into /output and writes
// /output/dossier.json, the summary the judge reads, using the vendored
// make.fun library. Run it from anywhere: it never trusts the working
// directory, only its own file location (or MAKEFUN_BOT_DIR when the grader
// sets it). Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const botDir = process.env.MAKEFUN_BOT_DIR ?? fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(botDir, 'game');
const shotsDir = join(botDir, 'screenshots');

if (!existsSync(gameDir)) {
  throw new Error(`game/ not found beside main.ts (looked in ${gameDir})`);
}

mkdirSync(outDir, { recursive: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

// The gate's own caps (see the kit's gate): at most 4 screenshots, each at most
// 256 KiB; game/ at most 993 files and 48 MiB in all. The dossier writer takes
// the text cap; the rest are refused here so a bad build fails loudly instead
// of handing in an entry the scorer would refuse.
const SHOT_LIMIT = 4;
const SHOT_MAX_BYTES = 262144;
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 50331648;

function countGameFiles(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countGameFiles(path);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

const gameSize = countGameFiles(gameDir);
if (gameSize.files > GAME_MAX_FILES || gameSize.bytes > GAME_MAX_BYTES) {
  throw new Error(`game/ over the gate caps: ${gameSize.files} files, ${gameSize.bytes} bytes`);
}

if (existsSync(shotsDir)) {
  const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
  if (shots.length > SHOT_LIMIT) throw new Error(`too many screenshots: ${shots.length} (max ${SHOT_LIMIT})`);
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > SHOT_MAX_BYTES) throw new Error(`screenshot over 256 KiB: ${name} (${size} bytes)`);
  }
}

writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: SHOT_LIMIT, max_bytes: SHOT_MAX_BYTES },
    game_max_files: GAME_MAX_FILES,
    game_max_bytes: GAME_MAX_BYTES,
    game_path_max_bytes: 1000,
  }),
);

// Read the dossier back so a truncated or empty write is caught here, not by
// the scorer: it must parse as JSON and carry the screenshots we handed in.
const dossierPath = join(outDir, 'dossier.json');
const dossierBytes = statSync(dossierPath).size;
if (dossierBytes === 0) throw new Error('dossier.json came out empty');
const dossier = JSON.parse(new TextDecoder().decode(readFileSync(dossierPath)));
const shotNames = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((name) => !name.startsWith('.'))
  : [];
console.log(
  `island-courier: ${gameSize.files} game files (${gameSize.bytes} bytes), ` +
    `${shotNames.length} screenshot(s), dossier ${dossierBytes} bytes -> ${outDir}`,
);
