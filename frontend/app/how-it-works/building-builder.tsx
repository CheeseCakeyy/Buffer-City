'use client';

import { useState } from 'react';
import s from './guide.module.css';

type Vec = [number, number, number];
const initial = ['0', '0', '0', '8', '12', '7'];
const right: Vec = [.8, 0, -.6];
const up: Vec = [-.3, Math.sqrt(.75), -.4];
const direction: Vec = [-.6 * Math.sqrt(.75), -.5, -.8 * Math.sqrt(.75)];
const dot = (a: Vec, b: Vec) => a.reduce((sum, v, i) => sum + v * b[i], 0);

// One parallel ray per text cell, intersected with the user-defined box.
export function renderBuilding(min: Vec, max: Vec) {
  const corners: Vec[] = [[0, 0, 0]];
  for (const x of [min[0], max[0]]) for (const y of [0, min[1], max[1]]) for (const z of [min[2], max[2]]) corners.push([x, y, z]);
  const xs = corners.map(p => dot(p, right)), ys = corners.map(p => dot(p, up));
  const left = Math.min(...xs), top = Math.max(...ys);
  const w = Math.max(...xs) - left, h = top - Math.min(...ys);
  const scale = Math.min(54 / Math.max(w, 1), 27 * 1.8 / Math.max(h, 1));
  const cx = left + w / 2, cy = top - h / 2;
  const rows: { text: string; lit: boolean }[][] = [];
  for (let row = 0; row < 34; row++) {
    const line: { text: string; lit: boolean }[] = [];
    for (let col = 0; col < 64; col++) {
      const u = cx + (col - 31.5) / scale, v = cy + (16.5 - row) * 1.8 / scale;
      const origin = right.map((r, i) => r * u + up[i] * v - direction[i] * 150) as Vec;
      let near = -Infinity, far = Infinity, axis = 0;
      for (let i = 0; i < 3; i++) {
        const a = (min[i] - origin[i]) / direction[i], b = (max[i] - origin[i]) / direction[i];
        const entry = Math.min(a, b);
        if (entry > near) { near = entry; axis = i; }
        far = Math.min(far, Math.max(a, b));
      }
      let mark = ' ', lit = false;
      if (near <= far && near > 0) {
        const p = origin.map((o, i) => o + direction[i] * near) as Vec;
        const horizontal = axis === 0 ? 2 : 0;
        const edge = Math.min(p[horizontal] - min[horizontal], max[horizontal] - p[horizontal]);
        const threshold = .65 / scale;
        if (axis === 1) {
          const roofEdge = Math.min(edge, p[2] - min[2], max[2] - p[2]);
          mark = roofEdge < threshold ? '_' : (col + row) % 3 === 0 ? '-' : '.';
        } else if (edge < threshold) mark = '|';
        else if (Math.min(p[1] - min[1], max[1] - p[1]) < threshold * 1.8) mark = '_';
        else {
          const bay = p[horizontal] - min[horizontal], height = p[1] - min[1];
          lit = height > 1 && bay % 2.5 > .65 && bay % 2.5 < 1.65 && height % 3 > 1 && height % 3 < 2.1;
          mark = lit ? '#' : (col + row) % 4 === 0 ? '.' : ' ';
        }
      } else {
        const t = -origin[1] / direction[1];
        const gx = origin[0] + direction[0] * t, gz = origin[2] + direction[2] * t;
        if (Math.abs(gx) < .7 / scale && Math.abs(gz) < .7 / scale) mark = '+';
        else if (row > 18 && row % 3 === 0 && col % 4 === 0) mark = '.';
      }
      const last = line.at(-1);
      if (last && last.lit === lit) last.text += mark;
      else line.push({text: mark, lit});
    }
    rows.push(line);
  }
  return rows;
}

export function BuildingBuilder() {
  const [values, setValues] = useState(initial);
  const numbers = values.map(v => v.trim() === '' ? NaN : Number(v));
  const min = numbers.slice(0, 3) as Vec, max = numbers.slice(3) as Vec;
  const invalid = numbers.some(n => !Number.isFinite(n) || n < -30 || n > 30);
  const error = invalid ? 'Enter all six coordinates between −30 and 30.' : min.some((n, i) => n >= max[i]) ? 'Each max coordinate must be greater than its matching min.' : min[1] < 0 ? 'Keep min Y at 0 or above so the building is above ground.' : '';
  const drawing = !error ? renderBuilding(min, max) : null;
  return <div className={s.builder}>
    <div className={s.builderHeading}><span className={s.diagramLabel}>YOUR FIRST ASCII BUILDING</span><span className={s.liveLabel}>● LIVE PREVIEW</span></div>
    <div className={s.buildingViewport} role="img" aria-label={error ? 'Preview unavailable until coordinates are valid' : `ASCII building from [${min.join(', ')}] to [${max.join(', ')}]`}>
      {drawing ? <pre aria-hidden="true">{drawing.map((line, row) => <span key={row}>{line.map((run, i) => <span key={i} className={run.lit ? s.litWindow : undefined}>{run.text}</span>)}{'\n'}</span>)}</pre> : <p>Set two valid corners<br />to bring your building into view.</p>}
    </div>
    <div className={s.builderDimensions} aria-live="polite">{error || `${+(max[0] - min[0]).toFixed(2)} wide × ${+(max[1] - min[1]).toFixed(2)} high × ${+(max[2] - min[2]).toFixed(2)} deep`}</div>
    <div className={s.vectorInputs}>{['min', 'max'].map((corner, group) => <fieldset key={corner}><legend>{corner} <span>/ {group ? 'upper corner' : 'lower corner'}</span></legend><div>{['X', 'Y', 'Z'].map((axis, i) => <label key={axis}>{axis}<input type="number" step="0.5" min={i === 1 ? 0 : -30} max="30" aria-label={`${corner} ${axis}`} aria-invalid={!!error} aria-describedby="building-help" value={values[group * 3 + i]} onChange={e => setValues(old => old.map((v, j) => j === group * 3 + i ? e.target.value : v))} /></label>)}</div></fieldset>)}</div>
    <div className={s.builderBottom}><p id="building-help">Change a corner. Watch the shape respond.<br />X: east/west · Y: height · Z: north/south</p><button onClick={() => setValues([...initial])}>Reset</button></div>
    <p className={s.builderFootnote}>Preview only · automatically framed with the world origin (+). Windows follow the walls.</p>
  </div>;
}
