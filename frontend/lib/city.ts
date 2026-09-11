import { detailGlyph, personModel, toWorld, vehicleModel } from './street-details';
import { DISTRICTS, RIVER, MAP_LIMIT, YARD, VISITOR_DISTRICT, hasGround, walkableGround, groundHeight, slatePosition, districtAt, districtDestination, generateWorld, roadDistance } from './city-world';
import type { VisitorSlate } from './visitor-types';
import { WalkingGrid } from './walking-grid';
import type { Finish, Frame } from './street-details';
import { GlyphAtlas } from './glyph-atlas';
import { inscriptionLines } from './slate-inscription';

export type Vec = [number, number, number];
export type Box = {
  min: Vec;
  max: Vec;
  name: string;
  kind: string;
  detail?: string;
  frame?: Frame;
  finish?: Finish;
  tint?: string;
  feature?: string;
};
export type Hit = { t: number; normal: Vec; box: Box | null };
type ScreenBound = { box: Box; left: number; right: number; near: number; index: number };
export type CityStats = {
  time: string;
  fps: number;
  cells: number;
  overview?: boolean;
  pov?: 'third' | 'second' | 'first';
  selected: string;
  district?: string;
  identity?: string;
  inVisitorYard?: boolean;
};
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mod = (n: number, m: number) => ((n % m) + m) % m;
export function intersectBox(o: Vec, d: Vec, b: Box): Hit | null {
  let ox = o[0], oy = o[1], oz = o[2], dx = d[0], dz = d[2];
  const dy = d[1];
  let c = 1, s = 0;
  if (b.frame) {
    c = b.frame.cos ?? Math.cos(b.frame.yaw);
    s = b.frame.sin ?? Math.sin(b.frame.yaw);
    const x = ox - b.frame.origin[0], z = oz - b.frame.origin[2];
    ox = c * x - s * z;
    oy -= b.frame.origin[1];
    oz = s * x + c * z;
    dx = c * d[0] - s * d[2];
    dz = s * d[0] + c * d[2];
  }
  // Wheels use capped elliptical cylinders along the model's X axis. Keeping
  // their box bounds lets the existing screen-space acceleration stay valid.
  if (b.feature === 'wheel') {
    const cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const ry = (b.max[1] - b.min[1]) / 2, rz = (b.max[2] - b.min[2]) / 2;
    const wy = (oy - cy) / ry, wz = (oz - cz) / rz;
    const vy = dy / ry, vz = dz / rz;
    const a = vy * vy + vz * vz, h = wy * vy + wz * vz;
    const disc = h * h - a * (wy * wy + wz * wz - 1);
    let best = Infinity;
    let wheelNormal: Vec = [0, 0, 0];
    if (a > 1e-12 && disc >= 0) {
      for (const t of [(-h - Math.sqrt(disc)) / a, (-h + Math.sqrt(disc)) / a]) {
        const x = ox + dx * t;
        if (t >= 0 && t < best && x >= b.min[0] && x <= b.max[0]) {
          best = t;
          const ny = (oy + t * dy - cy) / (ry * ry);
          const nz = (oz + t * dz - cz) / (rz * rz);
          const len = Math.hypot(ny, nz);
          wheelNormal = [0, ny / len, nz / len];
        }
      }
    }
    if (Math.abs(dx) > 1e-9) for (const side of [-1, 1]) {
      const t = ((side < 0 ? b.min[0] : b.max[0]) - ox) / dx;
      if (t >= 0 && t < best && (wy + t * vy) ** 2 + (wz + t * vz) ** 2 <= 1) {
        best = t;
        wheelNormal = [side, 0, 0];
      }
    }
    return Number.isFinite(best) ? { t: best, box: b,
      normal: [c * wheelNormal[0] + s * wheelNormal[2], wheelNormal[1], -s * wheelNormal[0] + c * wheelNormal[2]] } : null;
  }
  let near = -Infinity,
    far = Infinity;
  let nearAxis = 0, farAxis = 0, nearSign = 0, farSign = 0;
  for (let a = 0; a < 3; a++) {
    const origin = a === 0 ? ox : a === 1 ? oy : oz;
    const direction = a === 0 ? dx : a === 1 ? dy : dz;
    if (Math.abs(direction) < 1e-9) {
      if (origin < b.min[a] || origin > b.max[a]) return null;
      continue;
    }
    let t1 = (b.min[a] - origin) / direction,
      t2 = (b.max[a] - origin) / direction,
      sign = -1;
    if (t1 > t2) {
      const tmp = t1; t1 = t2; t2 = tmp;
      sign = 1;
    }
    if (t1 > near) {
      near = t1;
      nearAxis = a; nearSign = sign;
    }
    if (t2 < far) {
      far = t2;
      farAxis = a; farSign = -sign;
    }
    if (near > far) return null;
  }
  if (far < 0) return null;
  const axis = near >= 0 ? nearAxis : farAxis;
  const sign = near >= 0 ? nearSign : farSign;
  return {
    t: near >= 0 ? near : far,
    normal: axis === 0 ? [c * sign || 0, 0, -s * sign || 0] : axis === 1 ? [0, sign, 0] : [s * sign || 0, 0, c * sign || 0],
    box: b,
  };
}
export function canWalk(x: number, z: number, boxes: Box[]) {
  return (
    walkableGround(x, z) &&
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
function mapleBuildings(): Box[] {
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
let worldCache: ReturnType<typeof generateWorld> | undefined;
export function cityWorld() { return worldCache ??= generateWorld(mapleBuildings()); }
export function buildings(): Box[] { return cityWorld().colliders; }

export class City {
  pov: 'third' | 'second' | 'first' = 'third';
  private lookPitch = 0.04;
  private fov = 72;
  private followPitch = 0.24;
  private followDistance = 5.5;
  private get perspective() { return this.pov === 'first' || this.pov === 'second'; }
  setPOV(pov: 'third' | 'second' | 'first') {
    this.pov = pov;
    if (this.overview) this.span = 45;
    this.overview = false;
    this.path = [];
    this.focus = [...this.player];
    this.keys.clear();
    this.reportAt = 0;
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
  private gait = 0;
  private walkingGrid: WalkingGrid | undefined;
  private visibleObjects = new Set<Box>();
  private detailedBuildings = new Set<Box>();
  private fixed = buildings();
  private objects: Box[] = [];
  private selected = 'Click a building to inspect it.';
  private selectedName = '';
  private visitorSlates: VisitorSlate[] = [];
  private slateBoxes: Box[] = [];
  onVisitorSelect?: (slate: VisitorSlate | null) => void;
  setVisitorSlates(slates: VisitorSlate[]) {
    this.visitorSlates = slates;
    this.slateBoxes = slates.map(slate => {
      const [x, , z] = slatePosition(slate.slot);
      return { min: [x - 1.55, .08, z - .95], max: [x + 1.55, .2, z + .95],
        name: slate.name, kind: 'visitor-slate', feature: slate.id, detail: `Visited ${new Date(slate.createdAt).toLocaleDateString()}` };
    });
  }
  focusVisitor(slate: VisitorSlate) {
    const [x, , z] = slatePosition(slate.slot);
    this.selectedName = slate.name;
    this.selected = `${slate.name} · Visited ${new Date(slate.createdAt).toLocaleDateString()}`;
    this.walkTo(x, z + 1.4);
    this.overview = false;
    this.span = 45;
    this.reportAt = 0;
  }
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
  private atlas: GlyphAtlas | undefined;
  private projectionScale = 1;
  private projectionCenterY = 0;
  private lastPointerUpMoved = false;
  private mapCanvas: HTMLCanvasElement | null = null;
  private rowBounds: ScreenBound[][] = [];
  private rayBins: ScreenBound[][] = [];
  private binColumns = 0;

  overview = false;
  setOverview() {
    this.pov = 'third';
    this.overview = !this.overview;
    this.span = this.overview ? 250 : 45;
    this.reportAt = 0;
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
      if (this.pov === 'second')
        this.followPitch = Math.max(0.12, Math.min(0.85, this.followPitch + dy * 0.004));
      else
        this.lookPitch = Math.max(-0.65, Math.min(1.35, this.lookPitch + dy * 0.004));
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
    if (!this.walkingGrid || this.walkingGrid.boxes !== this.fixed)
      this.walkingGrid = new WalkingGrid(this.fixed);
    const route = this.walkingGrid.route(this.player, x, z);
    if (route === null) return false;
    this.path = route;
    return true;
  }
  visitDistrict(id: string) {
    const district = [...DISTRICTS, VISITOR_DISTRICT].find(d => d.id === id);
    if (!district) return false;
    const target = districtDestination(district);
    const started = this.walkTo(target[0], target[2]);
    this.selected = started
      ? this.path.length
        ? `Walking to ${district.name} · ${district.identity}. WASD takes over at any time.`
        : `At the entrance to ${district.name} · ${district.identity}.`
      : 'No clear route from here. Move onto the sidewalk and try again.';
    this.reportAt = 0;
    return started;
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
    this.atlas = undefined;
  }
  rotate(n: number) {
    this.angle -= (n * Math.PI) / 8;
  }
  zoomBy(n: number) {
    if (this.pov === 'second') {
      this.followDistance = Math.max(2.5, Math.min(9, (this.followDistance ?? 5.5) * n));
      return;
    }
    if (this.perspective) {
      this.fov = Math.max(45, Math.min(100, this.fov * n));
      return;
    }
    this.span = Math.max(28, Math.min(240, this.span * n));
  }
  reset() {
    this.player = [0, 0, 18];
    this.angle = (28 * Math.PI) / 180;
    this.span = 45;
    this.overview = false;
    this.path = [];
    this.focus = [0, 0, 15];
    this.restoreLens();
    this.keys.clear();
  }
  recenter() {
    this.focus = [...this.player];
    this.span = 45;
    this.overview = false;
    this.restoreLens();
  }
  private restoreLens() {
    this.lookPitch = 0.04;
    this.fov = 72;
    this.followPitch = 0.24;
    this.followDistance = 5.5;
    this.reportAt = 0;
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
    this.projectionScale = this.perspective ? this.focalLength() : this.viewScale();
    this.projectionCenterY = this.viewCenterY();
    if (this.perspective) {
      const yaw = this.angle;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const e = this.pov === 'second' ? (this.followPitch ?? 0.24) : this.lookPitch;
      this.right = [c, 0, -s];
      this.up = [-s * Math.sin(e), Math.cos(e), -c * Math.sin(e)];
      this.direction = [-s * Math.cos(e), -Math.sin(e), -c * Math.cos(e)];
      this.center = [this.player[0], this.player[1] + 1.65, this.player[2]];
      if (this.pov === 'second') {
        // A raised boom behind the player looks along their heading. Both
        // movement and camera therefore use the same forward/right basis.
        this.center = [this.player[0], this.player[1] + 1.1, this.player[2]];
        const behind: Vec = this.direction.map(v => -v) as Vec;
        let distance = this.followDistance ?? 5.5;
        for (const b of this.fixed) {
          const padded: Box = { ...b,
            min: b.min.map(v => v - 0.18) as Vec,
            max: b.max.map(v => v + 0.18) as Vec };
          const hit = intersectBox(this.center, behind, padded);
          if (hit) distance = Math.min(distance, Math.max(0.12, hit.t - 0.08));
        }
        this.center = this.center.map((v, i) => v + behind[i] * distance) as Vec;
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
      (this.overview ? 0 : this.focus[0]) - this.direction[0] * 180,
      2 - this.direction[1] * 180,
      (this.overview ? 14 : this.focus[2]) - this.direction[2] * 180,
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
    if (this.pov === 'second') return this.height * (this.width < 700 ? 0.52 : 0.58);
    if (this.perspective || this.overview) return this.height / 2;
    return this.height * (this.width < 700 ? 0.51 : 0.6);
  }
  private ray(px: number, py: number): Vec {
    if (this.perspective) return this.center;
    const scale = 1 / this.projectionScale;
    const u = (px - this.width / 2) * scale,
      v = (this.projectionCenterY - py) * scale;
    return [
      this.center[0] + this.right[0] * u + this.up[0] * v,
      this.center[1] + this.up[1] * v,
      this.center[2] + this.right[2] * u + this.up[2] * v,
    ];
  }

  private focalLength() { return Math.max(this.width, this.height * 0.75) / (2 * Math.tan((this.fov ?? 72) * Math.PI / 360)); }
  private rayDirection(px: number, py: number): Vec {
    if (!this.perspective) return this.direction;
    const u = (px - this.width / 2) / this.projectionScale;
    const v = (this.projectionCenterY - py) / this.projectionScale;
    return [this.direction[0] + this.right[0] * u + this.up[0] * v,
      this.direction[1] + this.right[1] * u + this.up[1] * v,
      this.direction[2] + this.right[2] * u + this.up[2] * v];
  }
  private buildRowBounds() {
    this.rowBounds = Array.from({ length: this.rows }, () => []);
    this.binColumns = Math.ceil(this.columns / 16);
    this.rayBins = Array.from({ length: this.rows * this.binColumns }, () => []);
    this.visibleObjects ??= new Set<Box>();
    this.visibleObjects.clear();
    for (let index = 0; index < this.objects.length; index++) {
      const box = this.objects[index];
      if (this.hiddenFromCamera(box)) continue;
      // A conservative sphere rejects off-screen models before allocating and
      // projecting eight corners. Near-plane clipping below remains exact.
      const middle = toWorld([(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2,
        (box.min[2] + box.max[2]) / 2], box.frame);
      const radius = Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) / 2;
      const cx = middle[0] - this.center[0], cy = middle[1] - this.center[1], cz = middle[2] - this.center[2];
      const depth = cx * this.direction[0] + cy * this.direction[1] + cz * this.direction[2];
      const horizontal = cx * this.right[0] + cz * this.right[2];
      const vertical = cx * this.up[0] + cy * this.up[1] + cz * this.up[2];
      const sx = (this.width / 2 + this.cw * 2) / this.projectionScale;
      const top = (this.projectionCenterY + this.ch * 2) / this.projectionScale;
      const bottom = (this.height - this.projectionCenterY + this.ch * 2) / this.projectionScale;
      if (this.perspective) {
        if (depth + radius < .08 || Math.abs(horizontal) - depth * sx > radius * Math.hypot(1, sx) ||
          vertical - depth * top > radius * Math.hypot(1, top) ||
          -vertical - depth * bottom > radius * Math.hypot(1, bottom)) continue;
      } else if (Math.abs(horizontal) > sx + radius || vertical > top + radius || -vertical > bottom + radius) continue;
      const corners: Vec[] = [];
      for (const x of [box.min[0], box.max[0]])
        for (const y of [box.min[1], box.max[1]])
          for (const z of [box.min[2], box.max[2]])
            corners.push(toWorld([x, y, z], box.frame));
      const projected = corners.map(p => this.project(p));
      const points = projected.filter(p => !this.perspective || p[2] >= 0.08);
      if (this.perspective) {
        // Clip all twelve bounding-box edges to the near plane. A box crossing
        // that plane need not occupy the entire screen (especially at your feet).
        for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) {
          const j = i ^ bit;
          if (j <= i || (projected[i][2] >= 0.08) === (projected[j][2] >= 0.08)) continue;
          const f = (0.08 - projected[i][2]) / (projected[j][2] - projected[i][2]);
          points.push(this.project(corners[i].map((v, axis) => v + (corners[j][axis] - v) * f) as Vec));
        }
      }
      if (!points.length) continue;
      let left = Infinity,
        right = -Infinity,
        screenTop = Infinity,
        screenBottom = -Infinity;
      for (const p of points) {
            left = Math.min(left, p[0]);
            right = Math.max(right, p[0]);
            screenTop = Math.min(screenTop, p[1]);
            screenBottom = Math.max(screenBottom, p[1]);
          }
      if (right < -this.cw || left > this.width + this.cw || screenBottom < -this.ch || screenTop > this.height + this.ch) continue;
      this.visibleObjects.add(box);
      const entry = {
        box,
        index,
        near: Math.max(0, Math.min(...projected.map(p => p[2]))),
        left: Math.floor((left - this.gridX) / this.cw) - 1,
        right: Math.ceil((right - this.gridX) / this.cw) + 1,
      };
      const a = Math.max(0, Math.floor((screenTop - this.gridY) / this.ch) - 1),
        b = Math.min(
          this.rows - 1,
          Math.ceil((screenBottom - this.gridY) / this.ch) + 1,
        );
      for (let row = a; row <= b; row++) this.rowBounds[row].push(entry);
    }
    for (let r = 0; r < this.rows; r++) {
      const row = this.rowBounds[r];
      row.sort((a, b) => a.near - b.near || a.index - b.index);
      for (const entry of row) {
        const left = Math.max(0, Math.floor(entry.left / 16));
        const right = Math.min(this.binColumns - 1, Math.floor(entry.right / 16));
        for (let b = left; b <= right; b++) this.rayBins[r * this.binColumns + b].push(entry);
      }
    }
  }
  private trace(o: Vec, col = -1, row = -1, d: Vec = this.direction): Hit | null {
    let nearest: Hit | null = null;
    let nearestIndex = -1;
    const t = -o[1] / d[1];
    if (t >= 0) {
      const x = o[0] + t * d[0],
        z = o[2] + t * d[2];
      if (hasGround(x, z))
        nearest = { t, normal: [0, 1, 0], box: null };
    }
    if (row >= 0) {
      for (const entry of this.rayBins[row * this.binColumns + Math.floor(col / 16)]) {
        if (nearest && entry.near > nearest.t + 1e-8) break;
        if (col < entry.left || col > entry.right) continue;
        const hit = intersectBox(o, d, entry.box);
        if (hit && (!nearest || hit.t < nearest.t || (hit.t === nearest.t && entry.index < nearestIndex))) {
          nearest = hit;
          nearestIndex = entry.index;
        }
      }
    } else {
      for (const b of this.objects) {
        if (this.hiddenFromCamera(b)) continue;
        const hit = intersectBox(o, d, b);
        if (hit && (!nearest || hit.t < nearest.t)) nearest = hit;
      }
    }
    return nearest;
  }

  private hiddenFromCamera(b: Box) {
    if (b.kind !== 'player') return false;
    // When a wall pushes the boom into the avatar, suppress the model instead
    // of letting the inside of the jacket fill the screen. It returns in space.
    if (this.pov === 'second')
      return Math.hypot(this.center[0] - this.player[0], this.center[2] - this.player[2]) < 0.75;
    // Hide only parts surrounding the eye; looking down still reveals your
    // jacket sleeves, hands, trousers and shoes in world space.
    return this.pov === 'first' &&
      !['shoe', 'trousers'].includes(b.finish || '') &&
      b.feature !== 'sleeve' && b.feature !== 'hand';
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
    if (hit.box?.kind === 'visitor-pedestal') this.onVisitorSelect?.(null);
    if (hit.box?.kind === 'visitor-slate') {
      const slate = this.visitorSlates?.find(s => s.id === hit.box?.feature);
      if (slate) this.onVisitorSelect?.(slate);
    }
    if (hit.box && ['bridge', 'slate-empty'].includes(hit.box.kind)) {
      this.walkTo(o[0] + hit.t * d[0], o[2] + hit.t * d[2]);
      return;
    }
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
    const beforeX = this.player[0], beforeZ = this.player[2];
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
      (Number(this.keys.has('q')) - Number(this.keys.has('e'))) * dt * 1.2;
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
    this.player[1] = groundHeight(this.player[0], this.player[2]);
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
    this.objects = [];
    this.detailedBuildings ??= new Set<Box>();
    this.detailedBuildings.clear();
    const near = (x: number, z: number, radius: number) =>
      !this.overview && (x - this.player[0]) ** 2 + (z - this.player[2]) ** 2 < radius * radius;
    for (const scene of cityWorld().blocks) {
      // Large forms stay visible across the entire city, including distant skylines.
      this.objects.push(...scene.coarse);
      for (const b of scene.coarse)
        if (b.kind === 'building' && near((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2, 36))
          this.detailedBuildings.add(b);
      for (const group of scene.details)
        if (near(group.x, group.z, 32)) this.objects.push(...group.boxes);
      const district = scene.district;
      const index = DISTRICTS.indexOf(district);
      // Each perimeter uses the inner lane of shared roads. Neighboring loops
      // therefore travel in the opposite lane, instead of through each other.
      for (let i = 0; i < 3; i++) {
        const t = this.elapsed * 3 + i * (20.2 * 8 / 3) + index * 7;
        const [rx, rz] = this.route(t, 20.2), [nx, nz] = this.route(t + .01, 20.2);
        const x = district.x + rx, z = district.z + rz;
        const yaw = Math.atan2(-(nx - rx), -(nz - rz)), bus = i === 0 && index % 2 === 0;
        if (near(x, z, 28)) this.objects.push(...vehicleModel(x, z, yaw, bus, i + index));
        else {
          const frame = { origin: [x, 0, z] as Vec, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw) };
          this.objects.push({ min: [-.65, .25, bus ? -2.5 : -1.35], max: [.65, bus ? 2 : 1.2, bus ? 2.5 : 1.35],
            frame, name: bus ? 'City bus' : 'Car', kind: 'car', finish: 'paint', tint: bus ? '#9c936d' : '#77897d' });
        }
      }
      const count = district.id === 'market' ? 12 : district.id === 'park' ? 10 : 6;
      for (let i = 0; i < count; i++) {
        const t = this.elapsed * .8 + i * (18 * 8 / count) + index * 3;
        const [rx, rz] = this.route(t, 18), [nx, nz] = this.route(t + .01, 18);
        const x = district.x + rx, z = district.z + rz;
        if (near(x, z, 26)) this.objects.push(...personModel(x, z, Math.atan2(-(nx - rx), -(nz - rz)), this.elapsed * 5 + i, .14, i + index));
        else if (!this.overview) this.objects.push({ min: [x - .17, 0, z - .17], max: [x + .17, 1.7, z + .17], name: 'Pedestrian', kind: 'person' });
      }
    }
    const walked = Math.hypot(this.player[0] - beforeX, this.player[2] - beforeZ);
    this.gait = (this.gait ?? 0) + walked * 6;
    this.objects.push(...(this.slateBoxes ?? []));
    const avatar = personModel(this.player[0], this.player[2], this.angle, this.gait, walked > 0.0001 ? 0.2 : 0, 0, true);
    const frames = new Set(avatar.map(b => b.frame).filter(Boolean));
    for (const frame of frames) if (frame) frame.origin[1] = this.player[1];
    this.objects.push(...avatar);
  }
  private glyph(
    hit: Hit,
    p: Vec,
    _col: number,
    _row: number,
  ): [string, string] {
    const b = hit.box,
      n = hit.normal;
    let color = '#a7b2a0',
      glyph = '.';
    if (this.mode === 'depth') {
      const v = Math.max(30, Math.min(210, Math.round(this.perspective ? hit.t * 4 : (hit.t - 110) * 1.4)));
      return ['#', `rgb(${v},${v},${v})`];
    }
    if (this.mode === 'normals')
      return [
        n[1] ? '_' : n[0] ? '|' : '/',
        n[1] ? '#63865a' : n[0] ? '#b36850' : '#557aa2',
      ];
    if (!b) {
      if (p[2] >= YARD.north) {
        const path = Math.abs(p[0]) < 3 || Math.abs(mod(p[2] - 81, 4)) < .6;
        return [path ? '.' : "'", '#596f62'];
      }
      const rx = roadDistance(p[0]), rz = roadDistance(p[2]);
      if (rx < 2.4 || rz < 2.4) {
        glyph = ' ';
        if ((rx < .12 && rz > 3 && mod(p[2], 3) < 1.6) ||
            (rz < .12 && rx > 3 && mod(p[0], 3) < 1.6)) glyph = '-';
        if ((rx < 2.4 && rz > 3 && rz < 4.5) || (rz < 2.4 && rx > 3 && rx < 4.5))
          glyph = mod(rx < 2.4 ? p[0] : p[2], .8) < .38 ? '=' : ' ';
        return [glyph, '#697567'];
      }
      const district = districtAt(p[0], p[2]);
      const x = p[0] - district.x, z = p[2] - district.z;
      const garden = district.id === 'park' || district.id === 'garden';
      if (garden && rx > 4 && rz > 4 && Math.abs(x - z) > 1.1 && Math.abs(x + z) > 1.1) {
        return [mod(p[0] * 3 + p[2] * 1.7, 1) < .26 ? "'" : '.', '#536d50'];
      }
      if (district.id === 'foundry' && rx > 4 && rz > 4)
        return [mod(Math.floor(p[0] * 3) + Math.floor(p[2] * 2), 4) === 0 ? ':' : '.', '#75694b'];
      glyph = mod(p[0], 1) < .09 || mod(p[2], 1) < .09 ? '+' : '.';
      return [glyph, '#52614e'];
    }
    if (b.kind === 'foliage')
      return [['&', '*', '#'][mod(Math.floor(p[0] * 5 + p[1] * 3 + p[2] * 4), 3)], '#608c57'];
    if (b.kind === 'bridge') return [mod(p[2] * 2, 1) < .15 ? '=' : '-', '#b2ae8a'];
    if (b.kind === 'slate-empty') return ['.', '#52625a'];
    if (b.kind === 'visitor-slate' || b.kind === 'visitor-pedestal')
      return [n[1] ? '=' : ':', b.name === this.selectedName ? ('#efc780') : ('#9cbab5')];
    if (b.kind === 'river') {
      const wave = mod(p[0] * .85 - this.elapsed * 1.8 + Math.sin(p[2] * 1.7) * .65, 4);
      const lip = p[0] > RIVER.east - .7;
      return [lip ? '=' : wave < .65 ? '~' : wave < 1 ? '-' : '.',
        lip ? ('#c6eee6') : wave < 1 ? ('#80bfbe') : ('#3d747e')];
    }
    if (b.kind === 'waterfall') {
      // Positive time advances the streak pattern downwards in world space.
      const lane = Math.floor(p[2] * 3);
      const streak = mod(p[1] * 1.1 + this.elapsed * 8 + Math.sin(lane * 2.3) * 3, 6);
      const fade = (RIVER.surface - p[1]) / (RIVER.surface - RIVER.bottom);
      const broken = fade > .65 && mod(lane * 7 + Math.floor(p[1] * 3 + this.elapsed * 8), 9) < (fade - .65) * 20;
      return [broken ? ' ' : fade > .85 ? ':' : streak < 1.2 ? ':' : lane % 3 === 0 ? '|' : '!',
        fade > .8 ? ('#456969') : streak < 1.2 ? ('#d0efdf') : ('#75c3c9')];
    }
    if (b.kind === 'cliff') {
      const layer = mod(-p[1] + Math.sin(p[0] * .15 + p[2] * .12) * .35, 2.8);
      return [layer < .14 ? '-' : mod(p[0] * 1.9 + p[2] * 2.3 + p[1] * .7, 5) < .35 ? ':' : '.',
        '#384d48'];
    }
    if (b.kind === 'water')
      return [mod(p[0] * 2 + p[2] * 3, 2) < 1 ? '~' : '-', '#547e88'];
    if (b.kind === 'clock') return [p[1] > b.max[1] - 2.5 ? 'O' : '|', '#e8c16b'];
    if (b.feature === 'hazard')
      return [mod(p[0] * 2 + p[1] * 2, 2) < 1 ? '/' : '#', '#c7ac5f'];
    if (b.finish) return detailGlyph(b, p, n);
    if (b.kind === 'player') return [this.pov === 'second' ? (p[1] > 1.3 ? 'o' : '|') : ' ', '#ffc66a'];
    if (b.kind === 'person')
      return [p[1] > 1.1 ? 'o' : '|', '#c2c7b4'];
    if (b.kind === 'car')
      return [n[1] ? '=' : n[0] ? '|' : '/', '#ced8be'];
    if (b.kind === 'sign') return [' ', '#e7b46d'];
    if (b.kind === 'awning')
      return [mod(p[0] * 2, 2) < 1 ? '/' : ' ', '#9d8770'];
    color = '#7c8b75';
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
      color = '#566650';
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
        if (mod(Math.floor(u / 2) + Math.floor(p[1] / 2.7), 3) !== 0) {
          color = '#d6a355';
          glyph = '#';
        }
      } else
        glyph =
          mod(Math.floor(u * 3) + Math.floor(p[1] * 3), 3) === 0 ? '.' : ' ';
    }
    if (b.name === this.selectedName) color = '#e1b870';
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
    const ctx = this.ctx;
    ctx.fillStyle = '#18221d';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.font = '9px "Courier New",monospace';
    ctx.textBaseline = 'top';
    const perspective = this.perspective, scale = 1 / this.projectionScale;
    const origin: Vec = [...this.center], direction: Vec = [...this.direction];
    const hitPoint: Vec = [0, 0, 0];
    for (let row = 0; row < this.rows; row++) {
      const offsetY = this.projectionCenterY - (this.gridY + (row + 0.5) * this.ch);
      const v = perspective ? offsetY / this.projectionScale : offsetY * scale;
      for (let col = 0; col < this.columns; col++) {
        const offsetX = this.gridX + (col + 0.5) * this.cw - this.width / 2;
        const u = perspective ? offsetX / this.projectionScale : offsetX * scale;
        if (perspective) {
          direction[0] = this.direction[0] + this.right[0] * u + this.up[0] * v;
          direction[1] = this.direction[1] + this.right[1] * u + this.up[1] * v;
          direction[2] = this.direction[2] + this.right[2] * u + this.up[2] * v;
        } else {
          origin[0] = this.center[0] + this.right[0] * u + this.up[0] * v;
          origin[1] = this.center[1] + this.up[1] * v;
          origin[2] = this.center[2] + this.right[2] * u + this.up[2] * v;
        }
        const hit = this.trace(origin, col, row, direction);
        if (!hit) continue;
        this.depths[row * this.columns + col] = hit.t;
        hitPoint[0] = origin[0] + direction[0] * hit.t;
        hitPoint[1] = origin[1] + direction[1] * hit.t;
        hitPoint[2] = origin[2] + direction[2] * hit.t;
        const [g, color] = this.glyph(hit, hitPoint, col, row);
        if (g !== ' ') this.stamp(col, row, g, color);
      }
    }
    if (this.mode === 'ink') this.drawDetails();
    // Draw each cell once. Overlapping line samples no longer build X-shaped ink blobs.
    const x = Math.round(this.gridX * this.dpr) / this.dpr,
      y = Math.round(this.gridY * this.dpr) / this.dpr;
    this.atlas ??= new GlyphAtlas(this.cw, this.ch, ctx.font, this.dpr);
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < this.columns; col++) {
        const i = row * this.columns + col;
        if (this.glyphs[i] === ' ') continue;
        this.atlas.draw(ctx, this.glyphs[i], this.colors[i], x + col * this.cw, y + row * this.ch);
      }
    if (this.mode === 'ink' && this.perspective) this.drawShopSigns();
    if (this.mode === 'ink') this.drawSlateInscriptions();
    this.drawPlayer();
    this.drawMap();
  }
  private project(p: Vec): [number, number, number] {
    const x = p[0] - this.center[0], y = p[1] - this.center[1], z = p[2] - this.center[2];
    const depth = x * this.direction[0] + y * this.direction[1] + z * this.direction[2];
    const scale = this.perspective ? this.projectionScale / Math.max(0.08, depth) : this.projectionScale;
    return [
      this.width / 2 + (x * this.right[0] + y * this.right[1] + z * this.right[2]) * scale,
      this.projectionCenterY - (x * this.up[0] + y * this.up[1] + z * this.up[2]) * scale,
      depth,
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
      dy = q[1] - p[1];
    let first = 0, last = 1;
    for (const [origin, delta, lo, hi] of [[p[0], dx, -this.cw, this.width + this.cw], [p[1], dy, -this.ch, this.height + this.ch]]) {
      if (Math.abs(delta) < 1e-9) {
        if (origin < lo || origin > hi) return;
      } else {
        const a = (lo - origin) / delta, b = (hi - origin) / delta;
        first = Math.max(first, Math.min(a, b));
        last = Math.min(last, Math.max(a, b));
        if (first > last) return;
      }
    }
    const steps = Math.min(4000, Math.ceil(
        Math.max(Math.abs(dx) / this.cw, Math.abs(dy) / this.ch) * (last - first) * 1.3,
      ));
    const glyph =
      Math.abs(dy) < Math.abs(dx) * 0.4
        ? '_'
        : Math.abs(dx) < Math.abs(dy) * 0.3
          ? '|'
          : dx * dy > 0
            ? '\\'
            : '/';
    for (let i = 0; i <= steps; i++) {
      const f = first + (last - first) * (steps ? i / steps : 0),
        c = Math.floor((p[0] + dx * f - this.gridX) / this.cw),
        r = Math.floor((p[1] + dy * f - this.gridY) / this.ch),
        t = this.perspective ? 1 / ((1 - f) / p[2] + f / q[2]) : p[2] + (q[2] - p[2]) * f;
      if (c < 0 || r < 0 || c >= this.columns || r >= this.rows) continue;
      const tolerance = this.perspective ? Math.min(0.2, Math.max(0.015, t * this.cw / this.projectionScale * 0.5)) : 0.65;
      if (t <= this.depths[r * this.columns + c] + tolerance)
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
  private drawShopSigns() {
    const ctx = this.ctx;
    for (const b of this.objects) {
      if (b.kind !== 'sign' || !this.visibleObjects?.has(b)) continue;
      const top = this.project([(b.min[0] + b.max[0]) / 2, b.max[1] - 0.2, b.max[2] + 0.06]);
      const bottom = this.project([(b.min[0] + b.max[0]) / 2, b.min[1] + 0.15, b.max[2] + 0.06]);
      if (top[2] < 0.08 || bottom[2] < 0.08) continue;
      const size = Math.max(12, Math.min(30, Math.abs(bottom[1] - top[1]) / b.name.length * 0.85));
      ctx.save();
      ctx.font = 'bold ' + size + 'px "Courier New", monospace';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffd18a';
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
  private drawDetails() {
    const ink = '#bfbdad',
      faint = '#647166';
    for (const b of this.objects) {
      // Model surfaces carry their own local details. Outlining every small part
      // would fill the spaces between limbs, wheels, and bench slats with ink.
      if (b.finish || !this.visibleObjects?.has(b) || ['foliage', 'river', 'waterfall', 'cliff', 'slate-empty'].includes(b.kind)) continue;
      if (b.kind === 'visitor-slate') {
        continue;
      }
      if (b.kind === 'person' || b.kind === 'player') continue;
      this.outline(b, ink);
      if (b.kind === 'sign') {
        if (this.perspective) continue;
        this.label(
          b.name,
          [b.min[0] + 0.25, b.max[1] - 0.45, b.max[2] + 0.05],
          '#e7b46d',
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
      if (b.kind !== 'building' || !this.detailedBuildings?.has(b)) continue;
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
          if (Math.abs(u - (lo + hi) / 2) < 0.8) continue;
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
    // Shared curbs stop at junctions instead of drawing through the crossing.
    for (let a = -63; a <= 63; a += 21) for (const side of [-2.45, 2.45])
      for (let start = -63; start < 63; start += 21) {
        this.line([a + side, .02, start + 2.45], [a + side, .02, start + 18.55], faint);
        this.line([start + 2.45, .02, a + side], [start + 18.55, .02, a + side], faint);
      }
    if (!this.overview) for (const scene of cityWorld().blocks) for (const [x, , z] of scene.lamps) {
      if ((x - this.player[0]) ** 2 + (z - this.player[2]) ** 2 > 35 ** 2) continue;
      this.line([x, 0, z], [x, 3.7, z], ink);
      this.line([x, 3.7, z], [x + .7, 3.7, z], ink);
      this.label('*', [x + .7, 3.7, z], '#e3b864');
    }
    // A small deterministic spray cloud disperses beyond the falling sheet.
    // World-space labels use the same depth buffer as the rest of the drawing.
    for (let i = 0; i < 48; i++) {
      const phase = mod(this.elapsed * .35 + i * .618, 1);
      this.label(phase < .4 ? ':' : '.', [
        RIVER.east + .7 + phase * 4 + Math.sin(i * 2.4) * .4,
        RIVER.bottom + 3 - phase * 4 + Math.sin(i * 1.8),
        RIVER.north + mod(i * 2.71, 10) + Math.sin(i * 3.1) * phase * 2,
      ], '#517c7b');
    }
    // Sparse route markers sit on the ground and obey the depth buffer.
    for (let i = 0; i < this.path.length; i += 6) {
      const p = this.path[i];
      this.label('.', [p[0], .08, p[2]], '#ffc16f');
    }
    if (this.path.length) {
      const dest = this.path[this.path.length - 1];
      this.label('+', [dest[0], 0.1, dest[2]], '#bb642c');
    }
  }
  private drawSlateInscriptions() {
    const ctx = this.ctx;
    for (const b of this.slateBoxes ?? []) {
      if (!this.visibleObjects?.has(b)) continue;
      const y = b.max[1] + .015;
      const a = this.project([b.min[0] + .12, y, b.min[2] + .1]);
      const right = this.project([b.max[0] - .12, y, b.min[2] + .1]);
      const bottom = this.project([b.min[0] + .12, y, b.max[2] - .1]);
      const opposite = this.project([b.max[0] - .12, y, b.max[2] - .1]);
      const corners = [a, right, opposite, bottom];
      if (this.perspective && corners.some(p => p[2] < .08)) continue;
      const width = Math.hypot(right[0] - a[0], right[1] - a[1]);
      if (width < 4) continue;
      const x0 = Math.max(0, Math.floor((Math.min(...corners.map(p => p[0])) - this.gridX) / this.cw));
      const x1 = Math.min(this.columns - 1, Math.ceil((Math.max(...corners.map(p => p[0])) - this.gridX) / this.cw));
      const y0 = Math.max(0, Math.floor((Math.min(...corners.map(p => p[1])) - this.gridY) / this.ch));
      const y1 = Math.min(this.rows - 1, Math.ceil((Math.max(...corners.map(p => p[1])) - this.gridY) / this.ch));
      ctx.save();
      ctx.beginPath();
      // Clip the inscription against nearer geometry, including the visitor avatar.
      for (let row = y0; row <= y1; row++) for (let col = x0; col <= x1; col++) {
        const px = this.gridX + (col + .5) * this.cw, py = this.gridY + (row + .5) * this.ch;
        const origin = this.ray(px, py), direction = this.rayDirection(px, py);
        const t = (y - origin[1]) / direction[1];
        if (t >= 0 && t <= this.depths[row * this.columns + col] + .3)
          ctx.rect(this.gridX + col * this.cw, this.gridY + row * this.ch, this.cw, this.ch);
      }
      ctx.clip();
      ctx.beginPath(); ctx.moveTo(a[0], a[1]);
      for (const p of corners.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.closePath(); ctx.clip();
      ctx.fillStyle = '#385047';
      ctx.fill();
      // Affine text coordinates follow the stone's top face; the projected center
      // is used as the origin so full names stay centered at every camera angle.
      const center = this.project([(b.min[0] + b.max[0]) / 2, y, (b.min[2] + b.max[2]) / 2]);
      const u = [(right[0] - a[0]) / 600, (right[1] - a[1]) / 600];
      const v = [(bottom[0] - a[0]) / 320, (bottom[1] - a[1]) / 320];
      const flip = u[0] < 0 ? -1 : 1;
      ctx.transform(u[0] * flip, u[1] * flip, v[0] * flip, v[1] * flip, center[0], center[1]);
      const lines = inscriptionLines(b.name);
      const maxLength = Math.max(...lines.map(line => Array.from(line).length));
      const fontSize = Math.min(108, 520 / (maxLength * .63), 220 / (lines.length * 1.2));
      ctx.font = `bold ${fontSize}px "Courier New", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = b.name === this.selectedName ? ('#f5d99c') : ('#e3eee2');
      lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * fontSize * 1.2, 540));
      ctx.restore();
    }
  }
  private drawPlayer() {
    if (this.perspective) return;
    const p = this.project([this.player[0], this.player[1] + 1.2, this.player[2]]),
      ink = '#ffc16f';
    const ctx = this.ctx;
    ctx.font = 'bold 17px "Courier New",monospace';
    ctx.fillStyle = '#18221de8';
    ctx.fillRect(p[0] - 7, p[1] - 5, 16, 21);
    ctx.fillStyle = ink;
    ctx.fillText('@', Math.round(p[0] - 5), Math.round(p[1] - 4));
    ctx.font = '10px "Courier New",monospace';
    ctx.fillText('YOU', Math.round(p[0] - 8), Math.round(p[1] - 17));
  }
  attachMap(canvas: HTMLCanvasElement) {
    this.mapCanvas?.removeEventListener('click', this.mapClick);
    this.mapCanvas = canvas;
    canvas.addEventListener('click', this.mapClick);
  }
  private drawMap() {
    const canvas = this.mapCanvas, ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    const size = canvas.width, scale = (size - 8) / (MAP_LIMIT * 2), mid = size / 2;
    const px = (x: number) => mid + x * scale;
    ctx.clearRect(0, 0, size, size);
    const current = districtAt(this.player[0], this.player[2]);
    for (const d of DISTRICTS) {
      ctx.globalAlpha = d === current ? .23 : .08;
      ctx.fillStyle = d.color;
      ctx.fillRect(px(d.x - 19), px(d.z - 19), 38 * scale, 38 * scale);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#34584c';
    ctx.fillRect(px(YARD.west), px(YARD.north), (YARD.east - YARD.west) * scale, (YARD.south - YARD.north) * scale);
    ctx.fillStyle = '#647160';
    for (const b of this.fixed) ctx.fillRect(px(b.min[0]), px(b.min[2]),
      (b.max[0] - b.min[0]) * scale, (b.max[2] - b.min[2]) * scale);
    ctx.fillStyle = '#549aab';
    ctx.fillRect(px(RIVER.west), px(RIVER.north), (RIVER.east - RIVER.west) * scale, (RIVER.south - RIVER.north) * scale);
    ctx.fillStyle = '#b9e7e0';
    ctx.fillRect(px(RIVER.east) - 1, px(RIVER.north), 2, (RIVER.south - RIVER.north) * scale);
    ctx.fillStyle = '#b2ae8a';
    ctx.fillRect(px(-3), px(64), 6 * scale, 14 * scale);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const d of [...DISTRICTS, VISITOR_DISTRICT]) {
      ctx.fillStyle = '#19231ded';
      ctx.fillRect(px(d.x) - 9, px(d.z) - 6, 18, 12);
      ctx.fillStyle = '#d2d4bd';
      ctx.fillText(d.code, px(d.x), px(d.z));
    }
    ctx.strokeStyle = '#ffc16f'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px(this.player[0]), px(this.player[2]));
    for (const p of this.path) ctx.lineTo(px(p[0]), px(p[2]));
    ctx.stroke();
    const x = px(this.player[0]), z = px(this.player[2]);
    ctx.beginPath(); ctx.moveTo(x, z);
    ctx.lineTo(x - Math.sin(this.angle) * 9, z - Math.cos(this.angle) * 9); ctx.stroke();
    ctx.fillStyle = '#ffc16f';
    ctx.beginPath(); ctx.arc(x, z, 2.8, 0, Math.PI * 2); ctx.fill();
  }
  private mapClick = (event: MouseEvent) => {
    if (!this.mapCanvas) return;
    const rect = this.mapCanvas.getBoundingClientRect();
    const size = this.mapCanvas.width, scale = (size - 8) / (MAP_LIMIT * 2);
    const x = ((event.clientX - rect.left) / rect.width * size - size / 2) / scale;
    const z = ((event.clientY - rect.top) / rect.height * size - size / 2) / scale;
    this.visitDistrict(districtAt(x, z).id);
    this.canvas.focus({ preventScroll: true });
  };
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
        district: districtAt(this.player[0], this.player[2]).name,
        identity: districtAt(this.player[0], this.player[2]).identity,
        inVisitorYard: this.player[2] > 78 && this.player[2] < YARD.south && Math.abs(this.player[0]) < 24,
      });
      this.frames = 0;
      this.reportAt = now;
    }
    this.frame = requestAnimationFrame(this.tick);
  };
  destroy() {
    this.mapCanvas?.removeEventListener('click', this.mapClick);
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
