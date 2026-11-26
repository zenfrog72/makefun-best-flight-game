// ISLAND COURIER — PixiJS renderer.
// Heading-up chase view: the world container rotates so the plane always
// points up-screen; the plane itself is drawn screen-space, banked.
// Sky + sea are canvas gradients turned into textures; everything else is
// drawn with PIXI.Graphics so the whole scene is code, no image files.

import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, PLANE_SCREEN_X, PLANE_SCREEN_Y, PALETTES } from './config.js';
import { clamp, degToRad, lerp } from './random.js';

function makeGradientTexture(palette, night) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#' + palette.seaA.toString(16).padStart(6, '0'));
  grad.addColorStop(1, '#' + palette.seaB.toString(16).padStart(6, '0'));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  return PIXI.Texture.from(c);
}

function makeSkyTexture(palette) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#' + palette.skyTop.toString(16).padStart(6, '0'));
  grad.addColorStop(1, '#' + palette.skyBot.toString(16).padStart(6, '0'));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  return PIXI.Texture.from(c);
}

export function createRenderer(app, world, paletteKey) {
  const palette = PALETTES[paletteKey] || PALETTES.day;
  const night = paletteKey === 'night';
  const dusk = paletteKey === 'dusk';

  const root = new PIXI.Container();
  app.stage.addChild(root);

  // Sky wash behind everything (screen space).
  const sky = new PIXI.Sprite(makeSkyTexture(palette));
  sky.width = VIEW_W; sky.height = VIEW_H;
  root.addChild(sky);

  // World container: rotated -heading each frame, translated so the plane
  // sits at (640, 400).
  const seaTex = makeGradientTexture(palette, night);
  const sea = new PIXI.Sprite(seaTex);
  sea.width = WORLD_W + 2400;
  sea.height = WORLD_H + 2400;
  sea.position.set(-1200, -1200);

  const worldLayer = new PIXI.Container();
  worldLayer.addChild(sea);

  const scenery = new PIXI.Graphics();
  worldLayer.addChild(scenery);

  const ringLayer = new PIXI.Graphics();
  worldLayer.addChild(ringLayer);

  const cloudLayer = new PIXI.Container();
  worldLayer.addChild(cloudLayer);

  root.addChild(worldLayer);

  // Rain + lightning live in screen space, above the world.
  const rainLayer = new PIXI.Graphics();
  root.addChild(rainLayer);
  const flash = new PIXI.Graphics();
  flash.beginFill(0xffffff, 0);
  flash.drawRect(0, 0, VIEW_W, VIEW_H);
  flash.endFill();
  root.addChild(flash);

  // Plane shadow (world space, under the plane's screen spot).
  const shadow = new PIXI.Graphics();
  worldLayer.addChild(shadow);

  // The plane itself: screen-space container at (640, 400).
  const planeLayer = new PIXI.Container();
  planeLayer.position.set(PLANE_SCREEN_X, PLANE_SCREEN_Y);
  root.addChild(planeLayer);
  const planeGfx = new PIXI.Graphics();
  planeLayer.addChild(planeGfx);

  const fxLayer = new PIXI.Graphics(); // touchdown smoke, splash, drop crate
  root.addChild(fxLayer);

  // ---- Static scenery: reefs, islands, runways, towns, volcano ----
  function drawScenery(isNight) {
    scenery.clear();
    // Reefs: pale coral patches under the water.
    for (const rf of world.reefs) {
      scenery.beginFill(0x7fe0c8, 0.35);
      scenery.drawEllipse(rf.x, rf.y, rf.r, rf.r * 0.7);
      scenery.endFill();
      scenery.beginFill(0x5ec8a8, 0.25);
      scenery.drawEllipse(rf.x, rf.y, rf.r * 0.55, rf.r * 0.4);
      scenery.endFill();
    }
    for (const isl of world.islands) {
      // Beach ring, then grass, then detail.
      scenery.beginFill(palette.sand);
      scenery.drawEllipse(isl.x, isl.y, isl.r, isl.r * 0.82);
      scenery.endFill();
      scenery.beginFill(isl.color);
      scenery.drawEllipse(isl.x, isl.y, isl.r * 0.86, isl.r * 0.7);
      scenery.endFill();
      // Palm clusters: little green starbursts with brown trunks.
      for (let p = 0; p < 14; p++) {
        const a = (p / 14) * Math.PI * 2 + isl.x * 0.001;
        const px = isl.x + Math.cos(a) * isl.r * 0.62;
        const py = isl.y + Math.sin(a) * isl.r * 0.5;
        scenery.lineStyle(2, 0x6b4a2a);
        scenery.moveTo(px, py); scenery.lineTo(px + 3, py - 10);
        scenery.lineStyle(0);
        scenery.beginFill(0x2f8a3e);
        for (let f = 0; f < 5; f++) {
          const fa = (f / 5) * Math.PI * 2;
          scenery.drawEllipse(px + 3 + Math.cos(fa) * 7, py - 10 + Math.sin(fa) * 5, 7, 3);
        }
        scenery.endFill();
      }
      if (isl.kind === 'volcano') {
        // Smoking cone.
        scenery.beginFill(0x5a4a3a);
        scenery.moveTo(isl.x - 150, isl.y + 90);
        scenery.lineTo(isl.x, isl.y - 190);
        scenery.lineTo(isl.x + 150, isl.y + 90);
        scenery.closePath();
        scenery.endFill();
        scenery.beginFill(0x8a5a3a);
        scenery.moveTo(isl.x - 60, isl.y - 60);
        scenery.lineTo(isl.x, isl.y - 190);
        scenery.lineTo(isl.x + 60, isl.y - 60);
        scenery.closePath();
        scenery.endFill();
        scenery.beginFill(0xdddddd, 0.8);
        scenery.drawEllipse(isl.x + 40, isl.y - 210, 46, 16);
        scenery.drawEllipse(isl.x + 90, isl.y - 235, 34, 12);
        scenery.endFill();
        scenery.beginFill(0xff7722, 0.9);
        scenery.drawEllipse(isl.x, isl.y - 178, 18, 8);
        scenery.endFill();
      }
      if (isl.town) {
        // Little town: rows of roofs along the beach.
        for (let b = 0; b < 9; b++) {
          const bx = isl.x - 200 + b * 46;
          const by = isl.y + isl.r * 0.42 - (b % 3) * 26;
          scenery.beginFill([0xd94f3d, 0xe8a33d, 0x3d7ad9, 0xe8e0c8][b % 4]);
          scenery.drawRect(bx, by, 30, 20);
          scenery.endFill();
          scenery.beginFill(0x8a4a2a);
          scenery.moveTo(bx - 2, by);
          scenery.lineTo(bx + 15, by - 12);
          scenery.lineTo(bx + 32, by);
          scenery.closePath();
          scenery.endFill();
        }
      }
      if (isl.hangar && isl.runway) {
        const hx = isl.runway.x + 190;
        const hy = isl.runway.y + 120;
        scenery.beginFill(0x9aa4ae);
        scenery.drawRoundedRect(hx - 55, hy - 32, 110, 64, 8);
        scenery.endFill();
        scenery.beginFill(0x5a646e);
        scenery.drawRect(hx - 55, hy + 8, 110, 24);
        scenery.endFill();
        scenery.beginFill(0x333333);
        scenery.drawRect(hx - 30, hy + 8, 60, 24);
        scenery.endFill();
        // Parked fuel truck + jeep.
        scenery.beginFill(0xe8c33d);
        scenery.drawRoundedRect(hx - 120, hy + 40, 34, 14, 4);
        scenery.endFill();
        scenery.beginFill(0x3d7a4a);
        scenery.drawRoundedRect(hx + 70, hy + 44, 26, 12, 4);
        scenery.endFill();
      }
      if (isl.runway) drawRunway(scenery, isl.runway, isNight);
      if (isl.dropZone) {
        scenery.lineStyle(4, 0xff3344, 0.95);
        scenery.drawCircle(isl.dropZone.x, isl.dropZone.y, isl.dropZone.r);
        scenery.lineStyle(2, 0xffffff, 0.8);
        scenery.drawCircle(isl.dropZone.x, isl.dropZone.y, isl.dropZone.r * 0.6);
        scenery.beginFill(0xff3344, 0.9);
        scenery.drawCircle(isl.dropZone.x, isl.dropZone.y, 10);
        scenery.endFill();
      }
      // Island name label.
      scenery.lineStyle(0);
    }
  }

  function drawRunway(g, rw, isNight) {
    const h = degToRad(rw.heading);
    const fx = Math.sin(h), fy = -Math.cos(h);
    const rx = Math.cos(h), ry = Math.sin(h);
    const corners = [
      [-rw.len / 2, -rw.wid / 2], [rw.len / 2, -rw.wid / 2],
      [rw.len / 2, rw.wid / 2], [-rw.len / 2, rw.wid / 2],
    ].map(([a, c]) => [rw.x + fx * a + rx * c, rw.y + fy * a + ry * c]);
    g.beginFill(0x2c2f36);
    g.moveTo(corners[0][0], corners[0][1]);
    for (let i = 1; i < 4; i++) g.lineTo(corners[i][0], corners[i][1]);
    g.closePath();
    g.endFill();
    // Centre dashes.
    g.beginFill(0xffffff, 0.9);
    for (let d = -rw.len / 2 + 30; d < rw.len / 2 - 20; d += 46) {
      const cx = rw.x + fx * d, cy = rw.y + fy * d;
      g.drawRect(cx - 9, cy - 2, 18, 4);
    }
    g.endFill();
    // Threshold bars at both ends.
    g.beginFill(0xffffff, 0.95);
    for (const s of [-1, 1]) {
      for (let k = -2; k <= 2; k++) {
        const px = rw.x + fx * (s * (rw.len / 2 - 18)) + rx * k * 8;
        const py = rw.y + fy * (s * (rw.len / 2 - 18)) + ry * k * 8;
        g.drawRect(px - 3, py - 3, 6, 6);
      }
    }
    g.endFill();
    // Runway edge lights glow at night.
    if (isNight) {
      for (let d = -rw.len / 2 + 12; d <= rw.len / 2 - 12; d += 40) {
        for (const s of [-1, 1]) {
          const px = rw.x + fx * d + rx * s * (rw.wid / 2 + 6);
          const py = rw.y + fy * d + ry * s * (rw.wid / 2 + 6);
          g.beginFill(0xffd34d, 0.95);
          g.drawCircle(px, py, 5);
          g.endFill();
          g.beginFill(0xffd34d, 0.25);
          g.drawCircle(px, py, 12);
          g.endFill();
        }
      }
    }
    // Windsock beside the runway.
    const wx = rw.x + rx * (rw.wid / 2 + 42);
    const wy = rw.y + ry * (rw.wid / 2 + 42);
    g.lineStyle(3, 0xeeeeee);
    g.moveTo(wx, wy); g.lineTo(wx, wy - 34);
    g.lineStyle(0);
    g.beginFill(0xff7a2a);
    g.drawPolygon([wx, wy - 34, wx + 26, wy - 28, wx, wy - 22]);
    g.endFill();
  }

  // Clouds: soft white blob clusters.
  const cloudSprites = [];
  for (const cl of world.clouds) {
    const g = new PIXI.Graphics();
    g.beginFill(0xffffff, cl.layer === 2 ? 0.85 : 0.55);
    g.drawEllipse(0, 0, cl.s, cl.s * 0.42);
    g.drawEllipse(-cl.s * 0.45, 6, cl.s * 0.6, cl.s * 0.32);
    g.drawEllipse(cl.s * 0.45, 6, cl.s * 0.6, cl.s * 0.32);
    g.endFill();
    g.position.set(cl.x, cl.y);
    cloudLayer.addChild(g);
    cloudSprites.push({ g, cl });
  }

  drawScenery(night);

  let flashLevel = 0;
  let rainDrops = [];
  for (let i = 0; i < 160; i++) {
    rainDrops.push({ x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, v: 900 + Math.random() * 400 });
  }

  function drawPlane(plane, time) {
    planeGfx.clear();
    const scale = 1 + clamp(plane.altitude, 0, 6000) / 9000;
    planeGfx.scale.set(scale);
    planeGfx.rotation = degToRad(plane.bank) * 0.55;
    // Tail.
    planeGfx.beginFill(0xd94f3d);
    planeGfx.drawPolygon([-7, 26, -26, 44, -14, 44, -4, 30]);
    planeGfx.drawPolygon([7, 26, 26, 44, 14, 44, 4, 30]);
    planeGfx.endFill();
    // Fuselage: cream body, red stripe, teal tail band.
    planeGfx.beginFill(0xf7f2e2);
    planeGfx.drawEllipse(0, 0, 13, 34);
    planeGfx.endFill();
    planeGfx.beginFill(0xd94f3d);
    planeGfx.drawRect(-13, 8, 26, 7);
    planeGfx.endFill();
    planeGfx.beginFill(0x2a7a8a);
    planeGfx.drawRect(-11, 24, 22, 6);
    planeGfx.endFill();
    // Wings: high wing with struts.
    planeGfx.beginFill(0xe8a33d);
    planeGfx.drawRoundedRect(-58, -6, 116, 13, 5);
    planeGfx.endFill();
    planeGfx.beginFill(0xd94f3d);
    planeGfx.drawRoundedRect(-58, -6, 10, 13, 4);
    planeGfx.drawRoundedRect(48, -6, 10, 13, 4);
    planeGfx.endFill();
    // Windows + cockpit.
    planeGfx.beginFill(0x9fd8ef);
    planeGfx.drawEllipse(0, -14, 7, 9);
    planeGfx.drawEllipse(0, 2, 5, 5);
    planeGfx.endFill();
    // Prop: blurred disc + two blades spinning.
    planeGfx.beginFill(0x888888, 0.35);
    planeGfx.drawCircle(0, -36, 15);
    planeGfx.endFill();
    const pa = plane.propAngle;
    planeGfx.lineStyle(4, 0x555555);
    planeGfx.moveTo(Math.sin(pa) * -13, -36 + Math.cos(pa) * -13);
    planeGfx.lineTo(Math.sin(pa) * 13, -36 + Math.cos(pa) * 13);
    planeGfx.moveTo(Math.cos(pa) * -13, -36 + Math.sin(pa) * -13);
    planeGfx.lineTo(Math.cos(pa) * 13, -36 + Math.sin(pa) * 13);
    planeGfx.lineStyle(0);
    planeGfx.beginFill(0x333333);
    planeGfx.drawCircle(0, -36, 4);
    planeGfx.endFill();
    // Nav lights: red left, green right, white strobe blinking.
    planeGfx.beginFill(0xff2222);
    planeGfx.drawCircle(-58, 0, 3);
    planeGfx.endFill();
    planeGfx.beginFill(0x22ff66);
    planeGfx.drawCircle(58, 0, 3);
    planeGfx.endFill();
    if (Math.floor(time * 1.4) % 2 === 0) {
      planeGfx.beginFill(0xffffff, 0.95);
      planeGfx.drawCircle(0, 34, 3.5);
      planeGfx.endFill();
    }
    // Registration on the wing.
    planeGfx.lineStyle(0);
  }

  function drawRings(ms) {
    ringLayer.clear();
    for (const ring of world.rings) {
      const cleared = ring.index < ms.ringsCleared;
      const isNext = ring.index === ms.ringsCleared;
      const col = cleared ? 0x2aff66 : isNext ? 0xffc93d : 0x7fb8ff;
      ringLayer.lineStyle(6, col, cleared ? 0.5 : 0.95);
      ringLayer.drawCircle(ring.x, ring.y, ring.r);
      ringLayer.lineStyle(2, 0xffffff, 0.8);
      ringLayer.drawCircle(ring.x, ring.y, ring.r - 9);
      if (isNext) {
        const pulse = 0.6 + 0.4 * Math.sin(ms.elapsed * 5);
        ringLayer.beginFill(col, 0.18 * pulse);
        ringLayer.drawCircle(ring.x, ring.y, ring.r + 14);
        ringLayer.endFill();
      }
    }
  }

  const particles = [];
  function spawnParticles(x, y, kind, n) {
    for (let i = 0; i < n; i++) {
      particles.push({
        sx: x, sy: y, kind,
        vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120 - 30,
        life: 0.8 + Math.random() * 0.7, age: 0,
      });
    }
  }

  return {
    root, worldLayer, planeLayer, flash,
    setFlash(level) { flashLevel = level; },
    spawnParticles,
    render(state) {
      const { plane, ms, time, raining, lightning } = state;
      const headingRad = degToRad(plane.heading);
      // Heading-up camera: rotate world by -heading around the plane.
      worldLayer.rotation = -headingRad;
      const cos = Math.cos(-headingRad), sin = Math.sin(-headingRad);
      const rx = plane.x * cos - plane.y * sin;
      const ry = plane.x * sin + plane.y * cos;
      worldLayer.position.set(PLANE_SCREEN_X - rx, PLANE_SCREEN_Y - ry);

      // Shadow: grows and drifts with altitude, always under the plane.
      shadow.clear();
      const shScale = 1 + plane.altitude / 2500;
      const shOff = clamp(plane.altitude / 60, 0, 90);
      shadow.beginFill(0x000000, clamp(0.34 - plane.altitude / 30000, 0.06, 0.34));
      shadow.drawEllipse(plane.x + shOff * 0.6, plane.y + shOff, 34 * shScale, 14 * shScale);
      shadow.endFill();

      // Clouds drift.
      for (const { g, cl } of cloudSprites) {
        cl.x += cl.speed * 0.016;
        if (cl.x > WORLD_W + 300) cl.x = -300;
        g.position.set(cl.x, cl.y);
        g.alpha = night ? 0.35 : 1;
      }

      drawPlane(plane, time);
      drawRings(ms);

      // Rain in screen space.
      rainLayer.clear();
      if (raining) {
        rainLayer.lineStyle(2, 0xbdd8ff, 0.55);
        for (const d of rainDrops) {
          d.y += d.v * 0.016;
          d.x += 60 * 0.016;
          if (d.y > VIEW_H) { d.y = -20; d.x = Math.random() * VIEW_W; }
          rainLayer.moveTo(d.x, d.y);
          rainLayer.lineTo(d.x - 3, d.y + 16);
        }
      }

      // Lightning flash decays.
      flashLevel = Math.max(0, flashLevel - 0.05);
      if (lightning) flashLevel = 0.85;
      flash.clear();
      flash.beginFill(0xffffff, flashLevel * 0.5);
      flash.drawRect(0, 0, VIEW_W, VIEW_H);
      flash.endFill();

      // Particles (smoke / splash / crate) in screen space near the plane.
      fxLayer.clear();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += 0.016;
        if (p.age > p.life) { particles.splice(i, 1); continue; }
        const a = 1 - p.age / p.life;
        const px = PLANE_SCREEN_X + (p.sx - plane.x) + p.vx * p.age;
        const py = PLANE_SCREEN_Y + (p.sy - plane.y) + p.vy * p.age;
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
