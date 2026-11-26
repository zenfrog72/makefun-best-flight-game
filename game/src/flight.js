// ISLAND COURIER — flight model.
// Small prop courier: throttle sets an equilibrium speed, bank turns the
// plane, pitch commands vertical speed, lift falls off below stall speed.
// Units: speed knots, altitude feet, vertical speed feet/minute, angles deg.

import {
  STALL_KT, MAX_BANK_DEG, CRUISE_MAX_KT, IDLE_MIN_KT,
  CLIMB_FPM, SINK_FPM, FUEL_MAX, FUEL_BURN_PER_SEC, DAMAGE_MAX,
} from './config.js';
import { clamp, wrapAngleDeg, degToRad } from './random.js';

export function createPlane(startX, startY, startHeading) {
  return {
    x: startX, y: startY,
    heading: startHeading, // deg, 0 = north (up), 90 = east
    speed: 0,              // kt
    altitude: 0,           // ft above sea level
    vspeed: 0,             // fpm
    throttle: 0,
    bank: 0,               // deg, + = right
    pitch: 0,              // -1..1 command
    fuel: FUEL_MAX,
    damage: 0,
    cargo: 0,
    gearDown: true,
    flaps: 0,
    onGround: true,
    stalled: false,
    propAngle: 0,
  };
}

export function resetPlane(plane, x, y, heading, opts) {
  const o = opts || {};
  plane.x = x; plane.y = y; plane.heading = heading;
  plane.speed = o.speed || 0;
  plane.altitude = o.altitude || 0;
  plane.vspeed = 0;
  plane.throttle = o.throttle || 0;
  plane.bank = 0; plane.pitch = 0;
  plane.fuel = o.fuel !== undefined ? o.fuel : FUEL_MAX;
  plane.damage = o.damage || 0;
  plane.cargo = o.cargo || 0;
  plane.gearDown = (o.altitude || 0) < 500;
  plane.flaps = 0;
  plane.onGround = (plane.altitude <= 0);
  plane.stalled = false;
}

// One fixed 1/60 s step. ctrl: {throttle, bank, pitch, flare}
// wind: {x, y} drift in world units/sec. Returns event strings for the log.
export function stepFlight(plane, ctrl, wind, dt, rng) {
  const events = [];
  const wasAirborne = plane.altitude > 0 || !plane.onGround;

  // --- Throttle -> equilibrium speed, drag pulls toward it.
  plane.throttle = clamp(plane.throttle + ctrl.throttle * dt * 1.4, 0, 1);
  const targetSpeed = IDLE_MIN_KT + plane.throttle * (CRUISE_MAX_KT - IDLE_MIN_KT);
  const accel = plane.onGround ? 26 : 14; // kt per second toward equilibrium
  plane.speed += clamp(targetSpeed - plane.speed, -accel * dt, accel * dt);

  // --- Stall: below stall speed lift collapses, controls go mushy.
  plane.stalled = plane.speed < STALL_KT && plane.altitude > 5;
  const controlAuthority = plane.stalled ? 0.4 : 1;

  // --- Bank: ease toward commanded bank, then turn.
  const targetBank = clamp(ctrl.bank, -1, 1) * MAX_BANK_DEG;
  plane.bank += clamp(targetBank - plane.bank, -90 * dt, 90 * dt);
  const speedFactor = clamp(95 / Math.max(plane.speed, 40), 0.45, 1.4);
  const turnRate = plane.bank * 0.5 * speedFactor * controlAuthority; // deg/sec
  plane.heading = wrapAngleDeg(plane.heading + turnRate * dt);

  // --- Pitch: commanded vertical speed, flare softens the descent.
  const targetVs = clamp(ctrl.pitch, -1, 1) * (ctrl.pitch >= 0 ? CLIMB_FPM : SINK_FPM);
  let vs = targetVs;
  if (plane.altitude < 120 && vs < 0 && ctrl.flare) vs *= 0.35; // flare
  if (plane.stalled) vs = Math.min(vs, -650); // sinking wing
  if (plane.altitude <= 0 && vs < 0) vs = 0;
  plane.vspeed += (vs - plane.vspeed) * Math.min(1, dt * 3.2);
  plane.altitude += (plane.vspeed / 60) * dt;

  // --- Move through the air, plus wind drift and a little gust wobble.
  const headingRad = degToRad(plane.heading);
  const worldSpeed = plane.speed * 1.9; // world units per second at 1 kt
  plane.x += Math.sin(headingRad) * worldSpeed * dt + wind.x * dt;
  plane.y -= Math.cos(headingRad) * worldSpeed * dt + wind.y * dt;
  if (rng) {
    plane.x += (rng() - 0.5) * 1.6 * dt * 60 * 0.02;
    plane.y += (rng() - 0.5) * 1.6 * dt * 60 * 0.02;
  }

  // --- Fuel burn, only while the engine is turning.
  if (plane.throttle > 0.02 && !plane.onGround) {
    plane.fuel = Math.max(0, plane.fuel - FUEL_BURN_PER_SEC * plane.throttle * dt);
  }
  if (plane.fuel <= 0 && plane.throttle > 0) {
    plane.throttle = 0;
    events.push('FUEL EMPTY — engine out');
  }

  // --- Ground contact bookkeeping.
  if (plane.altitude <= 0) {
    plane.altitude = 0;
    plane.vspeed = 0;
    plane.onGround = true;
  } else {
    plane.onGround = false;
  }
  // Gear: down only low (final approach / on the ground), up in cruise.
  plane.gearDown = plane.altitude < 500;
  if (wasAirborne && plane.onGround && plane.altitude === 0) {
    // touchdown handled by the caller (runway / land / sea checks)
  }

  plane.propAngle += (2 + plane.throttle * 38) * dt;
  plane.damage = clamp(plane.damage, 0, DAMAGE_MAX);
  return events;
}

export function applyDamage(plane, amount, why) {
  plane.damage = clamp(plane.damage + amount, 0, DAMAGE_MAX);
  return plane.damage >= DAMAGE_MAX ? 'destroyed' : 'damaged';
}

export function headingToCompass(heading) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(((heading % 360) + 360) % 360 / 22.5) % 16;
  return dirs[idx];
}
