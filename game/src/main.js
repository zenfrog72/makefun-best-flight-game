// ISLAND COURIER — boot, fixed-step loop, screens, landing/crash judging.
// Screens: title (with attract-mode autopilot behind it), briefing, play,
// paused, mission complete, game over, mission failed.
// Debug handle (read-only, invisible): window.__IC = { getState() }.

import { VIEW_W, VIEW_H, STEP, PALETTES } from './config.js';
import { readParams, mulberry32, clamp, wrapAngleDeg, dist } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createPlane, resetPlane, stepFlight, applyDamage } from './flight.js';
import { buildWorld, islandAt, runwayCheck, windForMission, clampToWorld } from './world.js';
import { createRenderer } from './render.js';
import { createChaseRenderer } from './chase.js';
import { createHud } from './hud.js';
import {
  MISSION_DEFS, createMissionState, startMission, updateMission,
  landingResult, missionTarget, pushEvent, showMessage,
  isLandingMission, hasNextMission,
} from './missions.js';
import { applyShot } from './shots.js';

const params = readParams();
// Screenshot staging (?shot=cover|ring|landing|storm) renders the chase
// view from behind the plane; normal play keeps the top-down view.
const CHASE = !!params.shot;
const rng = mulberry32(params.seed);

const app = new PIXI.Application({
  width: VIEW_W, height: VIEW_H,
  backgroundColor: 0x0b7fa8,
  // Perf (headless SwiftShader / weak GPUs): MSAA + full-res backing store
  // cost ~700ms/frame there (measured 1.4 fps). The logical view stays
  // 1280x720; only the backing store is smaller (576x324), upscaled by
  // the canvas — same content, slightly softer image.
  antialias: false,
  resolution: 0.45,
});
document.getElementById('game').appendChild(app.view);

const world = buildWorld(params.seed);
const input = createInput();
const audio = createAudio();
const plane = createPlane(950, 3050, 90);
const ms = createMissionState(world);
const hud = createHud(app, world);

let renderer = null;
let paletteKey = 'day';
let screen = 'title';
let time = 0;
let bestScore = 0;
try { bestScore = parseInt(window.localStorage.getItem('islandCourierBest') || '0', 10) || 0; } catch (e) { bestScore = 0; }
let lightningTimer = 6;
let lightningFlash = false;
let shotFramesLeft = -1;
let attractAngle = 0;
let prevDropDone = false;
let gameOverReason = '';
let campaignDone = false;

function buildRendererFor(key) {
  if (renderer) app.stage.removeChild(renderer.root);
  paletteKey = key;
  // Screenshot staging (?shot=) uses the chase view from behind the plane;
  // normal play keeps the top-down renderer.
  renderer = CHASE ? createChaseRenderer(app, world, key) : createRenderer(app, world, key);
  app.stage.removeChild(hud.layer);
  app.stage.addChild(hud.layer);
}

buildRendererFor('day');

const overlay = document.getElementById('overlay');

function showOverlay(html) {
  overlay.innerHTML = html;
  overlay.style.display = html ? 'block' : 'none';
}
function hideOverlay() { showOverlay(''); }

function fmtTime(s) {
  const mm = Math.floor(Math.max(0, s) / 60);
  const ss = Math.floor(Math.max(0, s) % 60).toString().padStart(2, '0');
  return mm + ':' + ss;
}

function missionListHtml() {
  return MISSION_DEFS.map((d, i) =>
    '<div class="mission-row"><b>' + (i + 1) + '. ' + d.name + '</b> — ' + d.objective +
    ' <span class="dim">(' + d.time + ', ' + fmtTime(d.timeLimit) + ')</span></div>').join('');
}

function showTitle() {
  screen = 'title';
  showOverlay(
    '<div class="panel"><h1>ISLAND COURIER</h1>' +
    '<div class="sub">Pilot kurir antar-pulau tropis — terbang, antar, mendarat.</div>' +
    missionListHtml() +
    '<div class="controls">W/S atau ↑/↓ throttle &nbsp;·&nbsp; A/D atau ←/→ bank &nbsp;·&nbsp; I/K naik-turun<br>' +
    'SPACE drop / konfirmasi &nbsp;·&nbsp; P pause &nbsp;·&nbsp; M mute &nbsp;·&nbsp; R restart misi<br>' +
    'Stall di bawah 55 kt — jaga kecepatan. Isi bahan bakar hanya di bandara.</div>' +
    '<div class="best">BEST SCORE: ' + bestScore + '</div>' +
    '<button id="btn-start">✈ &nbsp;TERBANG — SORTIE 1</button>' +
    '<div class="dim small">v1.0 · PixiJS · seed ' + params.seed + '</div></div>'
  );
  document.getElementById('btn-start').addEventListener('click', () => {
    audio.ensure();
    beginMission(0);
  });
}

function showBriefing(index) {
  screen = 'briefing';
  const def = MISSION_DEFS[index];
  showOverlay(
    '<div class="panel"><h2>' + def.title + '</h2>' +
    '<div class="brief">' + def.brief + '</div>' +
    '<div class="controls">Target: <b>' + def.objective + '</b><br>Waktu: ' + fmtTime(def.timeLimit) +
    ' &nbsp;·&nbsp; Kondisi: ' + def.time + (index === 3 ? ' · hujan + crosswind' : '') + '</div>' +
    '<button id="btn-fly">✈ &nbsp;FLY</button></div>'
  );
  document.getElementById('btn-fly').addEventListener('click', () => {
    audio.ensure();
    screen = 'play';
    ms.phase = 'flying';
    hideOverlay();
  });
}

function showComplete() {
  screen = 'complete';
  const def = MISSION_DEFS[ms.index];
  const total = ms.totalScore + ms.score;
  const last = hasNextMission(ms);
  showOverlay(
    '<div class="panel"><h2>✓ ' + def.name + ' SELESAI</h2>' +
    '<div class="big-score">SCORE ' + total + ' <span class="dim">(+ ' + ms.score + ' misi ini)</span></div>' +
    '<div class="controls">Waktu tersisa: ' + fmtTime(ms.timeLeft) + ' &nbsp;·&nbsp; Damage: ' + Math.round(plane.damage) + '%</div>' +
    (last
      ? '<button id="btn-next">LANJUT SORTIE ' + (ms.index + 2) + ' →</button>'
      : '<button id="btn-again">↻ MAIN LAGI DARI SORTIE 1</button>') +
    '</div>'
  );
  const btn = document.getElementById(last ? 'btn-next' : 'btn-again');
  btn.addEventListener('click', () => {
    audio.ensure();
    if (last) beginMission(ms.index + 1);
    else beginMission(0);
  });
}

function showFailed(reason) {
  screen = 'failed';
  gameOverReason = reason;
  showOverlay(
    '<div class="panel"><h2>✕ MISI GAGAL</h2>' +
    '<div class="brief">' + reason + '</div>' +
    '<div class="controls">Score sejauh ini: ' + (ms.totalScore + ms.score) + '</div>' +
    '<button id="btn-retry">↻ COBA LAGI — ' + MISSION_DEFS[ms.index].name + '</button>' +
    '<button id="btn-title" class="ghost">MENU UTAMA</button></div>'
  );
  document.getElementById('btn-retry').addEventListener('click', () => { audio.ensure(); beginMission(ms.index); });
  document.getElementById('btn-title').addEventListener('click', () => { showTitle(); });
}

function showGameOver(reason) {
  screen = 'gameover';
  gameOverReason = reason;
  const total = ms.totalScore + ms.score;
  if (total > bestScore) {
    bestScore = total;
    try { window.localStorage.setItem('islandCourierBest', String(bestScore)); } catch (e) { /* storage unavailable */ }
  }
  showOverlay(
    '<div class="panel"><h2>💥 PESAWAT JATUH</h2>' +
    '<div class="brief">' + reason + '</div>' +
    '<div class="big-score">SCORE ' + total + '</div>' +
    '<div class="best">BEST: ' + bestScore + '</div>' +
    '<button id="btn-retry2">↻ COBA LAGI — ' + MISSION_DEFS[ms.index].name + '</button>' +
    '<button id="btn-title2" class="ghost">MENU UTAMA</button></div>'
  );
  document.getElementById('btn-retry2').addEventListener('click', () => { audio.ensure(); beginMission(ms.index); });
  document.getElementById('btn-title2').addEventListener('click', () => { showTitle(); });
}

function showPaused() {
  screen = 'paused';
  showOverlay(
    '<div class="panel"><h2>⏸ PAUSED</h2>' +
    '<div class="controls">' + MISSION_DEFS[ms.index].name + ' — ' + fmtTime(ms.timeLeft) + ' tersisa</div>' +
    '<button id="btn-resume">▶ LANJUT</button>' +
    '<button id="btn-restart" class="ghost">↻ RESTART MISI</button></div>'
  );
  document.getElementById('btn-resume').addEventListener('click', () => { screen = 'play'; hideOverlay(); });
  document.getElementById('btn-restart').addEventListener('click', () => { beginMission(ms.index); });
}

function beginMission(index) {
  // Bank the finished mission's score when advancing; fresh campaign resets.
  if (index === 0) {
    ms.totalScore = 0;
  } else if (index === ms.index + 1 && ms.phase === 'done') {
    ms.totalScore += ms.score;
  }
  const def = MISSION_DEFS[index];
  buildRendererFor(def.time);
  startMission(ms, world, plane, index);
  const from = world.islands.find((i) => i.id === def.from);
  const rw = from.runway;
  const startHeading = rw ? rw.heading : 90;
  const sx = rw ? rw.x - Math.sin((startHeading * Math.PI) / 180) * (rw.len / 2 - 40) : from.x;
  const sy = rw ? rw.y + Math.cos((startHeading * Math.PI) / 180) * (rw.len / 2 - 40) : from.y;
  resetPlane(plane, sx, sy, startHeading, { cargo: def.id === 'cargo' || def.id === 'storm' ? 1 : 0 });
  plane.gearDown = true;
  prevDropDone = false;
  campaignDone = false;
  showBriefing(index);
}

// One fixed step of simulation. ctrl: {throttle, bank, pitch, flare}.
function stepOnce(ctrl, dt) {
  const prevAlt = plane.altitude;
  const wind = windForMission(ms.index, time, rng);
  const events = stepFlight(plane, ctrl, wind, dt, rng);
  for (const ev of events) pushEvent(ms, ev);
  time += dt;

  const clamped = clampToWorld(plane.x, plane.y);
  plane.x = clamped.x; plane.y = clamped.y;

  // --- Touchdown / crash / ditching, the moment wheels meet the ground.
  if (prevAlt > 0 && plane.altitude === 0 && plane.onGround) {
    let onRunway = null;
    let chk = null;
    for (const isl of world.islands) {
      if (!isl.runway) continue;
      const c = runwayCheck(isl.runway, plane.x, plane.y, plane.heading);
      if (c.inside) { onRunway = isl.runway; chk = c; break; }
    }
    if (onRunway && chk.headingDiff <= 20) {
      const res = landingResult(ms, world, plane);
      if (res.kind === 'hard') {
        applyDamage(plane, 25, 'hard landing');
        plane.altitude = 45; plane.vspeed = 180; plane.onGround = false;
        audio.thud(true);
        showMessage(ms, 'HARD LANDING! −25 DMG', 2, time);
        pushEvent(ms, 'HARD LANDING −25 DMG');
        renderer.spawnParticles(plane.x, plane.y, 'smoke', 14);
      } else {
        audio.thud(false);
        renderer.spawnParticles(plane.x, plane.y, 'smoke', 10);
        plane.fuel = 100;
        if (res.kind === 'landed' && isLandingMission(ms) && ms.phase === 'done') {
          showComplete();
        } else if (res.kind === 'landed') {
          showMessage(ms, (res.smooth ? 'SMOOTH LANDING +' : 'LANDED +') + res.points + ' — REFUELLED', 2, time);
        }
      }
    } else if (onRunway) {
      // On the strip but badly misaligned: bounce off with damage.
      applyDamage(plane, 20, 'misaligned touchdown');
      plane.altitude = 40; plane.vspeed = 160; plane.onGround = false;
      audio.thud(true);
      showMessage(ms, 'MISALIGNED! GO AROUND', 2, time);
      pushEvent(ms, 'MISALIGNED TOUCHDOWN −20 DMG');
    } else if (islandAt(world, plane.x, plane.y)) {
      applyDamage(plane, 100, 'terrain impact');
      audio.thud(true);
      renderer.spawnParticles(plane.x, plane.y, 'smoke', 22);
      showGameOver('Menabrak daratan di luar runway — pesawat hancur. Mendaratlah hanya di strip runway dengan heading selaras (±20°).');
    } else {
      applyDamage(plane, 100, 'ditching');
      audio.splash();
      renderer.spawnParticles(plane.x, plane.y, 'splash', 22);
      showFailed('Ditching di laut — pesawat tenggelam. Jaga altitude di atas laut, atau mendarat di runway.');
    }
  }

  // --- Mission logic while flying.
  if (screen === 'play' && ms.phase === 'flying') {
    const outcome = updateMission(ms, world, plane, input, time, dt);
    if (ms.dropDone && !prevDropDone) {
      renderer.spawnParticles(plane.x, plane.y, 'crate', 1);
    }
    prevDropDone = ms.dropDone;
    if (outcome === 'complete') {
      audio.delivered();
      showComplete();
    } else if (outcome === 'failed') {
      showFailed('Waktu habis — ' + MISSION_DEFS[ms.index].name + ' tidak selesai sebelum timer 0:00.');
    }
  }

  // --- Storm lightning (mission 4): random flashes + thunder.
  // Follows the active palette, not the mission: the landing shot stages
  // mission 4 in daylight, so it must stay dry and flash-free.
  lightningFlash = false;
  if (paletteKey === 'night' && screen === 'play') {
    lightningTimer -= dt;
    if (lightningTimer <= 0) {
      lightningTimer = 5 + rng() * 9;
      lightningFlash = true;
      audio.thunder();
    }
  }

  // --- Audio follows the engine.
  const raining = paletteKey === 'night';
  audio.update(plane.throttle, plane.speed, !plane.onGround, raining && screen === 'play');
}

function readControls() {
  const flare = input.isDown('Space') && plane.altitude < 150;
  return {
    throttle: (input.throttleUp ? 1 : 0) - (input.throttleDown ? 1 : 0),
    bank: (input.bankRight ? 1 : 0) - (input.bankLeft ? 1 : 0),
    pitch: (input.pitchUp ? 1 : 0) - (input.pitchDown ? 1 : 0),
    flare,
  };
}

function attractStep(dt) {
  // Title-screen autopilot: lazy orbit around Pulau Karang, gear up, cruising.
  attractAngle += dt * 0.12;
  const cx = 950 + Math.cos(attractAngle) * 900;
  const cy = 3050 + Math.sin(attractAngle) * 700;
  const dx = cx - plane.x, dy = cy - plane.y;
  const want = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const diff = wrapAngleDeg(want - plane.heading);
  stepOnce({
    throttle: plane.speed < 120 ? 0.9 : -0.4,
    bank: clamp(diff / 30, -1, 1),
    pitch: clamp((1100 - plane.altitude) / 600, -1, 1),
    flare: false,
  }, dt);
}

// --- Public handles used by shots.js and the debug handle.
const game = {
  world, plane, ms, input, time: 0,
  resetForMission(index, opts) {
    const def = MISSION_DEFS[index];
    buildRendererFor(def.time);
    startMission(ms, world, plane, index);
    resetPlane(plane, opts.x, opts.y, opts.heading, opts);
    ms.phase = 'flying';
    screen = 'play';
    hideOverlay();
  },
  stepOnce,
  setScreen(s) { screen = s; if (s === 'play') hideOverlay(); },
  setPalette(key) { buildRendererFor(key); },
  shotReadyAfter: -1,
};
game.time = time;

window.addEventListener('pointerdown', () => audio.ensure(), { once: false });
window.addEventListener('keydown', () => audio.ensure(), { once: false });

// --- Main loop: fixed-step accumulator, render every frame.
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dtMs = Math.min(100, now - last);
  last = now;
  acc += dtMs / 1000;

  // Global keys.
  if (input.wasPressed('KeyM')) {
    audio.setMuted(!audio.isMuted());
    pushEvent(ms, audio.isMuted() ? 'MUTED' : 'SOUND ON');
  }
  if (input.wasPressed('KeyP') && (screen === 'play' || screen === 'paused')) {
    if (screen === 'play') showPaused();
    else { screen = 'play'; hideOverlay(); }
  }
  if (input.wasPressed('KeyR') && (screen === 'play' || screen === 'paused' || screen === 'failed' || screen === 'gameover')) {
    beginMission(ms.index);
  }
  // Space / Enter: title -> briefing, briefing -> play (FLY). One screen
  // per press — the else-if keeps a single press from skipping briefing.
  if (input.wasPressed('Space') || input.wasPressed('Enter')) {
    if (screen === 'title') {
      audio.ensure();
      beginMission(0);
    } else if (screen === 'briefing') {
      audio.ensure();
      screen = 'play';
      ms.phase = 'flying';
      hideOverlay();
    }
  }

  let steps = 0;
  while (acc >= STEP && steps < 5) {
    acc -= STEP;
    steps++;
    // In shot mode, freeze the sim once the shot is staged: the capture
    // tool waits ~400 ms after __shotReady, and without the freeze the
    // plane would keep flying (hundreds of units) before the screenshot.
    if (screen === 'play' && ms.phase === 'flying' && !window.__shotReady) {
      stepOnce(readControls(), STEP);
    } else if (screen === 'title') {
      attractStep(STEP);
    }
    game.time = time;
  }
  if (steps === 5) acc = 0;

  // Render.
  const raining = paletteKey === 'night' && screen === 'play';
  renderer.render({ plane, ms, time, raining, lightning: lightningFlash });
  if (screen === 'play' || screen === 'paused' || screen === 'title') {
    hud.draw({ plane, ms, time, screen });
  }
  hud.layer.visible = screen === 'play' || screen === 'paused' || screen === 'title';

  if (shotFramesLeft > 0) {
    shotFramesLeft--;
    if (shotFramesLeft === 0) window.__shotReady = true;
  }
  input.endFrame();
}

// --- Read-only debug handle for automated playtests (invisible, no gameplay effect).
window.__IC = {
  getState() {
    const def = MISSION_DEFS[ms.index];
    return {
      screen,
      missionIndex: ms.index,
      missionName: def.name,
      objective: def.objective,
      plane: {
        x: Math.round(plane.x), y: Math.round(plane.y),
        alt: Math.round(plane.altitude), speed: Math.round(plane.speed * 10) / 10,
        heading: Math.round(plane.heading), throttle: Math.round(plane.throttle * 100) / 100,
        fuel: Math.round(plane.fuel), damage: Math.round(plane.damage), cargo: plane.cargo,
      },
      score: ms.totalScore + ms.score,
      timeLeft: Math.round(ms.timeLeft),
      events: ms.events.slice(-4),
    };
  },
};

// --- Boot.
beginMission(0);
showTitle();
plane.altitude = 1100; plane.speed = 120; plane.throttle = 0.65; plane.onGround = false;
if (params.shot) {
  const ok = applyShot(game, params.shot);
  if (ok) shotFramesLeft = 2;
}
requestAnimationFrame(frame);
