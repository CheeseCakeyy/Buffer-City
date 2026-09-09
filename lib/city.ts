export type Vec = [number, number, number];
export type Box = {
  min: Vec;
  max: Vec;
  name: string;
  kind: string;
  detail?: string;
};
export type Hit = { t: number; normal: Vec; box: Box | null };
export type CityStats = {
  time: string;
  fps: number;
  cells: number;
  overview?: boolean;
  pov?: 'third' | 'second' | 'first';
  selected: string;
};
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mod = (n: number, m: number) => ((n % m) + m) % m;
export function intersectBox(o: Vec, d: Vec, b: Box): Hit | null {
  let near = -Infinity,
    far = Infinity;
  let normal: Vec = [0, 0, 0],
    exitNormal: Vec = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < b.min[a] || o[a] > b.max[a]) return null;
      continue;
    }
    let t1 = (b.min[a] - o[a]) / d[a],
      t2 = (b.max[a] - o[a]) / d[a],
      sign = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      sign = 1;
    }
    if (t1 > near) {
      near = t1;
      normal = [0, 0, 0];
      normal[a] = sign;
    }
    if (t2 < far) {
      far = t2;
      exitNormal = [0, 0, 0];
      exitNormal[a] = -sign;
    }
    if (near > far) return null;
  }
  if (far < 0) return null;
  return {
    t: near >= 0 ? near : far,
    normal: near >= 0 ? normal : exitNormal,
    box: b,
  };
}
export function canWalk(x: number, z: number, boxes: Box[]) {
  return (
    Math.abs(x) < 25 &&
    Math.abs(z) < 25 &&
    !boxes.some(
      (b) =>
        b.min[1] < 1.6 &&
        x > b.min[0] - 0.35 &&
        x < b.max[0] + 0.35 &&
        z > b.min[2] - 0.35 &&
        z < b.max[2] + 0.35,
    )
  );
}
function box(
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  name: string,
  kind = 'building',
  detail = '',
): Box {
  return { min: [x, 0, z], max: [x + w, h, z + d], name, kind, detail };
}
export function buildings(): Box[] {
  return [
    box(
      -16,
      -16,
      7,
      9,
      12,
      'Maple House',
      'building',
      'Four floors of apartments above a corner grocer. Exterior only in this prototype.',
    ),
    box(
      -8,
      -16,
      5,
      7,
      7,
      'Studio 08',
      'building',
      'A small neighborhood workshop.',
    ),
    box(
      -16,
      -6,
      12,
      3,
      4,
      'Paper & Steam',
      'building',
      'The long, low café on Maple Street.',
    ),
    box(
      4,
      -16,
      11,
      6,
      9,
      'The Reading Room',
      'building',
      'A neighborhood library with a broad flat roof.',
    ),
    box(
      5,
      -9,
      6,
      6,
      6,
      'Radio Supply',
      'building',
      'An electronics shop facing the crossing.',
    ),
    box(
      -16,
      4,
      6,
      12,
      10,
      'Hotel Juniper',
      'building',
      'Three floors overlooking the southern avenue.',
    ),
    box(
      -9,
      5,
      6,
      6,
      5,
      'Corner Records',
      'building',
      'The little record shop beside the courtyard.',
    ),
    box(
      4,
      4,
      7,
      7,
      6.5,
      'The Exchange',
      'building',
      'Workspaces above the eastern sidewalk.',
    ),
    box(
      12,
      4,
      4,
      12,
      10,
      'East Tower',
      'building',
      'The tallest building on the block.',
    ),
    box(
      4,
      12,
      7,
      4,
      4,
      'Botanical Club',
      'building',
      'A small meeting room on the garden side.',
    ),
  ];
}
export class City {
  pov: 'third' | 'second' | 'first' = 'third';
  private lookPitch = 0.04;
  private fov = 72;
  private get perspective() { return this.pov === 'first' || this.pov === 'second'; }
  setPOV(pov: 'third' | 'second' | 'first') {
    this.pov = pov;
    this.overview = false;
    this.path = [];
    this.focus = [...this.player];
  }
  keys = new Set<string>();
  paused = false;
  mode = 'ink';
  private ctx: CanvasRenderingContext2D;
  private frame = 0;
  private prev = 0;
  private reportAt = 0;
  private frames = 0;
  private width = 0;
  private height = 0;
  private columns = 0;
  private rows = 0;
  private cw = 5;
  private ch = 9;
  private angle = (28 * Math.PI) / 180;
  private span = 45;
  private player: Vec = [0, 0, 18];
  private clock = 540;
  private elapsed = 0;
  private fixed = buildings();
  private objects: Box[] = [];
  private selected = 'Click a building to inspect it.';
  private selectedName = '';
  private observer: ResizeObserver;
  private focus: Vec = [0, 0, 15];
  private path: Vec[] = [];
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private depths = new Float32Array(0);
  private glyphs: string[] = [];
  private colors: string[] = [];
  private priorities = new Uint8Array(0);
  private gridX = 0;
  private gridY = 0;
  private dpr = 1;
  private lastPointerUpMoved = false;
  private mapCanvas: HTMLCanvasElement | null = null;
  private rowBounds: Array<Array<{ box: Box; left: number; right: number }>> =
    [];

  overview = false;
  setOverview() {
    this.pov = 'third';
    this.overview = !this.overview;
    this.span = this.overview ? 72 : 45;
  }
  private pointerdown = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId);
    this.lastPointerUpMoved = false;
    this.drag = { x: e.clientX, y: e.clientY, moved: false };
  };
  private pointermove = (e: PointerEvent) => {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    if (this.perspective) {
      const dy = e.clientY - this.drag.y;
      this.lookPitch = Math.max(-0.65, Math.min(0.65, this.lookPitch + dy * 0.004));
      this.drag.y = e.clientY;
      if (Math.abs(dy) > 2) this.drag.moved = true;
    }
    if (Math.abs(dx) > 2 || this.drag.moved) {
      this.angle -= dx * 0.006;
      this.drag.moved = true;
      this.drag.x = e.clientX;
    }
  };
  private pointerup = () => {
    this.lastPointerUpMoved = !!this.drag?.moved;
    this.drag = null;
  };
  private walkTo(x: number, z: number) {
    const step = 0.5,
      start = [
        Math.round(this.player[0] / step),
        Math.round(this.player[2] / step),
      ],
      end = [Math.round(x / step), Math.round(z / step)];
    if (!canWalk(end[0] * step, end[1] * step, this.fixed)) return false;
    const key = (a: number, b: number) => a + ',' + b,
      queue = [start],
      seen = new Map<string, number[] | null>([
        [key(...(start as [number, number])), null],
      ]);
    let head = 0,
      found = false;
    while (head < queue.length) {
      const c = queue[head++];
      if (c[0] === end[0] && c[1] === end[1]) {
        found = true;
        break;
      }
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const a = c[0] + dx,
          b = c[1] + dz,
          k = key(a, b);
        if (!seen.has(k) && canWalk(a * step, b * step, this.fixed)) {
          seen.set(k, c);
          queue.push([a, b]);
        }
      }
    }
    if (found) {
      const route: Vec[] = [];
      let c: number[] | null = end;
      while (c && (c[0] !== start[0] || c[1] !== start[1])) {
        route.push([c[0] * step, 0, c[1] * step]);
        c = seen.get(key(c[0], c[1])) || null;
      }
      this.path = route.reverse();
      return true;
    }
    return false;
  }

  private right: Vec = [0, 0, 0];
  private up: Vec = [0, 0, 0];
  private direction: Vec = [0, 0, 0];
  private center: Vec = [0, 0, 0];
  constructor(
    private canvas: HTMLCanvasElement,
    private report: (s: CityStats) => void,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.blur);
    canvas.addEventListener('pointerdown', this.pointerdown);
    canvas.addEventListener('pointermove', this.pointermove);
    canvas.addEventListener('pointerup', this.pointerup);
    canvas.addEventListener('pointercancel', this.pointerup);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    canvas.addEventListener('click', this.click);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }
  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.width = r.width;
    this.height = r.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.columns = Math.ceil(this.width / this.cw) + 1;
    this.rows = Math.ceil(this.height / this.ch) + 1;
    this.depths = new Float32Array(this.columns * this.rows);
    this.priorities = new Uint8Array(this.columns * this.rows);
    this.glyphs = Array.from({ length: this.columns * this.rows }, () => '');
    this.colors = Array.from({ length: this.columns * this.rows }, () => '');
    this.dpr = dpr;
  }
  rotate(n: number) {
    this.angle += (n * Math.PI) / 8;
  }
  zoomBy(n: number) {
    if (this.perspective) {
      this.fov = Math.max(45, Math.min(100, this.fov * n));
      return;
    }
    this.span = Math.max(28, Math.min(100, this.span * n));
  }
  reset() {
    this.player = [0, 0, 18];
    this.angle = (28 * Math.PI) / 180;
    this.span = 45;
    this.overview = false;
    this.path = [];
    this.focus = [0, 0, 15];
  }
  recenter() {
    this.focus = [...this.player];
    this.span = 45;
    this.overview = false;
  }
  toggleNight() {
    this.clock = this.clock >= 1080 || this.clock < 360 ? 540 : 1260;
  }
  private blur = () => {
    this.keys.clear();
    this.prev = 0;
  };
  private keydown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
    const k = e.key.toLowerCase();
    if (
      ![
        'w',
        'a',
        's',
        'd',
        'arrowup',
        'arrowdown',
        'arrowleft',
        'arrowright',
        'q',
        'e',
        '+',
        '=',
        '-',
        'shift',
        'home',
      ].includes(k)
    )
      return;
    e.preventDefault();
    this.keys.add(k);
    if (!e.repeat) {
      if (k === 'home') this.reset();
      if (k === '+' || k === '=') this.zoomBy(0.87);
      if (k === '-') this.zoomBy(1.15);
    }
  };
  private keyup = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(e.deltaY > 0 ? 1.06 : 0.94);
  };
  private camera() {
    if (this.perspective) {
      const yaw = this.angle + (this.pov === 'second' ? Math.PI : 0);
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const e = this.pov === 'second' ? 0.12 : this.lookPitch;
      this.right = [c, 0, -s];
      this.up = [-s * Math.sin(e), Math.cos(e), -c * Math.sin(e)];
      this.direction = [-s * Math.cos(e), -Math.sin(e), -c * Math.cos(e)];
      this.center = [this.player[0], 1.65, this.player[2]];
      if (this.pov === 'second') {
        const toward: Vec = [-Math.sin(this.angle), 0.12, -Math.cos(this.angle)];
        let distance = 5;
        for (const b of this.fixed) {
          const hit = intersectBox(this.center, toward, b);
          if (hit) distance = Math.min(distance, Math.max(0.35, hit.t - 0.3));
        }
        this.center = this.center.map((v, i) => v + toward[i] * distance) as Vec;
      }
      return;
    }
    const c = Math.cos(this.angle),
      s = Math.sin(this.angle),
      e = ((this.overview ? 35.264 : 27) * Math.PI) / 180;
    this.right = [c, 0, -s];
    this.up = [-s * Math.sin(e), Math.cos(e), -c * Math.sin(e)];
    this.direction = [-s * Math.cos(e), -Math.sin(e), -c * Math.cos(e)];
    this.center = [
      (this.overview ? 0 : this.focus[0]) - this.direction[0] * 75,
      2 - this.direction[1] * 75,
      (this.overview ? 0 : this.focus[2]) - this.direction[2] * 75,
    ];
  }
  private viewScale() {
    return (
      Math.min(
        this.overview ? this.width : Math.max(this.width, 680),
        this.height * 1.35,
      ) / this.span
    );
  }
  private viewCenterY() {
    if (this.perspective) return this.height / 2;
    return this.height * (this.width < 700 ? 0.51 : 0.6);
  }
  private ray(px: number, py: number): Vec {
    if (this.perspective) return [...this.center];
    const scale = 1 / this.viewScale();
    const u = (px - this.width / 2) * scale,
      v = (this.viewCenterY() - py) * scale;
    return [
      this.center[0] + this.right[0] * u + this.up[0] * v,
      this.center[1] + this.up[1] * v,
      this.center[2] + this.right[2] * u + this.up[2] * v,
    ];
  }

  private focalLength() { return Math.max(this.width, this.height * 0.75) / (2 * Math.tan((this.fov ?? 72) * Math.PI / 360)); }
  private rayDirection(px: number, py: number): Vec {
    if (!this.perspective) return this.direction;
    const u = (px - this.width / 2) / this.focalLength();
    const v = (this.height / 2 - py) / this.focalLength();
    return this.direction.map((d, i) => d + this.right[i] * u + this.up[i] * v) as Vec;
  }
  private buildRowBounds() {
    this.rowBounds = Array.from({ length: this.rows }, () => []);
    for (const box of this.objects) {
      if (this.pov === 'first' && box.kind === 'player') continue;
      if (this.perspective) {
        const depths: number[] = [];
        for (const x of [box.min[0], box.max[0]])
          for (const y of [box.min[1], box.max[1]])
            for (const z of [box.min[2], box.max[2]])
              depths.push(this.project([x, y, z])[2]);
        if (Math.max(...depths) < 0.08) continue;
        if (Math.min(...depths) < 0.08) {
          const entry = { box, left: 0, right: this.columns };
          for (const row of this.rowBounds) row.push(entry);
          continue;
        }
      }
      let left = Infinity,
        right = -Infinity,
        top = Infinity,
        bottom = -Infinity;
      for (const x of [box.min[0], box.max[0]])
        for (const y of [box.min[1], box.max[1]])
          for (const z of [box.min[2], box.max[2]]) {
            const p = this.project([x, y, z]);
            left = Math.min(left, p[0]);
            right = Math.max(right, p[0]);
            top = Math.min(top, p[1]);
            bottom = Math.max(bottom, p[1]);
          }
      const entry = {
        box,
        left: Math.floor((left - this.gridX) / this.cw) - 1,
        right: Math.ceil((right - this.gridX) / this.cw) + 1,
      };
      const a = Math.max(0, Math.floor((top - this.gridY) / this.ch) - 1),
        b = Math.min(
          this.rows - 1,
          Math.ceil((bottom - this.gridY) / this.ch) + 1,
        );
      for (let row = a; row <= b; row++) this.rowBounds[row].push(entry);
    }
  }
  private trace(o: Vec, col = -1, row = -1, d: Vec = this.direction): Hit | null {
    let nearest: Hit | null = null;
    const t = -o[1] / d[1];
    if (t >= 0) {
      const x = o[0] + t * d[0],
        z = o[2] + t * d[2];
      if (Math.abs(x) < 26 && Math.abs(z) < 26)
        nearest = { t, normal: [0, 1, 0], box: null };
    }
    if (row >= 0) {
      for (const entry of this.rowBounds[row]) {
        if (col < entry.left || col > entry.right) continue;
        const hit = intersectBox(o, d, entry.box);
        if (hit && (!nearest || hit.t < nearest.t)) nearest = hit;
      }
    } else {
      for (const b of this.objects) {
        if (this.pov === 'first' && b.kind === 'player') continue;
        const hit = intersectBox(o, d, b);
        if (hit && (!nearest || hit.t < nearest.t)) nearest = hit;
      }
    }
    return nearest;
  }

  private click = (e: MouseEvent) => {
    if (this.lastPointerUpMoved) return;
    this.canvas.focus();
    const r = this.canvas.getBoundingClientRect(),
      o = this.ray(e.clientX - r.left, e.clientY - r.top),
      d = this.rayDirection(e.clientX - r.left, e.clientY - r.top),
      hit = this.trace(o, -1, -1, d);
    if (!hit) {
      this.selected = 'Choose a street or sidewalk inside the block.';
      return;
    }
    this.selectedName = hit.box?.name || '';
    if (hit.box) {
      this.selected =
        hit.box.name +
        '. ' +
        (hit.box.detail || 'A moving part of the neighborhood.');
      return;
    }
    const started = this.walkTo(
      o[0] + hit.t * d[0],
      o[2] + hit.t * d[2],
    );
    this.selected = started
      ? 'Walking there. WASD takes over at any time.'
      : 'That spot is blocked. Choose a clear street or sidewalk.';
  };
  private route(t: number, r: number): [number, number, boolean] {
    const p = mod(t, r * 8);
    if (p < r * 2) return [-r + p, -r, true];
    if (p < r * 4) return [r, -r + p - r * 2, false];
    if (p < r * 6) return [r - (p - r * 4), r, true];
    return [-r, r - (p - r * 6), false];
  }
  private simulate(dt: number) {
    if (!this.paused) {
      this.elapsed += dt;
      this.clock = mod(this.clock + dt * 4, 1440);
    }
    let dx =
      Number(this.keys.has('d') || this.keys.has('arrowright')) -
      Number(this.keys.has('a') || this.keys.has('arrowleft'));
    let dz =
      Number(this.keys.has('s') || this.keys.has('arrowdown')) -
      Number(this.keys.has('w') || this.keys.has('arrowup'));
    this.angle +=
      (Number(this.keys.has('e')) - Number(this.keys.has('q'))) * dt * 1.2;
    const len = Math.hypot(dx, dz);
    if (len) this.path = [];
    if (!len && this.path.length) {
      let remaining = dt * 5;
      while (remaining > 0 && this.path.length) {
        const target = this.path[0],
          dx = target[0] - this.player[0],
          dz = target[2] - this.player[2],
          distance = Math.hypot(dx, dz);
        if (distance <= remaining) {
          this.player[0] = target[0];
          this.player[2] = target[2];
          this.path.shift();
          remaining -= distance;
          if (!this.path.length)
            this.selected =
              'Arrived. Choose another street, or explore with WASD.';
        } else {
          this.player[0] += (dx / distance) * remaining;
          this.player[2] += (dz / distance) * remaining;
          remaining = 0;
        }
      }
    }

    if (len) {
      dx /= len;
      dz /= len;
      const c = Math.cos(this.angle),
        s = Math.sin(this.angle),
        speed = dt * (this.keys.has('shift') ? 8 : 4);
      const x = this.player[0] + (dx * c + dz * s) * speed,
        z = this.player[2] + (-dx * s + dz * c) * speed;
      if (canWalk(x, this.player[2], this.fixed)) this.player[0] = x;
      if (canWalk(this.player[0], z, this.fixed)) this.player[2] = z;
    }
    const fx = this.player[0] - this.focus[0],
      fz = this.player[2] - this.focus[2],
      distance = Math.hypot(fx, fz),
      deadZone = 3;
    if (distance > deadZone) {
      const amount =
        ((distance - deadZone) / distance) * (1 - Math.exp(-dt * 7));
      this.focus[0] += fx * amount;
      this.focus[2] += fz * amount;
    }
    this.objects = [...this.fixed];
    for (let i = 0; i < this.fixed.length; i++) {
      const b = this.fixed[i],
        x = b.min[0] + 1.2,
        z = b.min[2] + 1.3,
        y = b.max[1];
      if (i % 3 === 0)
        this.objects.push({
          min: [x, y, z],
          max: [x + 2.5, y + 0.7, z + 1.2],
          name: b.name,
          kind: 'roof',
          detail: b.detail,
        });
      if (i === 2 || i === 4 || i === 6) {
        const Z = b.max[2];
        this.objects.push({
          min: [b.min[0] + 0.3, 2, Z],
          max: [b.max[0] - 0.3, 2.45, Z + 0.9],
          name: b.name,
          kind: 'awning',
          detail: b.detail,
        });
      }
    }
    for (const [i, text] of [
      [0, 'MAPLE'],
      [2, 'CAFE'],
      [4, 'RADIO'],
      [5, 'HOTEL'],
      [6, 'RECORDS'],
    ] as [number, string][]) {
      const b = this.fixed[i],
        h = Math.min(b.max[1] - 0.3, 2.4 + text.length * 0.6);
      this.objects.push({
        min: [b.max[0], 2.0, b.max[2] + 0.2],
        max: [b.max[0] + 0.9, h, b.max[2] + 0.45],
        name: text,
        kind: 'sign',
        detail: b.detail,
      });
    }
    // Parked vehicles beside the south curb.
    for (let i = 0; i < 3; i++)
      this.objects.push(
        box(
          -12 + i * 4,
          23,
          2.6,
          1.15,
          1,
          'Parked car',
          'car',
          'A parked neighborhood runabout.',
        ),
      );

    for (let i = 0; i < 6; i++) {
      const [x, z, horizontal] = this.route(this.elapsed * 3 + i * 28, 21),
        length = i === 0 ? 5 : 2.6;
      this.objects.push(
        box(
          x - (horizontal ? length / 2 : 0.6),
          z - (horizontal ? 0.6 : length / 2),
          horizontal ? length : 1.2,
          horizontal ? 1.2 : length,
          i === 0 ? 1.7 : 1,
          i === 0 ? 'Bus 16' : 'Car ' + (i + 1),
          'car',
          'Following the one-way perimeter loop.',
        ),
      );
    }
    for (let i = 0; i < 12; i++) {
      const [x, z] = this.route(this.elapsed * 0.8 + i * 13, 18);
      this.objects.push(
        box(
          x - 0.18,
          z - 0.18,
          0.36,
          0.36,
          1.45,
          'Resident ' + (i + 1),
          'person',
          'Walking a simple sidewalk loop.',
        ),
      );
    }
    this.objects.push(
      box(
        this.player[0] - 0.27,
        this.player[2] - 0.27,
        0.54,
        0.54,
        1.7,
        'You',
        'player',
        'Your position in the 3D world.',
      ),
    );
  }
  private glyph(
    hit: Hit,
    p: Vec,
    _col: number,
    _row: number,
    night: boolean,
  ): [string, string] {
    const b = hit.box,
      n = hit.normal;
    let color = night ? '#a7b2a0' : '#41433e',
      glyph = '.';
    if (this.mode === 'depth') {
      const v = Math.max(30, Math.min(210, Math.round((hit.t - 35) * 2.4)));
      return ['#', `rgb(${v},${v},${v})`];
    }
    if (this.mode === 'normals')
      return [
        n[1] ? '_' : n[0] ? '|' : '/',
        n[1] ? '#63865a' : n[0] ? '#b36850' : '#557aa2',
      ];
    if (!b) {
      const x = Math.abs(p[0]),
        z = Math.abs(p[2]);
      const road =
        x < 2.4 || z < 2.4 || (x > 19 && x < 23) || (z > 19 && z < 23);
      if (road) {
        glyph = ' ';
        if (
          ((x < 0.12 || Math.abs(x - 21) < 0.12) && mod(p[2], 3) < 1.6) ||
          ((z < 0.12 || Math.abs(z - 21) < 0.12) && mod(p[0], 3) < 1.6)
        )
          glyph = '-';
        if ((x < 2.4 && z > 16 && z < 18) || (z < 2.4 && x > 16 && x < 18))
          glyph = mod(x < 2.4 ? p[0] : p[2], 0.8) < 0.38 ? '=' : ' ';
      } else if (x > 24 || z > 24) {
        glyph = mod(p[0] + p[2], 1) < 0.16 ? '.' : ' ';
        color = night ? '#53664e' : '#aeb69c';
      } else {
        glyph = mod(p[0], 1) < 0.09 || mod(p[2], 1) < 0.09 ? '+' : '.';
        color = night ? '#52614e' : '#b6baa7';
      }
      return [glyph, color];
    }
    if (b.kind === 'player') return [this.pov === 'second' ? (p[1] > 1.3 ? 'o' : '|') : ' ', night ? '#ffc66a' : '#b16b1e'];
    if (b.kind === 'person')
      return [p[1] > 1.1 ? 'o' : '|', night ? '#c2c7b4' : '#455c43'];
    if (b.kind === 'car')
      return [n[1] ? '=' : n[0] ? '|' : '/', night ? '#ced8be' : '#495b44'];
    if (b.kind === 'sign') return [' ', night ? '#e7b46d' : '#a15a35'];
    if (b.kind === 'awning')
      return [mod(p[0] * 2, 2) < 1 ? '/' : ' ', night ? '#9d8770' : '#8a7a66'];
    const brightness = Math.max(0, dot(n, [-0.5, 0.8, 0.32]));
    color = night
      ? '#7c8b75'
      : brightness > 0.6
        ? '#a1a094'
        : brightness > 0.15
          ? '#96978a'
          : '#777b70';
    if (n[1]) {
      const edge = Math.min(
        p[0] - b.min[0],
        b.max[0] - p[0],
        p[2] - b.min[2],
        b.max[2] - p[2],
      );
      glyph =
        edge < 0.12
          ? '_'
          : mod(Math.floor(p[0] * 2) + Math.floor(p[2] * 2), 4) === 0
            ? '-'
            : '.';
      color = night ? '#566650' : '#b8b6a8';
      if (b.kind === 'roof') glyph = n[1] ? '=' : '|';
    } else {
      const u = n[0] ? p[2] - b.min[2] : p[0] - b.min[0];
      const width = n[0] ? b.max[2] - b.min[2] : b.max[0] - b.min[0];
      const windowStart = Math.floor((u - 0.8) / 2) * 2 + 0.8,
        floorY = Math.floor(p[1] / 2.7) * 2.7;
      const window =
        windowStart >= 0.79 &&
        windowStart < width - 1.2 &&
        u - windowStart < 1.1 &&
        floorY >= 2.69 &&
        floorY < b.max[1] - 1 &&
        p[1] - floorY < 1.35;
      const edge =
        Math.min(u, (n[0] ? b.max[2] - b.min[2] : b.max[0] - b.min[0]) - u) <
        0.2;
      if (edge) glyph = '|';
      else if (p[1] < 0.2 || b.max[1] - p[1] < 0.15) glyph = '_';
      else if (window) {
        glyph = ' ';
        if (night && mod(Math.floor(u / 2) + Math.floor(p[1] / 2.7), 3) !== 0) {
          color = '#d6a355';
          glyph = '#';
        }
      } else
        glyph =
          mod(Math.floor(u * 3) + Math.floor(p[1] * 3), 3) === 0 ? '.' : ' ';
    }
    if (b.name === this.selectedName) color = night ? '#e1b870' : '#9b642d';
    return [glyph, color];
  }

  private stamp(
    c: number,
    r: number,
    glyph: string,
    color: string,
    priority = 1,
  ) {
    if (c < 0 || r < 0 || c >= this.columns || r >= this.rows) return;
    const i = r * this.columns + c;
    if (priority < this.priorities[i]) return;
    this.glyphs[i] = glyph;
    this.colors[i] = color;
    this.priorities[i] = priority;
  }
  private render() {
    this.camera();
    const anchor = this.project([0, 0, 0]);
    this.gridX = mod(anchor[0], this.cw) - this.cw;
    this.gridY = mod(anchor[1], this.ch) - this.ch;
    if (this.perspective) { this.gridX = 0; this.gridY = 0; }
    this.buildRowBounds();
    this.depths.fill(Infinity);
    this.priorities.fill(0);
    this.glyphs.fill(' ');
    const ctx = this.ctx,
      night = this.clock > 1080 || this.clock < 360;
    this.canvas.dataset.night = String(night);
    ctx.fillStyle = night ? '#18221d' : '#faf9f5';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.font = '9px "Courier New",monospace';
    ctx.textBaseline = 'top';
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < this.columns; col++) {
        const o = this.ray(
            this.gridX + (col + 0.5) * this.cw,
            this.gridY + (row + 0.5) * this.ch,
          ),
          d = this.rayDirection(this.gridX + (col + 0.5) * this.cw, this.gridY + (row + 0.5) * this.ch),
          hit = this.trace(o, col, row, d);
        if (!hit) continue;
        this.depths[row * this.columns + col] = hit.t;
        const p: Vec = [
          o[0] + d[0] * hit.t,
          o[1] + d[1] * hit.t,
          o[2] + d[2] * hit.t,
        ];
        const [g, color] = this.glyph(hit, p, col, row, night);
        if (g !== ' ') this.stamp(col, row, g, color);
      }
    if (this.mode === 'ink') this.drawDetails(night);
    // Draw each cell once. Overlapping line samples no longer build X-shaped ink blobs.
    const x = Math.round(this.gridX * this.dpr) / this.dpr,
      y = Math.round(this.gridY * this.dpr) / this.dpr;
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < this.columns; col++) {
        const i = row * this.columns + col;
        if (this.glyphs[i] === ' ') continue;
        ctx.fillStyle = this.colors[i];
        ctx.fillText(this.glyphs[i], x + col * this.cw, y + row * this.ch);
      }
    if (this.mode === 'ink' && this.perspective) this.drawShopSigns(night);
    this.drawPlayer(night);
    this.drawMap(night);
  }
  private project(p: Vec): [number, number, number] {
    const v: Vec = [
        p[0] - this.center[0],
        p[1] - this.center[1],
        p[2] - this.center[2],
      ],
      scale = this.perspective ? this.focalLength() / Math.max(0.08, dot(v, this.direction)) : this.viewScale();
    return [
      this.width / 2 + dot(v, this.right) * scale,
      this.viewCenterY() - dot(v, this.up) * scale,
      dot(v, this.direction),
    ];
  }
  private line(a: Vec, b: Vec, color: string) {
    if (this.perspective) {
      const az = this.project(a)[2], bz = this.project(b)[2];
      if (az < 0.08 && bz < 0.08) return;
      if (az < 0.08) a = a.map((v, i) => v + (b[i] - v) * ((0.08 - az) / (bz - az))) as Vec;
      else if (bz < 0.08) b = b.map((v, i) => v + (a[i] - v) * ((0.08 - bz) / (az - bz))) as Vec;
    }
    const p = this.project(a),
      q = this.project(b),
      dx = q[0] - p[0],
      dy = q[1] - p[1],
      steps = Math.min(4000, Math.ceil(
        Math.max(Math.abs(dx) / this.cw, Math.abs(dy) / this.ch) * 1.3,
      ));
    const glyph =
      Math.abs(dy) < Math.abs(dx) * 0.4
        ? '_'
        : Math.abs(dx) < Math.abs(dy) * 0.3
          ? '|'
          : dx * dy > 0
            ? '\\'
            : '/';
    this.ctx.fillStyle = color;
    for (let i = 0; i <= steps; i++) {
      const f = steps ? i / steps : 0,
        c = Math.floor((p[0] + dx * f - this.gridX) / this.cw),
        r = Math.floor((p[1] + dy * f - this.gridY) / this.ch),
        t = this.perspective ? 1 / ((1 - f) / p[2] + f / q[2]) : p[2] + (q[2] - p[2]) * f;
      if (c < 0 || r < 0 || c >= this.columns || r >= this.rows) continue;
      if (t <= this.depths[r * this.columns + c] + 0.65)
        this.stamp(c, r, glyph, color, 3);
    }
  }
  private outline(b: Box, color: string) {
    const [x, y, z] = b.min,
      [X, Y, Z] = b.max;
    for (const h of [y, Y]) {
      this.line([x, h, z], [X, h, z], color);
      this.line([X, h, z], [X, h, Z], color);
      this.line([X, h, Z], [x, h, Z], color);
      this.line([x, h, Z], [x, h, z], color);
    }
    for (const a of [x, X])
      for (const c of [z, Z]) this.line([a, y, c], [a, Y, c], color);
  }
  private label(text: string, at: Vec, color: string, vertical = false) {
    const p = this.project(at);
    if (this.perspective && p[2] < 0.08) return;
    this.ctx.fillStyle = color;
    for (let i = 0; i < text.length; i++) {
      const c = Math.floor((p[0] - this.gridX) / this.cw) + (vertical ? 0 : i),
        r = Math.floor((p[1] - this.gridY) / this.ch) + (vertical ? i : 0);
      if (
        c >= 0 &&
        r >= 0 &&
        c < this.columns &&
        r < this.rows &&
        p[2] < this.depths[r * this.columns + c] + 1.1
      )
        this.stamp(c, r, text[i], color, 5);
    }
  }
  private drawShopSigns(night: boolean) {
    const ctx = this.ctx;
    for (const b of this.objects) {
      if (b.kind !== 'sign') continue;
      const top = this.project([(b.min[0] + b.max[0]) / 2, b.max[1] - 0.2, b.max[2] + 0.06]);
      const bottom = this.project([(b.min[0] + b.max[0]) / 2, b.min[1] + 0.15, b.max[2] + 0.06]);
      if (top[2] < 0.08 || bottom[2] < 0.08) continue;
      const size = Math.max(12, Math.min(30, Math.abs(bottom[1] - top[1]) / b.name.length * 0.85));
      ctx.save();
      ctx.font = 'bold ' + size + 'px "Courier New", monospace';
      ctx.textBaseline = 'top';
      ctx.fillStyle = night ? '#ffd18a' : '#88421f';
      for (let i = 0; i < b.name.length; i++) {
        const f = i / b.name.length;
        const p = this.project([(b.min[0] + b.max[0]) / 2,
          b.max[1] - 0.2 - f * (b.max[1] - b.min[1] - 0.35), b.max[2] + 0.06]);
        const x = p[0] - size * 0.3, y = top[1] + i * Math.max(size * 1.12, (bottom[1] - top[1]) / b.name.length);
        ctx.save();
        ctx.beginPath();
        // Clip individual glyph cells against world depth, including partial occlusion.
        for (let r = Math.max(0, Math.floor(y / this.ch)); r <= Math.min(this.rows - 1, Math.floor((y + size) / this.ch)); r++)
          for (let c = Math.max(0, Math.floor(x / this.cw)); c <= Math.min(this.columns - 1, Math.floor((x + size * 0.65) / this.cw)); c++)
            if (p[2] <= this.depths[r * this.columns + c] + 0.2)
              ctx.rect(c * this.cw, r * this.ch, this.cw, this.ch);
        ctx.clip();
        ctx.fillText(b.name[i], x, y);
        ctx.restore();
      }
      ctx.restore();
    }
  }
  private drawDetails(night: boolean) {
    const ink = night ? '#bfbdad' : '#282824',
      faint = night ? '#647166' : '#929286';
    for (const b of this.objects) {
      if (b.kind === 'person' || b.kind === 'player') continue;
      this.outline(b, ink);
      if (b.kind === 'sign') {
        if (this.perspective) continue;
        this.label(
          b.name,
          [b.min[0] + 0.25, b.max[1] - 0.45, b.max[2] + 0.05],
          night ? '#e7b46d' : '#8a4b2d',
          true,
        );
        continue;
      }
      if (b.kind === 'awning') {
        for (let x = b.min[0]; x < b.max[0]; x += 0.45)
          this.line([x, b.max[1], b.min[2]], [x, b.max[1], b.max[2]], faint);
        continue;
      }
      if (b.kind === 'car') {
        const [x, , z] = b.min,
          [X, H, Z] = b.max;
        const cabin: Box = {
          ...b,
          min: [x + 0.35, H, z + 0.35],
          max: [X - 0.35, H + 0.5, Z - 0.35],
        };
        this.outline(cabin, ink);
        const alongX = X - x > Z - z;
        for (const a of [0.5, (alongX ? X - x : Z - z) - 0.5]) {
          this.label(
            'o',
            alongX ? [x + a, 0.25, Z + 0.1] : [X + 0.1, 0.25, z + a],
            ink,
          );
        }
        if (b.name === 'Bus 16') {
          for (let u = 0.5; u < (alongX ? X - x : Z - z) - 0.5; u += 0.65)
            this.label(
              '[]',
              alongX ? [x + u, 1.25, Z + 0.04] : [X + 0.04, 1.25, z + u],
              ink,
            );
          this.label('16', [x + 0.3, H + 0.55, z + 0.3], ink);
        }
        continue;
      }
      if (b.kind !== 'building') continue;
      const [x, , z] = b.min,
        [X, h, Z] = b.max;
      // Window frames on all four façades, tested against the ray depth buffer.
      for (const side of [0, 1, 2, 3]) {
        const normal: Vec =
          side === 0
            ? [0, 0, -1]
            : side === 1
              ? [0, 0, 1]
              : side === 2
                ? [-1, 0, 0]
                : [1, 0, 0];
        if (dot(normal, this.direction) >= 0) continue;
        const alongX = side < 2,
          lo = alongX ? x : z,
          hi = alongX ? X : Z,
          plane = side === 0 ? z : side === 1 ? Z : side === 2 ? x : X;
        const pt = (u: number, y: number): Vec =>
          alongX ? [u, y, plane] : [plane, y, u];
        for (let y = 2.7; y < h - 1; y += 2.7)
          for (let u = lo + 0.8; u < hi - 1.2; u += 2) {
            const a = pt(u, y),
              b1 = pt(u + 1.1, y),
              c = pt(u + 1.1, y + 1.35),
              d = pt(u, y + 1.35);
            this.line(a, b1, ink);
            this.line(b1, c, ink);
            this.line(c, d, ink);
            this.line(d, a, ink);
            if (b.name.includes('Hotel') || b.name.includes('Maple'))
              this.line(pt(u + 0.55, y), pt(u + 0.55, y + 1.35), faint);
          }

        this.line(pt(lo, 2.2), pt(hi, 2.2), ink);
        // Ground-floor glazed shopfronts and doors.
        for (let u = lo + 0.6; u < hi - 0.7; u += 1.4) {
          this.line(pt(u, 0.15), pt(u, 1.9), ink);
          this.line(pt(u, 0.15), pt(Math.min(u + 1.2, hi), 0.15), ink);
        }
      }
      // Roof rails and a small aerial.
      if (b.name.includes('Radio') || b.name.includes('Hotel')) {
        this.line([x + 0.5, h, z + 0.5], [x + 0.5, h + 2.2, z + 0.5], ink);
        this.line(
          [x - 0.2, h + 1.7, z + 0.5],
          [x + 1.2, h + 1.7, z + 0.5],
          ink,
        );
      }
      if (b.name.includes('Maple')) this.waterTank(x + 3, h, z + 5, ink);
      if (b.name.includes('Hotel')) this.fireEscape(b, ink);
      if (b.name.includes('Reading')) {
        for (let i = 0; i < 3; i++)
          this.outline(
            {
              min: [x + 1 + i * 3, h, z + 1],
              max: [x + 2.5 + i * 3, h + 0.4, z + 3],
              name: 'Skylight',
              kind: 'roof',
            },
            faint,
          );
      }
    }
    // Paved sidewalk edges, curb joints and crossing stripes.
    for (const a of [-19, -17, -2.7, 2.7, 17, 19]) {
      this.line([a, 0.02, -24], [a, 0.02, 24], faint);
      this.line([-24, 0.02, a], [24, 0.02, a], faint);
    }
    for (let a = -24; a < 24; a += 1.1)
      for (const b of [-18, 18]) {
        this.line([a, 0.03, b - 0.8], [a, 0.03, b + 0.8], faint);
        this.line([b - 0.8, 0.03, a], [b + 0.8, 0.03, a], faint);
      }
    for (const x of [-18, 18])
      for (const z of [-18, -1, 18]) {
        this.line([x, 0, z], [x, 3.7, z], ink);
        this.line([x, 3.7, z], [x + 0.7, 3.7, z], ink);
        this.label('*', [x + 0.7, 3.7, z], night ? '#e3b864' : ink);
      }

    // Little garden in the gap behind the record shop.
    for (const [x, z] of [
      [-6, 14],
      [-13, -1],
      [2, 15],
      [18, -12],
    ]) {
      this.line([x, 0, z], [x, 2.5, z], ink);
      for (let i = 0; i < 320; i++) {
        const a = i * 2.39996,
          r = Math.sqrt((i + 0.5) / 320) * 1.4;
        this.label(
          i % 3 === 0 ? '&' : i % 3 === 1 ? '*' : '#',
          [
            x + Math.cos(a) * r,
            2.9 + Math.sin(i * 1.9) * 0.95 * Math.sqrt(1 - (r / 1.45) ** 2),
            z + Math.sin(a) * r,
          ],
          night ? ['#56985d', '#71b578', '#448550'][i % 3] : ['#337b3e', '#47944a', '#286b38'][i % 3],
        );
      }
    }
    for (const [x, z] of [
      [-6, 12.5],
      [2, 12],
      [-17, 1],
    ]) {
      this.outline(
        {
          min: [x, 0.5, z],
          max: [x + 1.7, 0.7, z + 0.5],
          name: 'Bench',
          kind: 'detail',
        },
        ink,
      );
      this.line([x, 0.7, z], [x, 1.25, z], ink);
      this.line([x, 1.25, z], [x + 1.7, 1.25, z], ink);
    }
    // Zebra crossings at the two ends of each street.
    for (const edge of [-17, 17])
      for (let u = -1.8; u < 2; u += 0.65) {
        this.line([u, 0.06, edge - 0.5], [u, 0.06, edge + 0.5], ink);
        this.line([edge - 0.5, 0.06, u], [edge + 0.5, 0.06, u], ink);
      }
    for (const x of [-2.9, 2.9])
      for (const z of [-16.7, 16.7]) {
        this.line([x, 0, z], [x, 0.7, z], ink);
        this.label('o', [x, 0.7, z], ink);
      }
    if (this.path.length) {
      const dest = this.path[this.path.length - 1];
      this.label('+', [dest[0], 0.1, dest[2]], '#bb642c');
    }
  }
  private drawPlayer(night: boolean) {
    if (this.perspective) return;
    const p = this.project([this.player[0], 1.2, this.player[2]]),
      ink = night ? '#ffc16f' : '#b35325';
    const ctx = this.ctx;
    ctx.font = 'bold 17px "Courier New",monospace';
    ctx.fillStyle = night ? '#18221de8' : '#faf9f5e8';
    ctx.fillRect(p[0] - 7, p[1] - 5, 16, 21);
    ctx.fillStyle = ink;
    ctx.fillText('@', Math.round(p[0] - 5), Math.round(p[1] - 4));
    ctx.font = '10px "Courier New",monospace';
    ctx.fillText('YOU', Math.round(p[0] - 8), Math.round(p[1] - 17));
  }
  attachMap(canvas: HTMLCanvasElement) {
    this.mapCanvas = canvas;
  }
  private drawMap(night: boolean) {
    const ctx = this.mapCanvas?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 136, 136);
    ctx.fillStyle = night ? '#8b9988' : '#d0cec3';
    for (const b of this.fixed)
      ctx.fillRect(
        68 + b.min[0] * 2.4,
        68 + b.min[2] * 2.4,
        (b.max[0] - b.min[0]) * 2.4,
        (b.max[2] - b.min[2]) * 2.4,
      );
    ctx.strokeStyle = night ? '#c79d5c' : '#b35325';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(68 + this.player[0] * 2.4, 68 + this.player[2] * 2.4);
    for (const p of this.path) ctx.lineTo(68 + p[0] * 2.4, 68 + p[2] * 2.4);
    ctx.stroke();
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = night ? '#ffc16f' : '#b35325';
    ctx.fillText('@', 64 + this.player[0] * 2.4, 72 + this.player[2] * 2.4);
    ctx.strokeStyle = night ? '#8b9988' : '#85867d';
    ctx.beginPath();
    const x = 68 + this.player[0] * 2.4,
      z = 68 + this.player[2] * 2.4;
    ctx.moveTo(x, z);
    ctx.lineTo(x - Math.sin(this.angle) * 12, z - Math.cos(this.angle) * 12);
    ctx.stroke();
  }
  private waterTank(x: number, h: number, z: number, ink: string) {
    const radius = 1.2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2,
        b = ((i + 1) / 16) * Math.PI * 2;
      for (const y of [h + 1, h + 3])
        this.line(
          [x + Math.cos(a) * radius, y, z + Math.sin(a) * radius],
          [x + Math.cos(b) * radius, y, z + Math.sin(b) * radius],
          ink,
        );
      if (i % 4 === 0) {
        this.line(
          [x + Math.cos(a) * radius, h, z + Math.sin(a) * radius],
          [x + Math.cos(a) * radius, h + 3, z + Math.sin(a) * radius],
          ink,
        );
        this.line(
          [x + Math.cos(a) * radius, h + 3, z + Math.sin(a) * radius],
          [x, h + 3.6, z],
          ink,
        );
      }
    }
  }
  private fireEscape(b: Box, ink: string) {
    const x = b.max[0] + 0.15,
      z = b.min[2] + 1;
    for (let h = 2.7; h < b.max[1] - 1; h += 2.7) {
      this.outline(
        {
          min: [x, h, z],
          max: [x + 0.9, h + 0.6, z + 2],
          name: 'Fire escape',
          kind: 'detail',
        },
        ink,
      );
      this.line([x + 0.6, h, z], [x + 0.6, h - 2.7, z + 2], ink);
      for (let i = 0; i < 7; i++) {
        const f = i / 7;
        this.line(
          [x + 0.1, h - f * 2.7, z + f * 2],
          [x + 0.9, h - f * 2.7, z + f * 2],
          ink,
        );
      }
    }
  }
  private tick = (now: number) => {
    const dt = this.prev ? Math.min((now - this.prev) / 1000, 0.05) : 0;
    this.prev = now;
    this.simulate(dt);
    this.render();
    this.frames++;
    if (now - this.reportAt > 500) {
      const h = Math.floor(this.clock / 60),
        m = Math.floor(this.clock % 60);
      this.report({
        time: String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'),
        fps: Math.round((this.frames * 1000) / (now - this.reportAt)),
        cells: this.columns * this.rows,
        overview: this.overview,
        pov: this.pov,
        selected: this.selected,
      });
      this.frames = 0;
      this.reportAt = now;
    }
    this.frame = requestAnimationFrame(this.tick);
  };
  destroy() {
    this.canvas.removeEventListener('pointerdown', this.pointerdown);
    this.canvas.removeEventListener('pointermove', this.pointermove);
    this.canvas.removeEventListener('pointerup', this.pointerup);
    this.canvas.removeEventListener('pointercancel', this.pointerup);
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    window.removeEventListener('blur', this.blur);
    this.canvas.removeEventListener('wheel', this.wheel);
    this.canvas.removeEventListener('click', this.click);
  }
}
