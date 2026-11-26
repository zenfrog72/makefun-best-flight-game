// ISLAND COURIER — shared tuning constants.
// One place for every number the flight model, world and HUD agree on.

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const WORLD_W = 6000;
export const WORLD_H = 4000;
export const STEP = 1 / 60;

export const PLANE_SCREEN_X = 640;
export const PLANE_SCREEN_Y = 400;

export const STALL_KT = 55;
export const MAX_BANK_DEG = 45;
export const CRUISE_MAX_KT = 185;
export const IDLE_MIN_KT = 38;
export const CLIMB_FPM = 1150;
export const SINK_FPM = 1400;
export const SAFE_TOUCHDOWN_FPM = -400;
export const HARD_TOUCHDOWN_FPM = -900;

export const FUEL_MAX = 100;
export const FUEL_BURN_PER_SEC = 0.55; // at full throttle
export const DAMAGE_MAX = 100;

export const SCORE = {
  cargoDelivered: 500,
  ring: 150,
  dropPerfect: 600,
  dropOk: 300,
  landingSmooth: 400,
  landingRough: 150,
  timeBonusPerSec: 4,
};

// Day palettes per mission: [skyTop, skyBottom, seaShallow, seaDeep, sun]
export const PALETTES = {
  day:   { skyTop: 0x7ec8f2, skyBot: 0xd8f1ff, seaA: 0x2fd4c0, seaB: 0x0b7fa8, sand: 0xf2ddab, grass: 0x4fae5d, sun: 0xfff3b0 },
  dusk:  { skyTop: 0x5a4a8a, skyBot: 0xff9e5e, seaA: 0x3aa7a0, seaB: 0x1d4e7a, sand: 0xe8c48f, grass: 0x3f8a4a, sun: 0xffb347 },
  night: { skyTop: 0x0a1230, skyBot: 0x1d2f5e, seaA: 0x1c5f7a, seaB: 0x0a2e4a, sand: 0x9a8a68, grass: 0x2a5a3a, sun: 0xdde6ff },
};

export const ISLAND_NAMES = ['Pulau Karang', 'Tanjung Api', 'Pulau Lumba', 'Pulau Karang Kecil', 'Pulau Badai'];
