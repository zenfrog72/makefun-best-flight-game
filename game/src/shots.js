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
    // (heading 110), ~630 units out; autopilot + post-ready drift leave
    // the runway centre ~200 units ahead — strip + volcano in the top
    // of the frame, plane still on approach over the sea.
    missionIndex = 0;
    game.resetForMission(0, { x: 4058, y: 735, heading: 110, altitude: 1100, speed: 125, throttle: 0.7, fuel: 82, cargo: 1 });
    target = { x: api.runway.x, y: api.runway.y };
    steps = 60;
    targetAlt = 1100; targetSpeed = 125;
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
    // Real final approach to Pulau Badai runway 07 (heading 70): ~650 units
    // out, 1.5 s at 85 kt leaves the centre ~250 ahead, i.e. the near
    // threshold ~0.8 km ahead, alt ~200 ft and visibly descending
    // (targetAlt far below start alt saturates pitch to full sink, so
    // vspeed is still clearly negative when the screenshot is taken),
    // gear down. Day light (mission 4 is night; the landing shot is
    // staged in daylight).
    missionIndex = 3;
    const rw = badai.runway;
    game.resetForMission(3, { x: 4539, y: 3372, heading: 70, altitude: 210, speed: 85, throttle: 0.45, fuel: 46, cargo: 1 });
    game.setPalette('day');
    target = { x: rw.x, y: rw.y };
    steps = 60 * 1.5;
    targetAlt = -400; targetSpeed = 85;
  } else if (name === 'storm') {
    // Mission 4, night storm, rain + lightning + lit runway ahead.
    // ~730 units out, 1.5 s at 105 kt leaves the island centre ~250 ahead
    // — island + runway lights in frame.
    missionIndex = 3;
    const rw = badai.runway;
    game.resetForMission(3, { x: 4464, y: 3400, heading: 70, altitude: 700, speed: 105, throttle: 0.6, fuel: 58, cargo: 1 });
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
  if (name === 'ring') { ms.ringsCleared = 1; ms.score = 0; }
  ms.phase = 'flying';
  game.setScreen('play');
  game.shotReadyAfter = 2; // render twice, then flag ready
  return true;
}
