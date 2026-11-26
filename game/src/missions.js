// ISLAND COURIER — the four sorties, in order, score accumulated.
// Each mission: briefing, objective, win/fail rules, target for the HUD.

import { SCORE } from './config.js';
import { dist, angleDiffDeg } from './random.js';
import { runwayCheck, islandAt } from './world.js';

export const MISSION_DEFS = [
  {
    id: 'cargo', name: 'CARGO RUN', time: 'day',
    title: 'Sortie 1 — Cargo Run',
    brief: 'Fly the cargo crates from Pulau Karang to the volcano airstrip on Tanjung Api. Land on runway 11/29 before the timer runs out. Watch the stall — keep speed above 55 kt.',
    objective: 'Land at Tanjung Api',
    timeLimit: 240, from: 'karang', to: 'api',
  },
  {
    id: 'slalom', name: 'RING SLALOM', time: 'dusk',
    title: 'Sortie 2 — Ring Slalom',
    brief: 'Six glowing rings circle Pulau Lumba at sunset. Fly through every ring in order, inside its altitude band. Rings turn green as you clear them.',
    objective: 'Fly all 6 rings',
    timeLimit: 300, from: 'karang', to: 'lumba',
  },
  {
    id: 'drop', name: 'MEDICAL DROP', time: 'day',
    title: 'Sortie 3 — Medical Drop',
    brief: 'A clinic on Pulau Karang Kecil is waiting. Fly low and slow over the marked drop zone and press SPACE to release the crate. Below 400 ft and under 90 kt for a perfect drop.',
    objective: 'Drop the crate on the zone',
    timeLimit: 240, from: 'karang', to: 'kecil',
  },
  {
    id: 'storm', name: 'STORM NIGHT', time: 'night',
    title: 'Sortie 4 — Storm Night',
    brief: 'Night storm over Pulau Badai. The short runway 07/25 is lit, but rain, lightning and a hard crosswind are waiting. Land gentle — this strip forgives nothing.',
    objective: 'Land at Pulau Badai',
    timeLimit: 300, from: 'api', to: 'badai',
  },
];

export function createMissionState(world) {
  return {
    index: 0,
    phase: 'briefing', // briefing | flying | done | failed
    timeLeft: MISSION_DEFS[0].timeLimit,
    elapsed: 0,
    ringsCleared: 0,
    dropDone: false,
    dropQuality: null,
    landed: false,
    message: '',
    messageUntil: 0,
    score: 0,
    totalScore: 0,
    events: [],
  };
}

export function startMission(ms, world, plane, index) {
  const def = MISSION_DEFS[index];
  ms.index = index;
  ms.phase = 'briefing';
  ms.timeLeft = def.timeLimit;
  ms.elapsed = 0;
  ms.ringsCleared = 0;
  ms.dropDone = false;
  ms.dropQuality = null;
  ms.landed = false;
  ms.message = '';
  ms.score = 0;
  const from = world.islands.find((i) => i.id === def.from);
  const to = world.islands.find((i) => i.id === def.to);
  ms.target = to;
  ms.from = from;
  return def;
}

export function missionTarget(ms, world) {
  const def = MISSION_DEFS[ms.index];
  if (def.id === 'slalom') {
    const next = world.rings[Math.min(ms.ringsCleared, world.rings.length - 1)];
    return { x: next.x, y: next.y, label: 'RING ' + (ms.ringsCleared + 1) + '/6' };
  }
  if (def.id === 'drop') {
    const dz = world.islands.find((i) => i.id === 'kecil').dropZone;
    return { x: dz.x, y: dz.y, label: 'DROP ZONE' };
  }
  const to = world.islands.find((i) => i.id === def.to);
  const rw = to.runway;
  return { x: rw.x, y: rw.y, label: to.name.toUpperCase() + ' RWY ' + rw.name };
}

export function pushEvent(ms, text) {
  ms.events.push(text);
  if (ms.events.length > 8) ms.events.shift();
}

export function showMessage(ms, text, seconds, now) {
  ms.message = text;
  ms.messageUntil = now + seconds;
}

// Called every fixed step while flying. Returns 'complete' | 'failed' | null.
export function updateMission(ms, world, plane, input, now, dt) {
  const def = MISSION_DEFS[ms.index];
  ms.elapsed += dt;
  ms.timeLeft -= dt;
  if (ms.timeLeft <= 0) {
    pushEvent(ms, 'TIME UP — ' + def.name + ' failed');
    ms.phase = 'failed';
    return 'failed';
  }

  if (def.id === 'slalom') {
    const ring = world.rings[ms.ringsCleared];
    if (ring) {
      const d = dist(plane.x, plane.y, ring.x, ring.y);
      const inBand = plane.altitude >= ring.altMin && plane.altitude <= ring.altMax;
      if (d < ring.r && inBand && plane.altitude > 50) {
        ms.ringsCleared++;
        ms.score += SCORE.ring;
        pushEvent(ms, 'RING ' + ms.ringsCleared + '/6  +' + SCORE.ring);
        showMessage(ms, 'RING ' + ms.ringsCleared + '/6  +' + SCORE.ring, 1.6, now);
        if (ms.ringsCleared >= world.rings.length) {
          ms.score += Math.round(ms.timeLeft) * SCORE.timeBonusPerSec;
          ms.phase = 'done';
          return 'complete';
        }
      } else if (d < ring.r && !inBand && plane.altitude > 50) {
        showMessage(ms, 'WRONG ALTITUDE — band ' + ring.altMin + '–' + ring.altMax + ' ft', 1.2, now);
      }
    }
  }

  if (def.id === 'drop' && !ms.dropDone && input.wasPressed('Space')) {
    const dz = world.islands.find((i) => i.id === 'kecil').dropZone;
    const d = dist(plane.x, plane.y, dz.x, dz.y);
    if (d < dz.r + 60) {
      ms.dropDone = true;
      const perfect = plane.altitude < 400 && plane.speed < 90;
      ms.dropQuality = perfect ? 'perfect' : 'ok';
      const pts = perfect ? SCORE.dropPerfect : SCORE.dropOk;
      ms.score += pts;
      ms.score += Math.round(ms.timeLeft) * SCORE.timeBonusPerSec;
      pushEvent(ms, (perfect ? 'PERFECT DROP' : 'DROP DELIVERED') + '  +' + pts);
      showMessage(ms, (perfect ? 'PERFECT DROP! +' : 'CRATE DELIVERED +') + pts, 2, now);
      ms.phase = 'done';
      return 'complete';
    }
    showMessage(ms, 'NOT OVER THE DROP ZONE', 1.2, now);
  }

  // Landing missions: touchdown is judged by main.js (it calls landingResult).
  return null;
}

// Called by main.js the moment the wheels touch. Returns outcome object.
export function landingResult(ms, world, plane) {
  const def = MISSION_DEFS[ms.index];
  const to = world.islands.find((i) => i.id === def.to);
  if (!to || !to.runway) return { kind: 'land' };
  const chk = runwayCheck(to.runway, plane.x, plane.y, plane.heading);
  const aligned = chk.headingDiff <= 20;
  if (!chk.inside || !aligned) return { kind: 'offrunway' };

  const smooth = plane.vspeed > -400 && Math.abs(plane.bank) < 12;
  const hard = plane.vspeed <= -900 || Math.abs(plane.bank) > 25;
  if (hard) return { kind: 'hard', smooth: false };
  const pts = smooth ? SCORE.landingSmooth : SCORE.landingRough;
  ms.score += pts;
  if (def.id === 'cargo' || def.id === 'storm') {
    ms.score += SCORE.cargoDelivered;
    ms.score += Math.round(ms.timeLeft) * SCORE.timeBonusPerSec;
    ms.landed = true;
    ms.phase = 'done';
    pushEvent(ms, 'LANDED  +' + pts + '  CARGO +' + SCORE.cargoDelivered);
    showMessage(ms, (smooth ? 'SMOOTH LANDING! +' : 'LANDED +') + pts, 2.2, ms.elapsed);
    return { kind: 'landed', smooth, points: pts };
  }
  return { kind: 'landed', smooth, points: pts };
}

export function isLandingMission(ms) {
  const id = MISSION_DEFS[ms.index].id;
  return id === 'cargo' || id === 'storm';
}

export function nextMissionIndex(ms) { return ms.index + 1; }
export function hasNextMission(ms) { return ms.index + 1 < MISSION_DEFS.length; }
