import type { Box, Vec } from './city';

export type Finish =
  | 'coat'
  | 'trousers'
  | 'skin'
  | 'hair'
  | 'shoe'
  | 'paint'
  | 'glass'
  | 'tire'
  | 'metal'
  | 'wood'
  | 'door'
  | 'lamp'
  | 'tail'
  | 'display';
export type Frame = { origin: Vec; yaw: number; cos?: number; sin?: number };

export function toWorld(p: Vec, frame?: Frame): Vec {
  if (!frame) return p;
  const c = frame.cos ?? Math.cos(frame.yaw),
    s = frame.sin ?? Math.sin(frame.yaw);
  return [
    frame.origin[0] + c * p[0] + s * p[2],
    frame.origin[1] + p[1],
    frame.origin[2] - s * p[0] + c * p[2],
  ];
}

export function toLocal(p: Vec, frame: Frame, vector = false): Vec {
  const x = p[0] - (vector ? 0 : frame.origin[0]);
  const z = p[2] - (vector ? 0 : frame.origin[2]);
  const c = frame.cos ?? Math.cos(frame.yaw),
    s = frame.sin ?? Math.sin(frame.yaw);
  return [c * x - s * z, p[1] - (vector ? 0 : frame.origin[1]), s * x + c * z];
}

function model(
  name: string,
  kind: string,
  origin: Vec,
  yaw: number,
  detail: string,
) {
  const parts: Box[] = [];
  const frame = { origin, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw) };
  const add = (
    min: Vec,
    max: Vec,
    finish: Finish,
    tint?: string,
    feature?: string,
  ) => {
    parts.push({ min, max, name, kind, detail, frame, finish, tint, feature });
  };
  return { parts, add };
}

// Local -Z is forward. Every part shares the same rigid model transform.
export function personModel(
  x: number,
  z: number,
  yaw: number,
  phase: number,
  stride: number,
  index: number,
  player = false,
): Box[] {
  const { parts, add } = model(
    player ? 'You' : 'Resident ' + (index + 1),
    player ? 'player' : 'person',
    [x, 0, z],
    yaw,
    player
      ? 'You, in an amber jacket, dark trousers and walking shoes.'
      : 'A neighbor out for a walk, with a coat, shoes and a shoulder bag.',
  );
  const coat = player
    ? '#ba7130'
    : ['#47766d', '#88606e', '#537a9c', '#957244'][index % 4];
  const skin = ['#bd8c65', '#9a674d', '#d4ab86', '#7d543f'][index % 4];
  const swing = Math.sin(phase) * stride;
  const bob = Math.abs(Math.sin(phase)) * stride * 0.07;
  add(
    [-0.23, 0.78 + bob, -0.15],
    [0.23, 1.34 + bob, 0.16],
    'coat',
    coat,
    'jacket',
  );
  add([-0.19, 0.68, -0.12], [0.19, 0.85, 0.13], 'trousers');
  add([-0.075, 1.32 + bob, -0.07], [0.075, 1.43 + bob, 0.08], 'skin', skin);
  add(
    [-0.145, 1.4 + bob, -0.14],
    [0.145, 1.7 + bob, 0.14],
    'skin',
    skin,
    'face',
  );
  add(
    [-0.155, 1.65 + bob, -0.15],
    [0.155, 1.76 + bob, 0.15],
    'hair',
    player ? '#4b3529' : '#453b36',
  );
  add([-0.15, 1.51 + bob, 0.1], [0.15, 1.67 + bob, 0.155], 'hair');
  for (const side of [-1, 1]) {
    const step = side * swing;
    const lx = side * 0.115;
    add(
      [lx - 0.075, 0.12, step - 0.08],
      [lx + 0.075, 0.73, step + 0.08],
      'trousers',
    );
    add(
      [lx - 0.085, 0.025, step - 0.2],
      [lx + 0.085, 0.15, step + 0.09],
      'shoe',
    );
    const ax = side * 0.295;
    add(
      [ax - 0.06, 0.72 + bob, -step - 0.07],
      [ax + 0.06, 1.28 + bob, -step + 0.07],
      'coat',
      coat,
      'sleeve',
    );
    add(
      [ax - 0.055, 0.62 + bob, -step - 0.065],
      [ax + 0.055, 0.75 + bob, -step + 0.065],
      'skin',
      skin,
      'hand',
    );
  }
  if (player) {
    add(
      [-0.18, 0.92 + bob, 0.16],
      [0.18, 1.28 + bob, 0.29],
      'coat',
      '#7d5937',
      'bag',
    );
  } else if (index % 2 === 0) {
    add([0.25, 0.67, 0.02], [0.4, 0.96, 0.2], 'coat', '#685342', 'bag');
  }
  return parts;
}

export function vehicleModel(
  x: number,
  z: number,
  yaw: number,
  bus: boolean,
  index: number,
  parked = false,
): Box[] {
  const { parts, add } = model(
    bus
      ? 'Bus 16'
      : parked
        ? 'Parked car ' + (index + 1)
        : 'Car ' + (index + 1),
    'car',
    [x, 0, z],
    yaw,
    bus
      ? 'Route 16 · Maple Street. A neighborhood bus with glazed doors and passenger windows.'
      : parked
        ? 'A parked neighborhood runabout.'
        : 'Following the one-way perimeter loop.',
  );
  const length = bus ? 5 : 2.6,
    half = length / 2,
    width = bus ? 0.71 : 0.6;
  const paint = bus
    ? '#a87c38'
    : ['#557c7c', '#a15f4d', '#697ba0', '#8b845b'][index % 4];
  add(
    [-width, 0.34, -half],
    [width, bus ? 1.03 : 0.83, half],
    'paint',
    paint,
    bus ? 'bus-body' : 'body',
  );
  add(
    [-width + 0.06, 0.21, -half + 0.14],
    [width - 0.06, 0.37, half - 0.14],
    'metal',
  );
  const top = bus ? 2.1 : 1.35,
    front = bus ? -half + 0.1 : -0.65,
    rear = bus ? half - 0.1 : 0.8;
  add(
    [-width + 0.065, bus ? 1.02 : 0.83, front],
    [width - 0.065, top, rear],
    'glass',
    undefined,
    bus ? 'bus-windows' : 'windows',
  );
  add(
    [-width + 0.045, top, front - 0.025],
    [width - 0.045, top + 0.09, rear + 0.025],
    'paint',
    paint,
  );
  for (const side of [-1, 1]) {
    const sx = side * (width - 0.05);
    for (const pos of bus
      ? [front, -1.55, -0.7, 0.15, 1, 1.85, rear]
      : [front, 0.12, rear])
      add(
        [sx - 0.045, bus ? 1.02 : 0.84, pos - 0.035],
        [sx + 0.045, top, pos + 0.035],
        'paint',
        paint,
      );
    // Separate wheel volumes leave daylight under the chassis.
    for (const wheelZ of [-half + 0.52, half - 0.52]) {
      const wx = side * width;
      add(
        [wx - 0.095, 0.06, wheelZ - 0.26],
        [wx + 0.095, 0.55, wheelZ + 0.26],
        'tire',
        undefined,
        'wheel',
      );
    }
    add(
      [side * (width - 0.02) - 0.09, bus ? 1.48 : 1.04, front - 0.12],
      [side * (width - 0.02) + 0.09, bus ? 1.61 : 1.14, front + 0.08],
      'metal',
    );
    add(
      [sx - 0.035, bus ? 0.92 : 0.74, bus ? -0.7 : 0.27],
      [sx + 0.035, bus ? 0.99 : 0.78, bus ? -0.48 : 0.45],
      'metal',
    );
  }
  for (const end of [-1, 1]) {
    const ez = end * (half + 0.025);
    add(
      [-width - 0.015, 0.35, ez - 0.055],
      [width + 0.015, 0.44, ez + 0.055],
      'metal',
    );
    for (const side of [-1, 1])
      add(
        [side * width * 0.63 - 0.13, 0.59, ez - 0.035],
        [side * width * 0.63 + 0.13, 0.74, ez + 0.035],
        end === -1 ? 'lamp' : 'tail',
      );
  }
  add(
    [-0.23, 0.49, -half - 0.065],
    [0.23, 0.68, -half - 0.015],
    'metal',
    undefined,
    'grille',
  );
  if (bus) {
    add([-0.43, 1.78, -half - 0.035], [0.43, 2.025, -half + 0.06], 'display');
    add(
      [width - 0.045, 0.4, -half + 0.28],
      [width + 0.025, 1.82, -half + 1.04],
      'glass',
      undefined,
      'bus-door',
    );
    add(
      [width - 0.04, 0.38, -half + 0.64],
      [width + 0.03, 1.84, -half + 0.69],
      'metal',
    );
  }
  return parts;
}

export function benchModel(x: number, z: number): Box[] {
  const { parts, add } = model(
    'Bench',
    'bench',
    [x, 0, z],
    0,
    'A slatted wooden park bench with a backrest and iron armrests.',
  );
  for (let i = 0; i < 4; i++) {
    add([0, 0.49, i * 0.15], [1.7, 0.57, i * 0.15 + 0.12], 'wood');
    if (i < 3)
      add([0, 0.75 + i * 0.18, -0.055], [1.7, 0.89 + i * 0.18, 0.025], 'wood');
  }
  for (const x of [0.16, 1.54]) {
    for (const z of [0.04, 0.48])
      add([x - 0.045, 0.02, z - 0.045], [x + 0.045, 0.5, z + 0.045], 'metal');
    add([x - 0.035, 0.52, -0.05], [x + 0.035, 1.28, 0.03], 'metal');
    add([x - 0.035, 0.55, 0.4], [x + 0.035, 0.83, 0.47], 'metal');
    add([x - 0.055, 0.8, -0.02], [x + 0.055, 0.86, 0.5], 'metal');
  }
  return parts;
}

export function doorModels(building: Box): Box[] {
  const parts: Box[] = [];
  // One entrance on each façade; the existing building remains the collision volume.
  for (let side = 0; side < 4; side++) {
    const x = (building.min[0] + building.max[0]) / 2;
    const z = (building.min[2] + building.max[2]) / 2;
    const origin: Vec =
      side === 0
        ? [x, 0, building.min[2]]
        : side === 1
          ? [x, 0, building.max[2]]
          : side === 2
            ? [building.min[0], 0, z]
            : [building.max[0], 0, z];
    const { parts: door, add } = model(
      building.name,
      'door',
      origin,
      [0, Math.PI, Math.PI / 2, -Math.PI / 2][side],
      building.detail || 'A neighborhood entrance.',
    );
    add([-0.57, 0.06, -0.045], [0.57, 2.03, -0.008], 'door');
    for (const x of [-0.65, 0.57])
      add([x, 0.04, -0.12], [x + 0.08, 2.15, 0], 'wood');
    add([-0.65, 2.03, -0.12], [0.65, 2.15, 0], 'wood');
    add([-0.65, 0.02, -0.22], [0.65, 0.08, 0.01], 'metal');
    add(
      [-0.43, 0.96, -0.064],
      [0.43, 1.83, -0.047],
      'glass',
      undefined,
      'door-glass',
    );
    add([-0.025, 0.94, -0.082], [0.025, 1.85, -0.065], 'wood');
    add([0.38, 0.8, -0.15], [0.435, 1.06, -0.08], 'metal');
    parts.push(...door);
  }
  return parts;
}

const mod = (a: number, b: number) => ((a % b) + b) % b;
export function detailGlyph(
  b: Box,
  world: Vec,
  worldNormal: Vec,
): [string, string] {
  const p = b.frame ? toLocal(world, b.frame) : world;
  const n = b.frame ? toLocal(worldNormal, b.frame, true) : worldNormal;
  const x = (p[0] - b.min[0]) / (b.max[0] - b.min[0]);
  const y = (p[1] - b.min[1]) / (b.max[1] - b.min[1]);
  const z = (p[2] - b.min[2]) / (b.max[2] - b.min[2]);
  const u = Math.abs(n[0]) > 0.5 ? z : x;
  const v = Math.abs(n[1]) > 0.5 ? z : y;
  const edge = Math.min(u, 1 - u, v, 1 - v) < 0.045;
  switch (b.finish) {
    case 'skin': {
      if (b.feature === 'face' && n[2] < -0.5) {
        if (
          y > 0.58 &&
          y < 0.73 &&
          (Math.abs(x - 0.27) < 0.12 || Math.abs(x - 0.73) < 0.12)
        )
          return ['o', '#c7aa8f'];
        if (y > 0.22 && y < 0.3 && x > 0.32 && x < 0.68)
          return ['-', '#704932'];
        if (Math.abs(x - 0.5) < 0.08 && y > 0.36 && y < 0.57)
          return ['|', '#8f6449'];
      }
      return [edge ? ':' : '.', b.tint || '#ba8a68'];
    }
    case 'hair':
      return [
        Math.abs(n[1]) > 0.5 ? '=' : '|',
        '#9b8671',
      ];
    case 'coat':
      if (b.feature === 'jacket' && n[2] < -0.5) {
        if (Math.abs(x - 0.5) < 0.035)
          return ['|', '#f0d3a6'];
        if (y > 0.26 && y < 0.33 && (x < 0.3 || x > 0.7))
          return ['_', '#3f4b49'];
        if (y > 0.82 && Math.abs(x - 0.5) < (1 - y) * 1.5)
          return ['v', '#d7bd96'];
      }
      return [
        edge
          ? Math.abs(n[1]) > 0.5
            ? '_'
            : '|'
          : mod(Math.floor(p[0] * 35) + Math.floor(p[1] * 35), 3)
            ? ':'
            : '.',
        b.tint || '#a67843',
      ];
    case 'trousers':
      return [edge ? '|' : ':', '#8994a4'];
    case 'shoe':
      return [y < 0.25 ? '=' : '#', '#7f8480'];
    case 'paint':
      return [
        edge ? '_' : b.feature === 'bus-body' && y > 0.7 ? '=' : '.',
        b.tint || '#6c8481',
      ];
    case 'glass': {
      if (edge || (b.feature === 'bus-door' && Math.abs(u - 0.5) < 0.04))
        return ['|', '#92acac'];
      const glint = mod((u + v * 0.45) * 4, 1) < 0.12;
      return [
        glint ? '/' : ':',
        glint ? '#bfd7d1' : '#6d9095',
      ];
    }
    case 'tire': {
      const r = Math.hypot((u - 0.5) * 2, (y - 0.5) * 2);
      return [
        r < 0.42 ? '+' : r < 0.62 ? 'O' : '#',
        r < 0.62 ? '#b7bab0' : '#6c746f',
      ];
    }
    case 'metal':
      return [
        b.feature === 'grille' ? '=' : edge ? '_' : '+',
        '#9ea89b',
      ];
    case 'wood':
      return [
        mod(p[0] * 3 + p[1] * 17 + p[2] * 9, 1) < 0.23 ? '~' : '-',
        '#bea17a',
      ];
    case 'door': {
      const panel = x > 0.15 && x < 0.85 && y > 0.09 && y < 0.4;
      return [
        panel ? (x < 0.2 || x > 0.8 ? '|' : '=') : ':',
        '#b09772',
      ];
    }
    case 'lamp':
      return ['#', '#ffe3a0'];
    case 'tail':
      return ['#', '#fa8b5e'];
    case 'display': {
      const col = Math.floor(x * 9),
        row = Math.min(4, Math.floor((1 - y) * 5));
      const digits = ['010011010010111', '111100111101111'];
      const digit = col < 4 ? 0 : 1,
        dc = col - (digit ? 5 : 1);
      return [
        dc >= 0 && dc < 3 && digits[digit][row * 3 + dc] === '1' ? '#' : '.',
        '#ffce79',
      ];
    }
    default:
      return ['.', '#69776b'];
  }
}
