import assert from 'node:assert/strict';
import { cityModuleLoader } from './scripts/load-city.mjs';
const load = cityModuleLoader();
const detailUrl = load('lib/street-details.ts'), atlasUrl = load('lib/glyph-atlas.ts');
const cityUrl = load('lib/city.ts');
const { intersectBox, canWalk, buildings, cityWorld } = await import(cityUrl);
const { DISTRICTS, districtAt, districtDestination, WORLD_LIMIT, roadDistance } = await import(load('lib/city-world.ts'));
const b = { min: [0, 0, 0], max: [2, 2, 2], name: 'test', kind: 'building' };
assert.equal(intersectBox([1, 1, 5], [0, 0, -1], b).t, 3);
assert.deepEqual(intersectBox([1, 1, 5], [0, 0, -1], b).normal, [0, 0, 1]);
assert.equal(intersectBox([3, 1, 5], [0, 0, -1], b), null);
assert.equal(intersectBox([1, 1, 5], [0, 0, 1], b), null);
assert.equal(intersectBox([1, 1, 1], [1, 0, 0], b).t, 1);
assert.deepEqual(intersectBox([1, 5, 1], [0, -1, 0], b).normal, [0, 1, 0]);
assert.equal(canWalk(0, 0, buildings()), true);
assert.equal(canWalk(-12, -12, buildings()), false);
assert.equal(canWalk(-16.2, -12, buildings()), false);
assert.equal(canWalk(WORLD_LIMIT, 0, buildings()), false);
console.log('10 ray intersection and movement collision assertions passed.');
const { City } = await import(
  cityUrl
);
const city = Object.create(City.prototype);
city.player = [0, 0, 2];
city.fixed = buildings();
city.path = [];
city.walkTo(-18, -18);
assert.ok(city.path.length > 0, 'A route must be found around buildings');
for (const p of city.path)
  assert.ok(
    canWalk(p[0], p[2], city.fixed),
    'Every waypoint must clear building footprints',
  );
assert.deepEqual(city.path.at(-1), [-18, 0, -18]);
const oldPath = city.path;
city.walkTo(-12, -12);
assert.equal(
  city.path,
  oldPath,
  'A blocked destination must not replace the valid route',
);
function verifyPerspective(renderer) {
for (const pov of ['first', 'second']) {
  renderer.setPOV(pov);
  renderer.lookPitch = 0.04;
  for (const angle of [0, 0.8, 2, 3.7]) for (const pitch of [-0.6, 0.04, 0.65, 1.35]) {
    renderer.angle = angle;
    renderer.lookPitch = pitch;
    renderer.followPitch = Math.max(0.12, Math.min(0.85, pitch));
    renderer.camera();
    renderer.gridX = renderer.gridY = 0;
    renderer.buildRowBounds();
    for (let row = 1; row < renderer.rows; row += 9)
      for (let col = 1; col < renderer.columns; col += 13) {
        const px = (col + 0.5) * renderer.cw, py = (row + 0.5) * renderer.ch;
        const o = renderer.ray(px, py), d = renderer.rayDirection(px, py);
        const point = o.map((v, i) => v + d[i] * 8);
        const projected = renderer.project(point);
        assert.ok(Math.abs(projected[0] - px) < 1e-7);
        assert.ok(Math.abs(projected[1] - py) < 1e-7);
        const full = renderer.trace(o, -1, -1, d), fast = renderer.trace(o, col, row, d);
        assert.equal(full?.box, fast?.box);
        if (full) assert.ok(Math.abs(full.t - fast.t) < 1e-8);
        if (pov === 'first' && full?.box?.kind === 'player')
          assert.ok(!renderer.hiddenFromCamera(full.box), 'First person must hide the head and torso surrounding the eye');
      }
  }
}
console.log('Perspective projection round trips and accelerated rays passed in both POVs.');
}
console.log(
  'Click-to-walk route, collision clearance and blocked destination checks passed.',
);

// Regression: a route must spend its full movement budget across waypoints.
function simulatedWalker() {
  const walker = Object.create(City.prototype);
  Object.assign(walker, {
    player: [0, 0, 18],
    focus: [0, 0, 15],
    fixed: buildings(),
    path: Array.from({ length: 16 }, (_, i) => [0, 0, 17.5 - i * 0.5]),
    keys: new Set(),
    paused: true,
    angle: (28 * Math.PI) / 180,
    elapsed: 0,
    clock: 540,
    selected: '',
  });
  return walker;
}
for (const hz of [30, 60, 120]) {
  const walker = simulatedWalker();
  for (let i = 0; i < hz; i++) walker.simulate(1 / hz);
  assert.ok(
    Math.abs(walker.player[2] - 13) < 1e-8,
    'Route speed must be 5 units/second, without waypoint pauses',
  );
}

// Regression: camera panning must preserve the world-space sample under a glyph.
const renderer = simulatedWalker();
Object.assign(renderer, {
  width: 1280,
  height: 900,
  cw: 5,
  ch: 9,
  columns: 257,
  rows: 101,
  span: 45,
  overview: false,
});
renderer.simulate(0);
function phase(r) {
  r.camera();
  const anchor = r.project([0, 0, 0]);
  r.gridX = (((anchor[0] % r.cw) + r.cw) % r.cw) - r.cw;
  r.gridY = (((anchor[1] % r.ch) + r.ch) % r.ch) - r.ch;
  r.buildRowBounds();
}
function sample(r) {
  const p = r.project([0, 0, 8]);
  const col = Math.floor((p[0] - r.gridX) / r.cw),
    row = Math.floor((p[1] - r.gridY) / r.ch);
  const o = r.ray(r.gridX + (col + 0.5) * r.cw, r.gridY + (row + 0.5) * r.ch),
    hit = r.trace(o);
  return o.map((v, i) => v + r.direction[i] * hit.t);
}
phase(renderer);
const initial = sample(renderer);
for (let i = 1; i <= 100; i++) {
  renderer.focus = [i * 0.037, 0, 15 - i * 0.029];
  phase(renderer);
  const next = sample(renderer);
  for (let a = 0; a < 3; a++)
    assert.ok(
      Math.abs(next[a] - initial[a]) < 1e-8,
      'Static samples must remain anchored through sub-cell pans and grid crossings',
    );
}

// The row/column acceleration must agree with exhaustive ray intersections.
let comparisons = 0;
for (let angle = 0; angle < 360; angle += 30) {
  renderer.angle = (angle * Math.PI) / 180;
  phase(renderer);
  for (let row = 0; row < renderer.rows; row += 5)
    for (let col = 0; col < renderer.columns; col += 7) {
      const o = renderer.ray(
        renderer.gridX + (col + 0.5) * renderer.cw,
        renderer.gridY + (row + 0.5) * renderer.ch,
      );
      const all = renderer.trace(o),
        fast = renderer.trace(o, col, row);
      assert.equal(!!all, !!fast);
      if (all && fast) {
        assert.ok(Math.abs(all.t - fast.t) < 1e-8);
        assert.equal(all.box, fast.box);
      }
      comparisons++;
    }
}
console.log(
  'Movement at 30/60/120 Hz, 100 stable camera pans, and ' +
    comparisons +
    ' accelerated ray comparisons passed.',
);
verifyPerspective(renderer);

const { toWorld, personModel, benchModel, vehicleModel, detailGlyph } = await import(detailUrl);
// Rotation must preserve hit distances and turn the returned face normal.
const turned = { ...b, frame: { origin: [5, 0, 7], yaw: Math.PI / 3 } };
const origin = toWorld([1, 1, 5], turned.frame);
const direction = toWorld([0, 0, -1], { ...turned.frame, origin: [0, 0, 0] });
const rotatedHit = intersectBox(origin, direction, turned);
assert.ok(Math.abs(rotatedHit.t - 3) < 1e-8);
const expectedNormal = toWorld([0, 0, 1], { ...turned.frame, origin: [0, 0, 0] });
expectedNormal.forEach((v, i) => assert.ok(Math.abs(v - rotatedHit.normal[i]) < 1e-8));

// Multipart models must have genuine gaps, not just dark patches on a box.
const person = personModel(0, 0, 0, 0, 0, 0, true);
assert.ok(!person.some(p => intersectBox([0, 0.35, -2], [0, 0, 1], p)), 'Space between legs must be open');
const bench = benchModel(0, 0);
assert.ok(!bench.some(p => intersectBox([0.8, 0.25, -2], [0, 0, 1], p)), 'Space beneath the bench seat must be open');
assert.ok(bench.some(p => intersectBox([0.8, 0.52, -2], [0, 0, 1], p)), 'The bench seat must occlude a ray');
const car = vehicleModel(0, 0, 0, false, 0);
assert.ok(car.some(p => intersectBox([0, 1.1, -3], [0, 0, 1], p)), 'Car cabin must be solid raycast geometry');
assert.ok(!car.some(p => intersectBox([0, 0.1, -3], [0, 0, 1], p)), 'Chassis must leave clearance beneath the car');
const wheel = car.find(p => p.feature === 'wheel');
const midY = (wheel.min[1] + wheel.max[1]) / 2, midZ = (wheel.min[2] + wheel.max[2]) / 2;
assert.ok(intersectBox([-2, midY, midZ], [1, 0, 0], wheel), 'Wheel axle ray must hit the cap');
assert.equal(intersectBox([-2, wheel.max[1] - 0.01, wheel.max[2] - 0.01], [1, 0, 0], wheel), null,
  'Rounded wheel silhouette must exclude its bounding-box corners');
for (const part of renderer.objects) {
  assert.ok(part.min.every((v, i) => Number.isFinite(v) && v < part.max[i]), 'All model parts must have finite positive volume');
  if (part.finish) {
    const p = toWorld(part.min.map((v, i) => (v + part.max[i]) / 2), part.frame);
    for (const night of [false, true]) {
      const [glyph, color] = detailGlyph(part, p, [0, 1, 0], night);
      assert.equal(glyph.length, 1);
      assert.match(color, /^#[0-9a-f]{6}$/i);
    }
  }
}

// Cached glyphs must retain color, alignment, density and overhang without
// asking Canvas to rasterize the same text for every occupied screen cell.
const { GlyphAtlas } = await import(atlasUrl);
const paints = [], copies = [];
const painter = {
  setTransform(...args) { this.transform = args; },
  fillText(glyph, x, y) { paints.push({ glyph, x, y, color: this.fillStyle, font: this.font, transform: this.transform }); },
};
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => painter }) };
const destination = { drawImage(...args) { copies.push(args); } };
const atlas = new GlyphAtlas(5, 9, '9px "Courier New",monospace', 2);
atlas.draw(destination, '#', '#abc123', 10, 20);
atlas.draw(destination, '#', '#abc123', 15, 20);
assert.equal(paints.length, 1, 'Repeated glyph/color must reuse one rasterization');
assert.equal(copies.length, 2);
assert.equal(copies[0][0], copies[1][0], 'Repeated glyphs share the atlas page');
assert.deepEqual(copies[0].slice(1, 5), copies[1].slice(1, 5), 'Repeated glyphs share the source rectangle');
assert.deepEqual(copies[0].slice(5), [7, 17, 11, 15], 'Sprite padding must preserve glyph screen alignment');
assert.deepEqual(paints[0].transform, [2, 0, 0, 2, 0, 0]);
atlas.draw(destination, '#', '#ffe3a0', 20, 20);
assert.equal(paints.length, 2, 'Different day/night colors need distinct sprites');
assert.equal(paints[1].color, '#ffe3a0');
for (const dpr of [1, 1.25, 1.5, 2]) {
  const scaled = new GlyphAtlas(5, 9, '9px "Courier New",monospace', dpr);
  scaled.draw(destination, '/', '#123abc', 40, 40);
  assert.ok(Number.isInteger(paints.at(-1).x * dpr), 'Atlas glyph origin should align to device pixels');
  const copy = copies.at(-1);
  assert.equal(copy[3] / copy[7], dpr, 'Atlas source/destination scale must match display density');
}
console.log('Glyph atlas reuse, color changes, padding and 1x/1.25x/1.5x/2x display density passed.');
console.log('Oriented hits, open leg/bench gaps, solid vehicle cabins, and day/night detail materials passed.');

// Follow view must stay behind the character, with movement aligned to its
// forward/right basis at every yaw. These checks catch the former half-turn.
for (const angle of [0, Math.PI / 2, Math.PI, 4.3]) {
  const follower = simulatedWalker();
  follower.player = [0, 0, 0];
  follower.path = [];
  follower.fixed = [];
  follower.angle = angle;
  follower.setPOV('second');
  follower.camera();
  const forward = [-Math.sin(angle), 0, -Math.cos(angle)];
  const right = [Math.cos(angle), 0, -Math.sin(angle)];
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  assert.ok(dot(follower.center, forward) < -2, 'Follow camera must be behind the player');
  assert.ok(dot(follower.direction, forward) > 0.9, 'Camera must look forward along the player heading');
  assert.ok(follower.center[1] > 1.7, 'Default follow camera must clear the player head');
  follower.fixed = buildings();
  for (const [key, axis, sign] of [['w', forward, 1], ['s', forward, -1], ['d', right, 1], ['a', right, -1]]) {
    follower.player = [0, 0, 0];
    follower.keys = new Set([key]);
    follower.simulate(0.05);
    assert.ok(Math.abs(dot(follower.player, axis) - sign * 0.2) < 1e-8, `${key} must agree with the view at yaw ${angle}`);
  }
  follower.keys.clear();
  follower.zoomBy(0.8);
  assert.ok(follower.followDistance < 5.5, 'Follow zoom-in must shorten the camera boom');
  follower.recenter();
  assert.equal(follower.followDistance, 5.5);
  assert.equal(follower.followPitch, 0.24);
  const yaw = follower.angle;
  follower.rotate(-1);
  assert.ok(follower.angle > yaw, 'Rotate-left button must turn left');
  follower.angle = yaw;
  follower.keys.add('q');
  follower.simulate(0.05);
  assert.ok(follower.angle > yaw, 'Q must turn left');
  follower.angle = yaw;
  follower.keys = new Set(['e']);
  follower.simulate(0.05);
  assert.ok(follower.angle < yaw, 'E must turn right');
}
const nearWall = simulatedWalker();
nearWall.player = [0, 0, 0];
nearWall.path = [];
nearWall.angle = 0;
nearWall.fixed = [{ min: [-2, 0, 2], max: [2, 5, 4], name: 'Wall behind', kind: 'building' }];
nearWall.setPOV('second');
nearWall.camera();
assert.ok(nearWall.center[2] < 1.82 && nearWall.center[2] > 0, 'Follow camera must stop before the padded wall');
const sight = nearWall.direction.map(v => -v);
assert.ok(intersectBox([0, 1.1, 0], sight, nearWall.fixed[0]).t > Math.hypot(...nearWall.center.map((v, i) => v - [0, 1.1, 0][i])));
nearWall.fixed[0].min[2] = 0.5;
nearWall.camera();
assert.ok(nearWall.hiddenFromCamera(person[0]), 'A retracted camera must not render the inside of the avatar');
console.log('Follow-camera placement, WASD at four headings, turn controls, zoom/reset and wall clearance passed.');

// The entire 3×3 world must be connected, including routes through shared roads.
assert.equal(DISTRICTS.length, 9);
assert.equal(new Set(DISTRICTS.map(d => `${d.x},${d.z}`)).size, 9);
const traveler = simulatedWalker();
const routeStart = performance.now();
for (const from of DISTRICTS) for (const to of DISTRICTS) {
  traveler.player = districtDestination(from);
  traveler.path = [];
  assert.equal(districtAt(from.x, from.z), from);
  assert.ok(traveler.visitDistrict(to.id), `${from.name} must connect to ${to.name}`);
  if (from !== to) assert.deepEqual(traveler.path.at(-1), districtDestination(to));
  let previous = traveler.player;
  for (const p of traveler.path) {
    assert.ok(canWalk(p[0], p[2], traveler.fixed), 'Routes must clear both buildings and solid props');
    assert.ok(Math.hypot(p[0] - previous[0], p[2] - previous[2]) <= .500001);
    assert.ok(canWalk((p[0] + previous[0]) / 2, (p[2] + previous[2]) / 2, traveler.fixed));
    previous = p;
  }
}
assert.equal(traveler.visitDistrict('missing'), false);
const intactPath = traveler.path;
assert.equal(traveler.walkTo(WORLD_LIMIT + 5, 0), false);
assert.equal(traveler.path, intactPath);
assert.ok(canWalk(26, 0, traveler.fixed), 'The old boundary must open into the neighboring blocks');
for (let street = -63; street <= 63; street += 21) for (let along = -63; along <= 63; along += .5) {
  assert.equal(roadDistance(street), 0);
  assert.ok(canWalk(street, along, traveler.fixed), 'North–south streets must remain clear');
  assert.ok(canWalk(along, street, traveler.fixed), 'East–west streets must remain clear');
}
for (const scene of cityWorld().blocks) {
  assert.ok(scene.coarse.some(b => b.kind === 'building'), 'Every block needs permanent architecture');
  // The pedestrian loop is an unobstructed sidewalk in every block.
  for (let t = 0; t < 144; t += .5) {
    const [x, z] = traveler.route(t, 18);
    assert.ok(canWalk(scene.district.x + x, scene.district.z + z, traveler.fixed), `Sidewalk blocked in ${scene.district.name}`);
  }
}
console.log(`All 81 district routes, shared streets, sidewalk loops and world boundaries passed in ${Math.round(performance.now() - routeStart)} ms.`);

// Exercise complete frames without a browser, including the detailed material
// pass and near-plane clipping while the first-person camera looks at its feet.
const noop = () => {};
globalThis.document = { createElement: () => ({ width: 0, height: 0,
  getContext: () => new Proxy({}, { get: (target, key) => target[key] ?? noop,
    set: (target, key, value) => { target[key] = value; return true; } }),
}) };
renderer.ctx = new Proxy({}, { get: (target, key) => target[key] ?? noop, set: (target, key, value) => { target[key] = value; return true; } });
renderer.canvas = { dataset: {} };
renderer.depths = new Float32Array(renderer.columns * renderer.rows);
renderer.priorities = new Uint8Array(renderer.columns * renderer.rows);
renderer.glyphs = Array(renderer.columns * renderer.rows).fill(' ');
renderer.colors = Array(renderer.columns * renderer.rows).fill('');
renderer.dpr = 1;
renderer.mode = 'ink';
renderer.player = [0, 0, 18];
renderer.focus = [0, 0, 15];
renderer.angle = 0;
renderer.simulate(0);
for (const pov of ['first', 'second', 'third']) {
  renderer.setPOV(pov);
  renderer.lookPitch = pov === 'first' ? 1.35 : 0;
  for (const clock of [540, 1260]) {
    renderer.clock = clock;
    const start = performance.now();
    renderer.render();
    assert.ok(renderer.glyphs.some(g => g !== ' '), 'A complete frame must contain visible glyphs');
    assert.ok(renderer.depths.every(d => !Number.isNaN(d)));
    assert.ok(renderer.glyphs.every(g => typeof g === 'string' && g.length === 1));
    console.log(`${pov}, ${clock === 540 ? 'day' : 'night'}: CPU frame ${Math.round(performance.now() - start)} ms (drawing calls stubbed).`);
  }
  if (pov === 'first') {
    let visibleBody = false;
    for (let row = 0; row < renderer.rows && !visibleBody; row += 3)
      for (let col = 0; col < renderer.columns; col += 3) {
        const px = (col + 0.5) * renderer.cw, py = (row + 0.5) * renderer.ch;
        if (renderer.trace(renderer.ray(px, py), col, row, renderer.rayDirection(px, py))?.box?.kind === 'player') {
          visibleBody = true;
          break;
        }
      }
    assert.ok(visibleBody, 'Looking down in first person must reveal the player body');
  }
}

// Check the new districts and the full overview, not just the original crossing.
renderer.mapCanvas = { width: 180, getContext: () => renderer.ctx };
for (const d of DISTRICTS) for (const pov of ['first', 'second', 'third']) {
  renderer.player = districtDestination(d);
  renderer.setPOV(pov);
  renderer.angle = .7; renderer.lookPitch = .12;
  renderer.simulate(0); renderer.render();
  for (let row = 2; row < renderer.rows; row += 14) for (let col = 2; col < renderer.columns; col += 19) {
    const x = renderer.gridX + (col + .5) * renderer.cw, y = renderer.gridY + (row + .5) * renderer.ch;
    const o = renderer.ray(x, y), direction = renderer.rayDirection(x, y);
    const full = renderer.trace(o, -1, -1, direction), fast = renderer.trace(o, col, row, direction);
    assert.equal(full?.box, fast?.box, `Screen bins must agree in ${d.name}, ${pov}`);
    if (full) assert.ok(Math.abs(full.t - fast.t) < 1e-8);
  }
}
renderer.setOverview(); renderer.simulate(0); renderer.render();
assert.ok(renderer.objects.length < 350, 'The overview must use coarse models, not thousands of door and actor parts');
for (const d of DISTRICTS) {
  const p = renderer.project([d.x, 0, d.z]);
  assert.ok(p[0] > 0 && p[0] < renderer.width && p[1] > 0 && p[1] < renderer.height);
}
console.log('All nine districts rendered in all three views; map drawing, screen bins and overview detail budget passed.');
renderer.setPOV('first'); renderer.setPOV('third');
assert.equal(renderer.overview, false);
assert.equal(renderer.span, 45, 'Leaving the overview through the camera menu must restore the street zoom');
