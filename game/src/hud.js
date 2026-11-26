// ISLAND COURIER — screen-space HUD.
// Mission banner, heading compass tape, timer/score/fuel/damage, airspeed +
// altimeter, minimap, target pointer, throttle bar, centre messages.
// Everything redrawn each frame from live state; nothing is a static image.

import { VIEW_W, VIEW_H } from './config.js';
import { clamp, degToRad, wrapAngleDeg, dist, angleDiffDeg } from './random.js';
import { headingToCompass } from './flight.js';
import { MISSION_DEFS, missionTarget } from './missions.js';

export function createHud(app, world) {
  const layer = new PIXI.Container();
  app.stage.addChild(layer);

  const banner = new PIXI.Text('', { fontFamily: 'Arial, sans-serif', fontSize: 20, fontWeight: 'bold', fill: 0xffffff });
  const bannerBg = new PIXI.Graphics();
  layer.addChild(bannerBg, banner);

  const compassG = new PIXI.Graphics();
  layer.addChild(compassG);

  const status = new PIXI.Text('', { fontFamily: 'Arial, sans-serif', fontSize: 19, fontWeight: 'bold', fill: 0xffffff, align: 'right' });
  status.position.set(VIEW_W - 16, 12);
  status.anchor.set(1, 0);
  layer.addChild(status);

  const fuelG = new PIXI.Graphics();
  const dmgG = new PIXI.Graphics();
  layer.addChild(fuelG, dmgG);

  const speedText = new PIXI.Text('', { fontFamily: 'Arial, sans-serif', fontSize: 44, fontWeight: 'bold', fill: 0xffffff });
  speedText.position.set(16, VIEW_H - 118);
  const speedLabel = new PIXI.Text('AIRSPEED  KT', { fontFamily: 'Arial, sans-serif', fontSize: 13, fontWeight: 'bold', fill: 0xd8ecff });
  speedLabel.position.set(18, VIEW_H - 66);
  const altText = new PIXI.Text('', { fontFamily: 'Arial, sans-serif', fontSize: 44, fontWeight: 'bold', fill: 0xffffff });
  altText.position.set(16, VIEW_H - 210);
  const altLabel = new PIXI.Text('ALTITUDE  FT', { fontFamily: 'Arial, sans-serif', fontSize: 13, fontWeight: 'bold', fill: 0xd8ecff });
  altLabel.position.set(18, VIEW_H - 158);
  const vsText = new PIXI.Text('', { fontFamily: 'Arial, sans-serif', fontSize: 18, fontWeight: 'bold', fill: 0xffffff });
  vsText.position.set(150, VIEW_H - 176);
  layer.addChild(speedText, speedLabel, altText, altLabel, vsText);

  const mapBg = new PIXI.Graphics();
  const mapG = new PIXI.Graphics();
  layer.addChild(mapBg, mapG);

  const targetText = new PIXI.Text('', { fontFamily: 'Arial, sans-serif', fontSize: 20, fontWeight: 'bold', fill: 0xffe9a8, align: 'center' });
  targetText.anchor.set(0.5, 0);
  targetText.position.set(VIEW_W / 2, 66);
  layer.addChild(targetText);
  const arrowG = new PIXI.Graphics();
  layer.addChild(arrowG);

  const throttleG = new PIXI.Graphics();
  layer.addChild(throttleG);

  const msgText = new PIXI.Text('', { fontFamily: 'Arial, sans-serif', fontSize: 30, fontWeight: 'bold', fill: 0xffe9a8, align: 'center' });
  msgText.anchor.set(0.5, 0.5);
  msgText.position.set(VIEW_W / 2, 300);
  layer.addChild(msgText);

  const warnText = new PIXI.Text('', { fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 'bold', fill: 0xff5566, align: 'center' });
  warnText.anchor.set(0.5, 0);
  warnText.position.set(VIEW_W / 2, 108);
  layer.addChild(warnText);

  function panel(g, x, y, w, h, alpha) {
    g.beginFill(0x0a2038, alpha === undefined ? 0.55 : alpha);
    g.drawRoundedRect(x, y, w, h, 8);
    g.endFill();
    g.lineStyle(1, 0xffffff, 0.25);
    g.drawRoundedRect(x, y, w, h, 8);
    g.lineStyle(0);
  }

  function draw(state) {
    const { plane, ms, time, screen } = state;
    const def = MISSION_DEFS[ms.index];
    const target = missionTarget(ms, world);
    const tDist = dist(plane.x, plane.y, target.x, target.y);
    const bearing = wrapAngleDeg((Math.atan2(target.x - plane.x, -(target.y - plane.y)) * 180) / Math.PI);
    const relBearing = wrapAngleDeg(bearing - plane.heading);

    // --- Mission banner, top-left.
    const bannerLabel = (ms.index + 1) + '/4  ' + def.name + '  —  ' + def.objective;
    banner.text = bannerLabel;
    banner.position.set(16, 12);
    bannerBg.clear();
    panel(bannerBg, 10, 8, banner.width + 22, 34);

    // --- Compass tape, top-centre.
    compassG.clear();
    compassG.removeChildren();
    panel(compassG, VIEW_W / 2 - 190, 8, 380, 44);
    const cx = VIEW_W / 2;
    for (let d = -60; d <= 60; d += 5) {
      const hdg = Math.round((plane.heading + d) / 5) * 5;
      const off = (wrapAngleDeg(hdg - plane.heading) / 60) * 175;
      const x = cx + off;
      const major = hdg % 30 === 0;
      compassG.lineStyle(major ? 2 : 1, 0xffffff, major ? 0.95 : 0.5);
      compassG.moveTo(x, 44);
      compassG.lineTo(x, major ? 28 : 36);
      if (major) {
        const label = hdg % 90 === 0 ? ['N', 'E', 'S', 'W'][Math.round(((hdg % 360) + 360) % 360 / 90)] : String(((hdg % 360) + 360) % 360);
        const t = new PIXI.Text(label, { fontFamily: 'Arial, sans-serif', fontSize: 12, fontWeight: 'bold', fill: 0xffffff });
        t.anchor.set(0.5, 0);
        t.position.set(x, 12);
        compassG.addChild(t);
      }
    }
    // Centre caret + current heading readout.
    compassG.beginFill(0xffc93d);
    compassG.drawPolygon([cx - 7, 8, cx + 7, 8, cx, 18]);
    compassG.endFill();
    const hdgText = new PIXI.Text(Math.round(((plane.heading % 360) + 360) % 360) + '° ' + headingToCompass(plane.heading), { fontFamily: 'Arial, sans-serif', fontSize: 13, fontWeight: 'bold', fill: 0xffc93d });
    hdgText.anchor.set(0.5, 0);
    hdgText.position.set(cx, 48);
    compassG.addChild(hdgText);

    // --- Status block, top-right: timer, score, fuel, damage.
    const mm = Math.floor(Math.max(0, ms.timeLeft) / 60);
    const ss = Math.floor(Math.max(0, ms.timeLeft) % 60).toString().padStart(2, '0');
    status.text = '⏱ ' + mm + ':' + ss + '   ★ ' + (ms.totalScore + ms.score) + '\nFUEL ' + Math.round(plane.fuel) + '%   DMG ' + Math.round(plane.damage) + '%';
    fuelG.clear();
    panel(fuelG, VIEW_W - 226, 76, 210, 16);
    fuelG.beginFill(plane.fuel < 20 ? 0xff4433 : 0x2aff66);
    fuelG.drawRoundedRect(VIEW_W - 224, 78, 206 * clamp(plane.fuel / 100, 0, 1), 12, 5);
    fuelG.endFill();
    dmgG.clear();
    panel(dmgG, VIEW_W - 226, 96, 210, 16);
    dmgG.beginFill(plane.damage > 60 ? 0xff4433 : 0xffc93d);
    dmgG.drawRoundedRect(VIEW_W - 224, 98, 206 * clamp(plane.damage / 100, 0, 1), 12, 5);
    dmgG.endFill();

    // --- Airspeed + altimeter, bottom-left.
    speedText.text = Math.round(plane.speed);
    speedText.style.fill = plane.stalled ? 0xff6677 : 0xffffff;
    altText.text = Math.round(plane.altitude);
    const vsArrow = plane.vspeed > 60 ? '▲ +' : plane.vspeed < -60 ? '▼ −' : '—  ';
    vsText.text = vsArrow + Math.abs(Math.round(plane.vspeed)) + ' fpm';
    vsText.style.fill = plane.vspeed < -900 ? 0xff6677 : 0xffffff;

    // --- Minimap, bottom-right (world 6000x4000 -> 220x146).
    const mw = 220, mh = 146, mx = VIEW_W - mw - 16, my = VIEW_H - mh - 16;
    mapBg.clear();
    panel(mapBg, mx - 6, my - 6, mw + 12, mh + 12, 0.6);
    mapG.clear();
    mapG.beginFill(0x0b7fa8);
    mapG.drawRect(mx, my, mw, mh);
    mapG.endFill();
    const sx = mw / 6000, sy = mh / 4000;
    for (const isl of world.islands) {
      mapG.beginFill(0xf2ddab);
      mapG.drawEllipse(mx + isl.x * sx, my + isl.y * sy, isl.r * sx + 3, isl.r * sy + 3);
      mapG.endFill();
      mapG.beginFill(isl.color);
      mapG.drawEllipse(mx + isl.x * sx, my + isl.y * sy, isl.r * sx, isl.r * sy);
      mapG.endFill();
    }
    // Target marker, pulsing.
    const pulse = 4 + 2 * Math.sin(time * 5);
    mapG.beginFill(0xff3344);
    mapG.drawCircle(mx + target.x * sx, my + target.y * sy, pulse + 3);
    mapG.endFill();
    mapG.beginFill(0xffffff);
    mapG.drawCircle(mx + target.x * sx, my + target.y * sy, 2.5);
    mapG.endFill();
    // Plane triangle, rotated to heading.
    const px = mx + plane.x * sx, py = my + plane.y * sy;
    const hr = degToRad(plane.heading);
    mapG.beginFill(0xffffff);
    mapG.drawPolygon([
      px + Math.sin(hr) * 9, py - Math.cos(hr) * 9,
      px + Math.sin(hr + 2.5) * 7, py - Math.cos(hr + 2.5) * 7,
      px + Math.sin(hr - 2.5) * 7, py - Math.cos(hr - 2.5) * 7,
    ]);
    mapG.endFill();

    // --- Target distance + off-screen arrow, top-centre under compass.
    targetText.text = target.label + '  •  ' + (tDist / 100).toFixed(1) + ' km';
    arrowG.clear();
    const arrowR = 74;
    const ar = degToRad(relBearing);
    const ax = VIEW_W / 2 + Math.sin(ar) * arrowR;
    const ay = 200 + -Math.cos(ar) * arrowR * 0.4;
    arrowG.beginFill(0xffc93d, 0.95);
    arrowG.drawPolygon([
      ax + Math.sin(ar) * 16, ay - Math.cos(ar) * 16,
      ax + Math.sin(ar + 2.6) * 11, ay - Math.cos(ar + 2.6) * 11,
      ax + Math.sin(ar - 2.6) * 11, ay - Math.cos(ar - 2.6) * 11,
    ]);
    arrowG.endFill();

    // --- Throttle bar + gear/flaps, bottom-centre.
    throttleG.clear();
    throttleG.removeChildren();
    panel(throttleG, VIEW_W / 2 - 130, VIEW_H - 34, 260, 22);
    throttleG.beginFill(0xffc93d);
    throttleG.drawRoundedRect(VIEW_W / 2 - 128, VIEW_H - 32, 256 * clamp(plane.throttle, 0, 1), 18, 5);
    throttleG.endFill();
    const thrLabel = new PIXI.Text('THR ' + Math.round(plane.throttle * 100) + '%   GEAR ' + (plane.gearDown ? 'DOWN' : 'UP') + '   CARGO ' + plane.cargo, { fontFamily: 'Arial, sans-serif', fontSize: 13, fontWeight: 'bold', fill: 0xffffff });
    thrLabel.anchor.set(0.5, 0.5);
    thrLabel.position.set(VIEW_W / 2, VIEW_H - 23);
    throttleG.addChild(thrLabel);

    // --- Centre message + warnings.
    msgText.text = time < ms.messageUntil ? ms.message : '';
    const warns = [];
    if (plane.stalled && !plane.onGround) warns.push('⚠ STALL — NOSE DOWN, ADD POWER');
    if (plane.fuel < 20 && plane.fuel > 0) warns.push('⚠ LOW FUEL');
    if (plane.fuel <= 0) warns.push('⚠ FUEL EMPTY');
    if (plane.damage > 60) warns.push('⚠ HEAVY DAMAGE');
    warnText.text = warns.join('   ');
    warnText.visible = warns.length > 0 && Math.floor(time * 2) % 2 === 0;
  }

  return { layer, draw };
}
