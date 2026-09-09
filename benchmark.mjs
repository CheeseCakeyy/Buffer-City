// Repeatable CPU and draw-call profile. Canvas commands are counted, not
// rasterized; these timings must not be presented as browser FPS.
import fs from 'node:fs';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const reference = process.argv.includes('--reference');
const read = path => reference ? execFileSync('git', ['show', 'HEAD:' + path], { encoding: 'utf8' }) : fs.readFileSync(path, 'utf8');
const transpile = path => ts.transpileModule(read(path), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const details = url(transpile('lib/street-details.ts') + '\n//# sourceURL=street-details.js');
const atlas = reference ? '' : url(transpile('lib/glyph-atlas.ts'));
const { City, buildings } = await import(url(transpile('lib/city.ts').replace("'./street-details'", JSON.stringify(details))
  .replace("'./glyph-atlas'", JSON.stringify(atlas)) + '\n//# sourceURL=city.js'));
const scenarios = [
  { name: 'crossing', player: [0, 0, 18], angle: 0.49 },
  { name: 'shopfront', player: [-1, 0, -5], angle: 1.57 },
  { name: 'vehicles', player: [-7, 0, 18], angle: Math.PI },
];
const output = [];
const median = a => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
for (const pov of ['third', 'first', 'second']) for (const scene of scenarios) {
  const r = Object.create(City.prototype);
  const counts = { fillText: 0, drawImage: 0, colors: 0, atlasText: 0 };
  const noop = () => {};
  const ctx = new Proxy({ fillText: () => counts.fillText++, drawImage: () => counts.drawImage++ }, {
    get: (target, key) => target[key] ?? noop,
    set: (target, key, value) => { if (key === 'fillStyle') counts.colors++; target[key] = value; return true; },
  });
  globalThis.document = { createElement: () => ({ width: 0, height: 0,
    getContext: () => new Proxy({ fillText: () => counts.atlasText++ }, {
      get: (target, key) => target[key] ?? noop,
      set: (target, key, value) => { target[key] = value; return true; },
    }),
  }) };
  Object.assign(r, { player: [...scene.player], focus: [...scene.player], angle: scene.angle,
    lookPitch: 0.04, followPitch: 0.24, followDistance: 5.5, fov: 72, span: 45,
    fixed: buildings(), path: [], keys: new Set(), paused: false, clock: 540, elapsed: 0,
    width: 1600, height: 900, cw: 5, ch: 9, columns: 321, rows: 101, dpr: 2,
    overview: false, pov, mode: 'ink', ctx, canvas: { dataset: {} },
    depths: new Float32Array(321 * 101), priorities: new Uint8Array(321 * 101),
    glyphs: Array(321 * 101).fill(' '), colors: Array(321 * 101).fill(''),
  });
  const stages = { buildRowBounds: 0, drawDetails: 0, drawShopSigns: 0 };
  for (const name of Object.keys(stages)) {
    const original = r[name];
    r[name] = function (...args) { const start = performance.now(); const result = original.apply(this, args); stages[name] += performance.now() - start; return result; };
  }
  for (let i = 0; i < 10; i++) { r.simulate(1 / 60); r.render(); }
  const samples = [], snapshots = [];
  for (let i = 0; i < 20; i++) {
    for (const key of Object.keys(counts)) counts[key] = 0;
    for (const key of Object.keys(stages)) stages[key] = 0;
    const start = performance.now();
    r.simulate(1 / 60);
    const simulated = performance.now();
    r.render();
    samples.push(performance.now() - start);
    snapshots.push({ ...stages, simulation: simulated - start, ...counts });
  }
  const row = { pov, scene: scene.name, cpuMs: +median(samples).toFixed(2) };
  for (const key of Object.keys(snapshots[0])) row[key] = +median(snapshots.map(s => s[key])).toFixed(2);
  row.imageHash = createHash('sha256').update(r.glyphs.map((g, i) => g === ' ' ? ' ' : g + r.colors[i]).join('')).digest('hex');
  output.push(row);
}
console.table(output.map(({ imageHash, ...row }) => row));
const path = process.argv.slice(2).find(arg => !arg.startsWith('--'));
if (path) fs.writeFileSync(path, JSON.stringify(output, null, 2) + '\n');
