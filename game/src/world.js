// ISLAND COURIER — the archipelago: islands, runways, weather, rings.
// Fixed layout from the seed so every screenshot run matches. Positions are
// world units (6000 x 4000). Headings in degrees, 0 = north.

import { WORLD_W, WORLD_H } from './config.js';
import { mulberry32, range, clamp, degToRad, dist } from './random.js';

export function buildWorld(seed) {
  const rng = mulberry32(seed);
  const islands = [
    {
      id: 'karang', name: 'Pulau Karang', x: 950, y: 3050, r: 620,
      kind: 'hub', color: 0x4fae5d,
      runway: { x: 950, y: 3050, heading: 90, len: 560, wid: 52, name: '09/27' },
      town: true, hangar: true,
    },
    {
      id: 'api', name: 'Tanjung Api', x: 4650, y: 950, r: 560,
      kind: 'volcano', color: 0x6a8a4a,
      runway: { x: 4650, y: 950, heading: 110, len: 480, wid: 48, name: '11/29' },
      town: true, hangar: true,
    },
    {
      id: 'lumba', name: 'Pulau Lumba', x: 3150, y: 2550, r: 430,
      kind: 'ring', color: 0x58b368,
      runway: null, town: false, hangar: false,
    },
    {
      id: 'kecil', name: 'Pulau Karang Kecil', x: 1500, y: 1050, r: 330,
      kind: 'drop', color: 0x63b06a,
      runway: null, town: false, hangar: false,
      dropZone: { x: 1500, y: 1050, r: 150 },
    },
    {
      id: 'badai', name: 'Pulau Badai', x: 5150, y: 3150, r: 480,
      kind: 'storm', color: 0x4a7a52,
      runway: { x: 5150, y: 3150, heading: 70, len: 340, wid: 42, name: '07/25' },
      town: false, hangar: true,
    },
  ];

  // Reefs: shallow coral patches scattered between the islands.
  const reefs = [];
  for (let i = 0; i < 26; i++) {
    reefs.push({ x: range(rng, 200, WORLD_W - 200), y: range(rng, 200, WORLD_H - 200), r: range(rng, 60, 170) });
  }

  // Clouds drift slowly; seeded positions, parallax handled by the renderer.
  const clouds = [];
  for (let i = 0; i < 34; i++) {
    clouds.push({
      x: range(rng, 0, WORLD_W), y: range(rng, 0, WORLD_H),
      s: range(rng, 60, 150), speed: range(rng, 4, 14), layer: i % 3,
    });
  }

  // Slalom rings around Pulau Lumba, each with its own altitude band.
  const rings = [];
  const cx = 3150, cy = 2550;
  for (let i = 0; i < 6; i++) {
    const a = degToRad(i * 60 - 30);
    rings.push({
      x: cx + Math.sin(a) * 520, y: cy + Math.cos(a) * 520,
      r: 90, altMin: 600 + (i % 3) * 250, altMax: 600 + (i % 3) * 250 + 500,
      index: i,
    });
  }

  return { islands, reefs, clouds, rings, rng };
}

export function islandAt(world, x, y) {
  for (const isl of world.islands) {
    if (dist(x, y, isl.x, isl.y) < isl.r) return isl;
  }
  return null;
}

export function isSea(world, x, y) { return !islandAt(world, x, y); }

// Runway-local test: returns {along, cross, headingDiff} or null.
export function runwayCheck(runway, x, y, heading) {
  const dx = x - runway.x;
  const dy = y - runway.y;
  const h = degToRad(runway.heading);
  // Local frame: forward = (sin h, -cos h), right = (cos h, sin h).
  const fwd = Math.sin(h) * dx - Math.cos(h) * dy;
  const rgt = Math.cos(h) * dx + Math.sin(h) * dy;
  let diff = Math.abs(((heading - runway.heading) % 360 + 540) % 360 - 180);
  const diffRev = Math.abs(((heading - (runway.heading + 180)) % 360 + 540) % 360 - 180);
  const headingDiff = Math.min(diff, diffRev);
  const inside = Math.abs(fwd) <= runway.len / 2 && Math.abs(rgt) <= runway.wid / 2;
  return { along: fwd, cross: rgt, headingDiff, inside };
}

export function windForMission(missionIndex, t, rng) {
  // Base wind per mission + slow gusts that swing with time.
  const base = [
    { x: 6, y: -3 },   // cargo run: light sea breeze
    { x: -4, y: 8 },   // slalom: cross breeze
    { x: 10, y: 5 },   // medical drop: steady push
    { x: 22, y: -14 }, // storm night: strong crosswind
  ][missionIndex] || { x: 0, y: 0 };
  const gust = Math.sin(t * 0.35) * 6 + Math.sin(t * 1.1) * 3;
  return { x: base.x + gust, y: base.y + gust * 0.6 };
}

export function clampToWorld(x, y) {
  return { x: clamp(x, 60, WORLD_W - 60), y: clamp(y, 60, WORLD_H - 60) };
}
