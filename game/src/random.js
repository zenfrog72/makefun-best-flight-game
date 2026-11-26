// ISLAND COURIER — seeded randomness (mulberry32) + URL params.
// Every run with the same ?seed= lays out the same clouds, gusts and rings.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function readParams() {
  const q = new URLSearchParams(window.location.search);
  const seedRaw = q.get('seed');
  const seed = seedRaw === null ? (Date.now() % 100000) : (parseInt(seedRaw, 10) || hashSeed(seedRaw));
  return { seed, shot: q.get('shot'), mission: q.get('mission') };
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function degToRad(d) { return (d * Math.PI) / 180; }
export function radToDeg(r) { return (r * 180) / Math.PI; }
export function wrapAngleDeg(d) {
  let v = d % 360;
  if (v > 180) v -= 360;
  if (v < -180) v += 360;
  return v;
}
export function angleDiffDeg(a, b) { return wrapAngleDeg(a - b); }
export function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
