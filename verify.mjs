import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync('lib/city.ts', 'utf8'), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const { intersectBox, canWalk, buildings } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);
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
assert.equal(canWalk(26, 0, buildings()), false);
console.log('10 ray intersection and movement collision assertions passed.');
const { City } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
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
  for (const angle of [0, 0.8, 2, 3.7]) {
    renderer.angle = angle;
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
        if (pov === 'first') assert.notEqual(full?.box?.kind, 'player');
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
  cw: 7,
  ch: 12,
  columns: 184,
  rows: 76,
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
