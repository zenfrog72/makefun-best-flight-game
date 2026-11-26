// ISLAND COURIER — chase-view renderer, screenshot staging only.
// Pseudo-3D ground-plane projection: camera behind the plane, looking
// forward over the nose toward the horizon. Used ONLY when ?shot= is set
// (main.js picks this renderer instead of the top-down one); normal
// gameplay keeps the top-down renderer in render.js, untouched.
// The HUD stays screen-space above this layer, exactly as before.

import { VIEW_W, VIEW_H, PALETTES } from './config.js';
import { clamp, degToRad, mulberry32 } from './random.js';
import { missionTarget } from './missions.js';

const HORIZON = 292;   // screen y of the horizon line
const FOCAL = 520;     // perspective focal length, world units
const PLANE_X = 640;   // plane screen position (bottom-centre foreground)
const PLANE_Y = 590;   // low in the frame so the target ahead stays visible above the nose

function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }

// Vertical gradient texture (same trick as render.js: 4px wide, 256 steps).
function makeVGrad(top, bot) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bot);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = PIXI.Texture.from(c);
  tex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  return tex;
}

export function createChaseRenderer(app, world, paletteKey) {
  const palette = PALETTES[paletteKey] || PALETTES.day;
  const night = paletteKey === 'night';
  const dusk = paletteKey === 'dusk';

  const root = new PIXI.Container();
  app.stage.addChild(root);

  // Sky above the horizon, sea below it (static gradient sprites).
  const sky = new PIXI.Sprite(makeVGrad(hex(palette.skyTop), hex(palette.skyBot)));
  sky.width = VIEW_W; sky.height = HORIZON;
  root.addChild(sky);
  const sea = new PIXI.Sprite(makeVGrad(hex(palette.seaA), hex(palette.seaB)));
  sea.width = VIEW_W; sea.height = VIEW_H - HORIZON;
  sea.position.set(0, HORIZON);
  root.addChild(sea);

  // Everything in the world (clouds, reefs, islands, runways, rings) is
  // redrawn into one Graphics each frame, far-to-near.
  const g = new PIXI.Graphics();
  root.addChild(g);

  // Rain + lightning live in screen space, above the world.
  const rainLayer = new PIXI.Graphics();
  root.addChild(rainLayer);
  const flash = new PIXI.Graphics();
  root.addChild(flash);

  // The plane itself, from behind: screen-space container, bottom-centre.
  const planeLayer = new PIXI.Container();
  planeLayer.position.set(PLANE_X, PLANE_Y);
  root.addChild(planeLayer);
  const planeGfx = new PIXI.Graphics();
  planeLayer.addChild(planeGfx);

  const fxLayer = new PIXI.Graphics(); // touchdown smoke / splash / crate
  root.addChild(fxLayer);

  // Fixed stars (night) + rain drops: seeded so re-captures match.
  const starRng = mulberry32(7);
  const stars = [];
  for (let i = 0; i < 46; i++) {
    stars.push({ x: starRng() * VIEW_W, y: 8 + starRng() * (HORIZON - 24), r: 1 + starRng() * 1.6 });
  }
  const rainRng = mulberry32(99);
  const rainDrops = [];
  for (let i = 0; i < 160; i++) {
    rainDrops.push({ x: rainRng() * VIEW_W, y: rainRng() * VIEW_H, v: 900 + rainRng() * 400 });
  }
  let flashLevel = 0;
  const particles = [];

  // --- Projection: world point -> heading-relative (fwd, rgt), then screen.
  function project(plane, x, y) {
    const h = degToRad(plane.heading);
    const dx = x - plane.x, dy = y - plane.y;
    return {
      fwd: Math.sin(h) * dx - Math.cos(h) * dy,
      rgt: Math.cos(h) * dx + Math.sin(h) * dy,
    };
  }
  // fwd is clamped to >= 6 so geometry just behind the camera still
  // draws down to the bottom edge instead of flipping.
  function screenPos(fwd, rgt) {
    const f = Math.max(fwd, 6);
    const s = FOCAL / (FOCAL + f);
    return { x: PLANE_X + rgt * s, y: HORIZON + (VIEW_H - HORIZON) * s, s };
  }

  function drawSkyExtras() {
    if (night) {
      // Moon + stars. Kept left of the fuel bars (x >= 1054).
      g.beginFill(0xdde6ff, 0.95);
      g.drawCircle(880, 100, 26);
      g.endFill();
      g.beginFill(0xdde6ff, 0.18);
      g.drawCircle(880, 100, 44);
      g.endFill();
      g.beginFill(0xffffff, 0.85);
      for (const st of stars) g.drawCircle(st.x, st.y, st.r);
      g.endFill();
    } else {
      // Sun: high by day, low and warm at dusk. Kept left of the fuel
      // bars (x >= 1054) so it never sits behind the HUD.
      const sx = dusk ? 930 : 880, sy = dusk ? 232 : 110;
      const sr = dusk ? 42 : 34;
      g.beginFill(0xfff3b0, 0.25);
      g.drawCircle(sx, sy, sr + 34);
      g.endFill();
      g.beginFill(dusk ? 0xffb347 : 0xfff3b0, 0.95);
      g.drawCircle(sx, sy, sr);
      g.endFill();
    }
  }

  function drawClouds() {
    // Clouds drift slowly with the world (same as the top-down renderer).
    for (const cl of world.clouds) {
      cl.x += cl.speed * 0.016;
      if (cl.x > 6000 + 300) cl.x = -300;
    }
    // Clouds are projected like any world point (they drift with the world).
    for (const cl of world.clouds) {
      const pr = project(currentPlane, cl.x, cl.y);
      if (pr.fwd < -100 || pr.fwd > 3200 || Math.abs(pr.rgt) > 2000) continue;
      const sp = screenPos(pr.fwd, pr.rgt);
      const a = (cl.layer === 2 ? 0.38 : 0.26) * (night ? 0.35 : 1);
      g.beginFill(0xffffff, a);
      const puffs = [[-0.55, 5, 0.40], [-0.30, -5, 0.48], [0, -9, 0.54], [0.30, -4, 0.46], [0.55, 5, 0.38]];
      for (const [dx, dy, r] of puffs) {
        g.drawEllipse(sp.x + dx * cl.s * sp.s, sp.y + dy * sp.s, cl.s * r * sp.s, cl.s * r * 0.55 * sp.s);
      }
      g.endFill();
    }
  }

  // Current plane, set at the top of render() so helpers can use it.
  let currentPlane = { x: 0, y: 0, heading: 90 };

  function drawIsland(isl, fwd, rgt) {
    const sp = screenPos(fwd, rgt);
    const s = sp.s;
    const rx = isl.r * s, ry = isl.r * s * 0.38;
    // Beach ring, then grass.
    g.beginFill(palette.sand);
    g.drawEllipse(sp.x, sp.y, rx, ry);
    g.endFill();
    g.beginFill(isl.color);
    g.drawEllipse(sp.x, sp.y, rx * 0.86, ry * 0.82);
    g.endFill();
    if (isl.kind === 'volcano') {
      // Smoking cone rising from the island centre.
      const bw = 150 * s, hh = 190 * s, baseY = sp.y - 6 * s;
      g.beginFill(0x5a4a3a);
      g.moveTo(sp.x - bw, baseY);
      g.lineTo(sp.x, baseY - hh);
      g.lineTo(sp.x + bw, baseY);
      g.closePath();
      g.endFill();
      g.beginFill(0x8a5a3a);
      g.moveTo(sp.x - bw * 0.4, baseY - hh * 0.32);
      g.lineTo(sp.x, baseY - hh);
      g.lineTo(sp.x + bw * 0.4, baseY - hh * 0.32);
      g.closePath();
      g.endFill();
      g.beginFill(0xdddddd, 0.8);
      g.drawEllipse(sp.x + 40 * s, baseY - hh - 18 * s, 46 * s, 16 * s);
      g.drawEllipse(sp.x + 90 * s, baseY - hh - 42 * s, 34 * s, 12 * s);
      g.endFill();
      g.beginFill(0xff7722, 0.9);
      g.drawEllipse(sp.x, baseY - hh + 12 * s, 18 * s, 8 * s);
      g.endFill();
    }
    if (isl.town) {
      // Little town: rows of roofs near the beach (fixed local offsets).
      for (let b = 0; b < 6; b++) {
        const wx = isl.x - 150 + b * 60, wy = isl.y + isl.r * 0.42 - (b % 3) * 26;
        const pr = project(currentPlane, wx, wy);
        if (pr.fwd < 0) continue;
        const pp = screenPos(pr.fwd, pr.rgt);
        g.beginFill([0xd94f3d, 0xe8a33d, 0x3d7ad9, 0xe8e0c8][b % 4]);
        g.drawRect(pp.x - 15 * pp.s, pp.y - 10 * pp.s, 30 * pp.s, 20 * pp.s);
        g.endFill();
      }
    }
    if (isl.runway) drawRunway(isl.runway);
    if (isl.dropZone) {
      const pr = project(currentPlane, isl.dropZone.x, isl.dropZone.y);
      if (pr.fwd > 0) {
        const pp = screenPos(pr.fwd, pr.rgt);
        g.lineStyle(4, 0xff3344, 0.95);
        g.drawEllipse(pp.x, pp.y, isl.dropZone.r * pp.s, isl.dropZone.r * pp.s * 0.38);
        g.lineStyle(0);
        g.beginFill(0xff3344, 0.9);
        g.drawCircle(pp.x, pp.y, Math.max(3, 8 * pp.s));
        g.endFill();
      }
    }
  }

  function drawRunway(rw) {
    const h = degToRad(rw.heading);
    const fx = Math.sin(h), fy = -Math.cos(h);
    const rx = Math.cos(h), ry = Math.sin(h);
    const corners = [
      [-rw.len / 2, -rw.wid / 2], [rw.len / 2, -rw.wid / 2],
      [rw.len / 2, rw.wid / 2], [-rw.len / 2, rw.wid / 2],
    ].map(([a, c]) => {
      const wx = rw.x + fx * a + rx * c, wy = rw.y + fy * a + ry * c;
      const pr = project(currentPlane, wx, wy);
      return screenPos(pr.fwd, pr.rgt);
    });
    g.beginFill(0x2c2f36);
    g.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) g.lineTo(corners[i].x, corners[i].y);
    g.closePath();
    g.endFill();
    // Centre dashes along the strip.
    g.beginFill(0xffffff, 0.9);
    for (let d = -rw.len / 2 + 30; d < rw.len / 2 - 20; d += 46) {
      const wx = rw.x + fx * d, wy = rw.y + fy * d;
      const pr = project(currentPlane, wx, wy);
      if (pr.fwd < 0) continue;
      const pp = screenPos(pr.fwd, pr.rgt);
      g.drawRect(pp.x - 8 * pp.s, pp.y - 2 * pp.s, 16 * pp.s, 4 * pp.s);
    }
    g.endFill();
    // Edge lights glow at night.
    if (night) {
      for (let d = -rw.len / 2 + 12; d <= rw.len / 2 - 12; d += 40) {
        for (const sgn of [-1, 1]) {
          const wx = rw.x + fx * d + rx * sgn * (rw.wid / 2 + 6);
          const wy = rw.y + fy * d + ry * sgn * (rw.wid / 2 + 6);
          const pr = project(currentPlane, wx, wy);
          if (pr.fwd < 0) continue;
          const pp = screenPos(pr.fwd, pr.rgt);
          g.beginFill(0xffd34d, 0.25);
          g.drawCircle(pp.x, pp.y, Math.max(3, 12 * pp.s));
          g.endFill();
          g.beginFill(0xffd34d, 0.95);
          g.drawCircle(pp.x, pp.y, Math.max(2, 5 * pp.s));
          g.endFill();
        }
      }
    }
    // Windsock beside the runway.
    const wx = rw.x + rx * (rw.wid / 2 + 42), wy = rw.y + ry * (rw.wid / 2 + 42);
    const pr = project(currentPlane, wx, wy);
    if (pr.fwd > 0) {
      const pp = screenPos(pr.fwd, pr.rgt);
      g.lineStyle(Math.max(1, 3 * pp.s), 0xeeeeee);
      g.moveTo(pp.x, pp.y);
      g.lineTo(pp.x, pp.y - 34 * pp.s);
      g.lineStyle(0);
      g.beginFill(0xff7a2a);
      g.drawPolygon([pp.x, pp.y - 34 * pp.s, pp.x + 26 * pp.s, pp.y - 28 * pp.s, pp.x, pp.y - 22 * pp.s]);
      g.endFill();
    }
  }

  function drawRingGate(ring, ms, time) {
    const pr = project(currentPlane, ring.x, ring.y);
    if (pr.fwd < 30 || pr.fwd > 2600 || Math.abs(pr.rgt) > 1700) return;
    const cleared = ring.index < ms.ringsCleared;
    // A cleared gate right on top of the plane reads as a halo around it;
    // skip cleared gates closer than 200 units (the next gate always draws).
    if (cleared && pr.fwd < 200) return;
    const pp = screenPos(pr.fwd, pr.rgt);
    const isNext = ring.index === ms.ringsCleared;
    const col = cleared ? 0x2aff66 : isNext ? 0xffc93d : 0x7fb8ff;
    const rx = ring.r * pp.s, ry = ring.r * pp.s * 1.7;
    if (isNext) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 5);
      g.beginFill(col, 0.18 * pulse);
      g.drawEllipse(pp.x, pp.y, rx + 14 * pp.s, ry + 14 * pp.s);
      g.endFill();
    }
    g.lineStyle(6, col, cleared ? 0.5 : 0.95);
    g.drawEllipse(pp.x, pp.y, rx, ry);
    g.lineStyle(2, 0xffffff, 0.8);
    g.drawEllipse(pp.x, pp.y, Math.max(2, rx - 9 * pp.s), Math.max(2, ry - 9 * pp.s));
    g.lineStyle(0);
  }

  // The plane, seen from behind: tail low and wide (near camera), nose
  // tapering away up-screen. Local coords: +y toward the camera/tail.
  // Drawn at 0.9× so the target ahead stays visible above the nose.
  function drawPlane(plane, time) {
    planeGfx.clear();
    const scale = (1 + clamp(plane.altitude, 0, 6000) / 9000) * 0.9;
    planeGfx.scale.set(scale);
    planeGfx.rotation = degToRad(plane.bank) * 0.55;
    // Main wing (far side, toward the nose): amber, red tips.
    planeGfx.beginFill(0xe8a33d);
    planeGfx.drawRoundedRect(-125, -48, 250, 15, 6);
    planeGfx.endFill();
    planeGfx.beginFill(0xd94f3d);
    planeGfx.drawRoundedRect(-125, -48, 13, 15, 5);
    planeGfx.drawRoundedRect(112, -48, 13, 15, 5);
    planeGfx.endFill();
    // Fuselage: wide tail at the bottom, tapering to the nose.
    planeGfx.beginFill(0xf7f2e2);
    planeGfx.drawPolygon([-25, 86, 25, 86, 15, -58, -15, -58]);
    planeGfx.endFill();
    // Red cheatline band across the fuselage.
    planeGfx.beginFill(0xd94f3d);
    planeGfx.drawRect(-23, 26, 46, 10);
    planeGfx.endFill();
    // Teal tail band.
    planeGfx.beginFill(0x2a7a8a);
    planeGfx.drawRect(-24, 66, 48, 12);
    planeGfx.endFill();
    // Windshield hint at the top of the fuselage.
    planeGfx.beginFill(0x1a2a3a);
    planeGfx.drawEllipse(0, -50, 9, 5);
    planeGfx.endFill();
    // Vertical fin, seen edge-on, rising from the tail.
    planeGfx.beginFill(0xd94f3d);
    planeGfx.drawPolygon([-8, 86, 8, 86, 3, 32, -3, 32]);
    planeGfx.endFill();
    // Tailplane (horizontal stabiliser, nearest the camera).
    planeGfx.beginFill(0xf7f2e2);
    planeGfx.drawRoundedRect(-80, 60, 160, 12, 5);
    planeGfx.endFill();
    planeGfx.beginFill(0xd94f3d);
    planeGfx.drawRoundedRect(-80, 60, 11, 12, 4);
    planeGfx.drawRoundedRect(69, 60, 11, 12, 4);
    planeGfx.endFill();
    // Prop: faint blurred disc at the nose + spinning blades.
    planeGfx.beginFill(0x888888, 0.35);
    planeGfx.drawEllipse(0, -64, 22, 7);
    planeGfx.endFill();
    const pa = plane.propAngle;
    planeGfx.lineStyle(3, 0x555555);
    planeGfx.moveTo(Math.sin(pa) * -20, -64 + Math.cos(pa) * -6);
    planeGfx.lineTo(Math.sin(pa) * 20, -64 + Math.cos(pa) * 6);
    planeGfx.moveTo(Math.cos(pa) * -20, -64 + Math.sin(pa) * -6);
    planeGfx.lineTo(Math.cos(pa) * 20, -64 + Math.sin(pa) * 6);
    planeGfx.lineStyle(0);
    planeGfx.beginFill(0x333333);
    planeGfx.drawCircle(0, -64, 4);
    planeGfx.endFill();
    // Landing gear (down on final approach): two struts + wheels.
    if (plane.gearDown) {
      planeGfx.lineStyle(4, 0x333333);
      planeGfx.moveTo(-12, 84);
      planeGfx.lineTo(-14, 96);
      planeGfx.moveTo(12, 84);
      planeGfx.lineTo(14, 96);
      planeGfx.lineStyle(0);
      planeGfx.beginFill(0x222222);
      planeGfx.drawCircle(-14, 98, 5);
      planeGfx.drawCircle(14, 98, 5);
      planeGfx.endFill();
    }
    // Nav lights: red left, green right, white strobe blinking on the tail.
    planeGfx.beginFill(0xff2222);
    planeGfx.drawCircle(-125, -40, 3.5);
    planeGfx.endFill();
    planeGfx.beginFill(0x22ff66);
    planeGfx.drawCircle(125, -40, 3.5);
    planeGfx.endFill();
    if (Math.floor(time * 1.4) % 2 === 0) {
      planeGfx.beginFill(0xffffff, 0.95);
      planeGfx.drawCircle(0, 88, 3.5);
      planeGfx.endFill();
    }
  }

  return {
    root, flash,
    setFlash(level) { flashLevel = level; },
    spawnParticles(x, y, kind, n) {
      for (let i = 0; i < n; i++) {
        particles.push({
          sx: x, sy: y, kind,
          vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120 - 30,
          life: 0.8 + Math.random() * 0.7, age: 0,
        });
      }
    },
    render(state) {
      const { plane, ms, time, raining, lightning } = state;
      currentPlane = plane;
      g.clear();

      drawSkyExtras();
      drawClouds();

      // Far-to-near painter's order.
      const items = [];
      for (const rf of world.reefs) {
        const pr = project(plane, rf.x, rf.y);
        if (pr.fwd > -60) items.push({ kind: 'reef', fwd: pr.fwd, rgt: pr.rgt, r: rf.r });
      }
      for (const isl of world.islands) {
        const pr = project(plane, isl.x, isl.y);
        if (pr.fwd > -isl.r * 0.6) items.push({ kind: 'island', fwd: pr.fwd, rgt: pr.rgt, isl });
      }
      for (const ring of world.rings) {
        // Only the next gate (and cleared gates still ahead) are drawn:
        // future gates would clutter the frame and cross the HUD.
        if (ring.index > ms.ringsCleared) continue;
        const pr = project(plane, ring.x, ring.y);
        if (pr.fwd > 30 && pr.fwd < 2600 && Math.abs(pr.rgt) < 1700) {
          items.push({ kind: 'ring', fwd: pr.fwd, rgt: pr.rgt, ring });
        }
      }
      items.sort((a, b) => b.fwd - a.fwd);
      for (const it of items) {
        if (it.kind === 'reef') {
          const sp = screenPos(it.fwd, it.rgt);
          g.beginFill(0x7fe0c8, 0.35);
          g.drawEllipse(sp.x, sp.y, it.r * sp.s, it.r * sp.s * 0.38);
          g.endFill();
          g.beginFill(0x5ec8a8, 0.25);
          g.drawEllipse(sp.x, sp.y, it.r * sp.s * 0.55, it.r * sp.s * 0.22);
          g.endFill();
        } else if (it.kind === 'island') {
          drawIsland(it.isl, it.fwd, it.rgt);
        } else if (it.kind === 'ring') {
          drawRingGate(it.ring, ms, time);
        }
      }

      // Mission target marker: a small pulsing beacon over the target so
      // the goal reads from behind (same target the HUD pill names).
      const tgt = missionTarget(ms, world);
      const tpr = project(plane, tgt.x, tgt.y);
      if (tpr.fwd > 40 && tpr.fwd < 3000 && Math.abs(tpr.rgt) < 1900) {
        const tp = screenPos(tpr.fwd, tpr.rgt);
        const pulse = 4 + 2 * Math.sin(time * 5);
        g.beginFill(0xff3344, 0.9);
        g.drawCircle(tp.x, tp.y, (pulse + 3) * tp.s + 2);
        g.endFill();
        g.beginFill(0xffffff);
        g.drawCircle(tp.x, tp.y, 2.5 * tp.s + 1);
        g.endFill();
      }

      drawPlane(plane, time);

      // Rain in screen space.
      rainLayer.clear();
      if (raining) {
        rainLayer.lineStyle(2, 0xbdd8ff, 0.55);
        for (const d of rainDrops) {
          d.y += d.v * 0.016;
          d.x += 60 * 0.016;
          if (d.y > VIEW_H) { d.y = -20; d.x = rainRng() * VIEW_W; }
          rainLayer.moveTo(d.x, d.y);
          rainLayer.lineTo(d.x - 3, d.y + 16);
        }
      }

      // Lightning flash decays; skipped entirely while at 0.
      flashLevel = Math.max(0, flashLevel - 0.05);
      if (lightning) flashLevel = 0.85;
      flash.visible = flashLevel > 0;
      if (flash.visible) {
        flash.clear();
        flash.beginFill(0xffffff, flashLevel * 0.5);
        flash.drawRect(0, 0, VIEW_W, VIEW_H);
        flash.endFill();
      }

      // Particles (smoke / splash / crate) near the plane, screen space.
      fxLayer.clear();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += 0.016;
        if (p.age > p.life) { particles.splice(i, 1); continue; }
        const a = 1 - p.age / p.life;
        const px = PLANE_X + (p.sx - plane.x) * 0.25 + p.vx * p.age;
        const py = PLANE_Y - 30 + (p.sy - plane.y) * 0.25 + p.vy * p.age;
        if (p.kind === 'smoke') {
          fxLayer.beginFill(0xeeeeee, a * 0.7);
          fxLayer.drawCircle(px, py, 6 + p.age * 22);
          fxLayer.endFill();
        } else if (p.kind === 'splash') {
          fxLayer.beginFill(0x9fd8ef, a * 0.8);
          fxLayer.drawCircle(px, py, 4 + p.age * 30);
          fxLayer.endFill();
        } else {
          fxLayer.beginFill(0xd94f3d, a);
          fxLayer.drawRect(px - 6, py - 6, 12, 12);
          fxLayer.endFill();
        }
      }
    },
  };
}
