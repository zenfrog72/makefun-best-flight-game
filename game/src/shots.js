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
    // Mission 1 mid-flight, banking over the islands, runway ahead.
    missionIndex = 0;
    game.resetForMission(0, { x: 2600, y: 2100, heading: 55, altitude: 1400, speed: 130, throttle: 0.7, fuel: 82, cargo: 1 });
    target = { x: api.runway.x, y: api.runway.y };
    steps = 60 * 6;
    targetAlt = 1400; targetSpeed = 130;
  } else if (name === 'ring') {
    // Mission 2 at dusk, threading the second ring.
    missionIndex = 1;
    const ring = world.rings[1];
    game.resetForMission(1, { x: ring.x - 800, y: ring.y + 550, heading: 55, altitude: 950, speed: 125, throttle: 0.7, fuel: 74, cargo: 0 });
    ms.ringsCleared = 1;
    target = { x: ring.x, y: ring.y };
    steps = Math.round(60 * 2.9);
    targetAlt = 950; targetSpeed = 125;
  } else if (name === 'landing') {
    // Final approach to the short runway on Pulau Badai, gear down, windsock.
    // Day light (mission 4 is night; the landing shot is staged in daylight).
    missionIndex = 3;
    const rw = badai.runway;
    game.resetForMission(3, { x: rw.x - 1500, y: rw.y + 900, heading: 70, altitude: 320, speed: 88, throttle: 0.45, fuel: 46, cargo: 1 });
    game.setPalette('day');
    target = { x: rw.x, y: rw.y };
    steps = 60 * 5;
    targetAlt = 160; targetSpeed = 85;
  } else if (name === 'storm') {
    // Mission 4, night storm, rain + lightning + lit runway ahead.
    missionIndex = 3;
    const rw = badai.runway;
    game.resetForMission(3, { x: rw.x - 2200, y: rw.y + 1300, heading: 70, altitude: 900, speed: 110, throttle: 0.6, fuel: 58, cargo: 1 });
    target = { x: rw.x, y: rw.y };
    steps = 60 * 5;
    targetAlt = 700; targetSpeed = 105;
  } else {
    return false;
  }

  // Fly the fixed number of steps with the autopilot, no rendering in between.
  for (let i = 0; i < steps; i++) {
    const ctrl = autopilotStep(game, target.x, target.y, targetAlt, targetSpeed);
    game.stepOnce(ctrl, STEP);
  }
  // The staged flight may have cleared the ring mid-flight; pin the shot state.
  if (name === 'ring') { ms.ringsCleared = 1; ms.score = 0; }
  ms.phase = 'flying';
  game.setScreen('play');
  game.shotReadyAfter = 2; // render twice, then flag ready
  return true;
}
