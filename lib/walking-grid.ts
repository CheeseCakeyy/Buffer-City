import type { Box, Vec } from './city';
import { WORLD_LIMIT } from './city-world';

// Half-unit cells, four-way travel, and the same .35-unit body clearance as WASD.
// Paint obstacles once instead of testing every building at every BFS expansion.
export class WalkingGrid {
  private half = WORLD_LIMIT * 2;
  private size = this.half * 2 + 1;
  private blocked = new Uint8Array(this.size * this.size);
  private parents = new Int32Array(this.blocked.length);
  private queue = new Int32Array(this.blocked.length);
  constructor(readonly boxes: Box[]) {
    for (let z = 0; z < this.size; z++) for (let x = 0; x < this.size; x++)
      if (x <= 2 || z <= 2 || x >= this.size - 3 || z >= this.size - 3) this.blocked[z * this.size + x] = 1;
    for (const b of boxes) {
      if (b.min[1] >= 1.6) continue;
      const left = Math.max(0, Math.floor((b.min[0] - .35) * 2 + this.half) + 1);
      const right = Math.min(this.size - 1, Math.ceil((b.max[0] + .35) * 2 + this.half) - 1);
      const top = Math.max(0, Math.floor((b.min[2] - .35) * 2 + this.half) + 1);
      const bottom = Math.min(this.size - 1, Math.ceil((b.max[2] + .35) * 2 + this.half) - 1);
      for (let z = top; z <= bottom; z++) this.blocked.fill(1, z * this.size + left, z * this.size + right + 1);
    }
  }
  route(from: Vec, x: number, z: number): Vec[] | null {
    const cell = (x: number, z: number) => {
      const cx = Math.round(x * 2) + this.half, cz = Math.round(z * 2) + this.half;
      return cx < 0 || cz < 0 || cx >= this.size || cz >= this.size ? -1 : cz * this.size + cx;
    };
    const start = cell(from[0], from[2]), end = cell(x, z);
    if (start < 0 || end < 0 || this.blocked[end]) return null;
    this.parents.fill(-1);
    let head = 0, tail = 1;
    this.queue[0] = start; this.parents[start] = start;
    // Rounded starting cells can overlap a wall even when the actual player clears
    // it. Leave that cell once; all subsequent cells must be walkable.
    while (head < tail) {
      const current = this.queue[head++];
      if (current === end) {
        const path: Vec[] = [];
        for (let p = end; p !== start; p = this.parents[p])
          path.push([(p % this.size - this.half) / 2, 0, (Math.floor(p / this.size) - this.half) / 2]);
        return path.reverse();
      }
      for (const next of [current - 1, current + 1, current - this.size, current + this.size]) {
        if (next < 0 || next >= this.blocked.length || this.blocked[next] || this.parents[next] !== -1) continue;
        this.parents[next] = current; this.queue[tail++] = next;
      }
    }
    return null;
  }
}
