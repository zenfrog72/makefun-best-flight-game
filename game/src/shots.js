// ISLAND COURIER — deterministic screenshot states.
// ?shot=cover|ring|landing|storm&seed=1 stages a scene by flying the plane
// with a simple autopilot for a fixed number of steps, renders twice, then
// sets window.__shotReady = true so the screenshot tool knows it is settled.

import { STEP } from './config.js';
import { clamp, wrapAngleDeg } from './random.js';
import { MISSION_DEFS } from './missions.js';

export const SHOT_NAMES = ['cover', 'ring', 'landing', 'storm'];

function autopilotStep(game, targetX, targetY, targetAlt, targetSpeed) {
  const { plane, input } = game;
  const dx = targetX - plane.x;
  const dy = targetY - plane.y;
  const wantHeading = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const diff = wrapAngleDeg(wantHeading - plane.heading);
  const ctrl = {
    throttle: 0,
    bank: clamp(diff / 30, -1, 1),
    pitch: clamp((targetAlt - plane.altitude) / 600, -1, 1),
    flare: false,
  };
  // Throttle: push up if slow, ease off if fast.
  ctrl.throttle = plane.speed < targetSpeed ? 0.9 : -0.6;
  return ctrl;
}

export function applyShot(game, name) {
  const { world, plane, ms } = game;
  const karang = world.islands.find((i) => i.id === 'karang');
  const api = world.islands.find((i) => i.id === 'api');
  const lumba = world.islands.find((i) => i.id === 'lumba');
  const badai = world.islands.find((i) => i.id === 'badai');
  const kecil = world.islands.find((i) => i.id === 'kecil');

  let missionIndex = 0;
  let steps = 0;
  let target = null;
  let targetAlt = 1200;
  let targetSpeed = 120;

  if (name === 'cover') {
    // Mission 1, on final leg to Tanjung Api: aligned with runway 11
    // (heading 110). Staged ~950 out so the chase view ends ~690 out:
    // the whole island + volcano + runway strip sit above the plane's
    // nose instead of hiding behind it.
    missionIndex = 0;
    game.resetForMission(0, { x: 3757, y: 625, heading: 110, altitude: 1100, speed: 125, throttle: 0.7, fuel: 82, cargo: 1 });
    target = { x: api.runway.x, y: api.runway.y };
    steps = 60;
    targetAlt = 1100; targetSpeed = 125;
  } else if (name === 'ring') {
    // Mission 2 at dusk, flying toward the next ring gate. The chase view
    // needs the gate dead ahead and prominent, so the shot targets ring 3
    // directly (rings 1-2 already cleared): start ~1050 out on a 30°
    // approach, fly 1.5 s, end ~700 short of the gate — gold ring
    // above the plane's nose instead of centred on it.
    missionIndex = 1;
    const ring = world.rings[2];
    game.resetForMission(1, { x: 3145, y: 3459, heading: 30, altitude: 950, speed: 125, throttle: 0.7, fuel: 74, cargo: 0 });
    ms.ringsCleared = 2;
    target = { x: ring.x, y: ring.y };
    steps = 90;
    targetAlt = 950; targetSpeed = 125;
  } else if (name === 'landing') {
    // Real final approach to Pulau Badai runway 07 (heading 70). Staged
    // ~950 out so the chase view ends ~700 out: the strip + island sit
    // above the plane's nose, gear down, visibly descending (targetAlt
    // far below start alt saturates pitch to full sink, so vspeed is
    // still clearly negative when the screenshot is taken). Day light
    // (mission 4 is night; the landing shot is staged in daylight).
    missionIndex = 3;
    const rw = badai.runway;
    game.resetForMission(3, { x: 4257, y: 3475, heading: 70, altitude: 210, speed: 85, throttle: 0.45, fuel: 46, cargo: 1 });
    game.setPalette('day');
    target = { x: rw.x, y: rw.y };
    steps = 60 * 1.5;
    targetAlt = -400; targetSpeed = 85;
  } else if (name === 'storm') {
    // Mission 4, night storm, rain + lightning + lit runway ahead.
    // Staged ~950 out so the chase view ends ~650 out: island + lit
    // runway in frame above the plane's nose.
    missionIndex = 3;
    const rw = badai.runway;
    game.resetForMission(3, { x: 4257, y: 3475, heading: 70, altitude: 700, speed: 105, throttle: 0.6, fuel: 58, cargo: 1 });
    target = { x: rw.x, y: rw.y };
    steps = 60 * 1.5;
    targetAlt = 650; targetSpeed = 105;
  } else {
    return false;
  }

  // Fly the fixed number of steps with the autopilot, no rendering in between.
  for (let i = 0; i < steps; i++) {
    const ctrl = autopilotStep(game, target.x, target.y, targetAlt, targetSpeed);
    game.stepOnce(ctrl, STEP);
  }
  // The staged flight may have cleared the ring mid-flight; pin the shot state.
  if (name === 'ring') { ms.ringsCleared = 2; ms.score = 0; }
  ms.phase = 'flying';
  game.setScreen('play');
  game.shotReadyAfter = 2; // render twice, then flag ready
  return true;
}
