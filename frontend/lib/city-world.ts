import type { Box, Vec } from './city';
import { benchModel, doorModels, vehicleModel } from './street-details';

export const BLOCK_SIZE = 42;
export const WORLD_LIMIT = 66;
// Southeast corner of Arts Lane, beside the river's waterfall edge.
export const SPAWN_POSITION: Vec = [64, 0, 64];
export const RIVER = { west: -66, east: 66, north: 66, south: 76, surface: .12, bottom: -22 };
export const MAP_LIMIT = 112;
export const YARD = { west: -24, east: 24, north: 76, south: 108 };
export const VISITOR_DISTRICT: District = { id: 'visitors', name: 'Visitor Yard', identity: 'Across the river', code: 'VY', x: 0, z: 86, color: '#6f9592', description: 'A garden of names left by people who crossed the bridge.' };
export function hasGround(x: number, z: number) {
  return (Math.abs(x) < WORLD_LIMIT && Math.abs(z) < WORLD_LIMIT) ||
    (Math.abs(x) <= 3 && z >= 64 && z <= 78) ||
    (x >= YARD.west && x <= YARD.east && z >= YARD.north && z <= YARD.south);
}
export function walkableGround(x: number, z: number) {
  return (Math.abs(x) < WORLD_LIMIT - 1 && Math.abs(z) < WORLD_LIMIT - 1) ||
    (Math.abs(x) < 2.6 && z > 64 && z < 79) ||
    (x > YARD.west + .5 && x < YARD.east - .5 && z > YARD.north + .5 && z < YARD.south - .5);
}
export function groundHeight(x: number, z: number) {
  return Math.abs(x) <= 3 && z >= 64 && z <= 78 ? .35 : 0;
}
export type District = {
  id: string; name: string; identity: string; code: string;
  x: number; z: number; color: string; description: string;
};
export const DISTRICTS: District[] = [
  { id: 'cedar', name: 'Cedar Row', identity: 'Residential', code: 'CR', x: -42, z: -42, color: '#a77b64', description: 'Brick row houses, pocket gardens and narrow service alleys.' },
  { id: 'market', name: 'Market Square', identity: 'Commercial', code: 'MS', x: 0, z: -42, color: '#b28a45', description: 'Striped market stalls, shopfronts and a busy shopping street.' },
  { id: 'foundry', name: 'Foundry Works', identity: 'Construction', code: 'FW', x: 42, z: -42, color: '#b69038', description: 'An open building frame, tower crane, site office and stacked supplies.' },
  { id: 'park', name: 'Juniper Park', identity: 'Park', code: 'JP', x: -42, z: 0, color: '#668b57', description: 'Tree groves, a reflecting pond, benches and paths through the grass.' },
  { id: 'maple', name: 'Maple Street', identity: 'Mixed use', code: 'MP', x: 0, z: 0, color: '#8c8b76', description: 'The original neighborhood: café, library, apartments and record shop.' },
  { id: 'civic', name: 'Civic Quarter', identity: 'Civic', code: 'CQ', x: 42, z: 0, color: '#7b8a97', description: 'City hall, an archive, a clock tower and a fountain plaza.' },
  { id: 'depot', name: 'Depot Yard', identity: 'Industrial', code: 'DY', x: -42, z: 42, color: '#7e8885', description: 'Bus shelters, a depot canopy, warehouses and freight containers.' },
  { id: 'garden', name: 'Garden Courts', identity: 'Residential gardens', code: 'GC', x: 0, z: 42, color: '#889b65', description: 'Low courtyard homes, raised planting beds and sheltered seating.' },
  { id: 'arts', name: 'Arts Lane', identity: 'Arts & cafés', code: 'AL', x: 42, z: 42, color: '#9f7d93', description: 'Galleries, a cinema, colorful studios and an open courtyard.' },
];
export function districtAt(x: number, z: number): District {
  if (z >= 65 && Math.abs(x) < 25) return VISITOR_DISTRICT;
  const col = Math.max(0, Math.min(2, Math.floor((x + 63) / BLOCK_SIZE)));
  const row = Math.max(0, Math.min(2, Math.floor((z + 63) / BLOCK_SIZE)));
  return DISTRICTS[row * 3 + col];
}
export function districtDestination(d: District): Vec { return d.id === 'visitors' ? [0, 0, 82] : [d.x, 0, d.z + 18]; }
export function roadDistance(n: number) { return Math.abs(n - Math.round(n / 21) * 21); }
export type DetailGroup = { x: number; z: number; boxes: Box[] };
export type BlockScene = {
  district: District; coarse: Box[]; details: DetailGroup[];
  lamps: Vec[];
};
export type CityWorld = { blocks: BlockScene[]; colliders: Box[]; buildings: Box[] };

// Generated once. High-detail model parts are shared across frames; only actors move.
export function generateWorld(maple: Box[]): CityWorld {
  const world: CityWorld = { blocks: [], colliders: [], buildings: [] };
  for (const d of DISTRICTS) {
    const scene: BlockScene = { district: d, coarse: [], details: [], lamps: [] };
    world.blocks.push(scene);
    const add = (x: number, z: number, w: number, depth: number, h: number, name: string,
      kind = 'building', y = 0, solid = y < 1.6): Box => {
      const b: Box = { min: [d.x + x, y, d.z + z], max: [d.x + x + w, y + h, d.z + z + depth],
        name, kind, detail: `${d.name} · ${d.identity}. ${d.description}`, tint: d.color };
      scene.coarse.push(b);
      if (solid) world.colliders.push(b);
      if (kind === 'building') world.buildings.push(b);
      return b;
    };
    const prop = (x: number, z: number, w: number, depth: number, h: number, name: string,
      finish: Box['finish'], y = 0, tint = d.color) => {
      const b = add(x, z, w, depth, h, name, 'prop', y);
      b.finish = finish; b.tint = tint;
      return b;
    };
    const tree = (x: number, z: number, h = 3.5) => {
      prop(x - .12, z - .12, .24, .24, h, 'Tree trunk', 'wood', 0, '#75634e');
      add(x - 1.35, z - 1.15, 2.7, 2.3, 1.6, 'Tree canopy', 'foliage', h - .8, false);
      add(x - .9, z - .8, 1.8, 1.6, .65, 'Tree canopy', 'foliage', h + .8, false);
    };
    const bench = (x: number, z: number) => {
      scene.details.push({ x: d.x + x, z: d.z + z, boxes: benchModel(d.x + x, d.z + z) });
    };
    if (d.id === 'maple') {
      scene.coarse.push(...maple); world.colliders.push(...maple); world.buildings.push(...maple);
      bench(-6, 12.5); bench(-4.5, 16.8); bench(-17, 3.5);
      for (const [x, z] of [[-6, 14], [-17, -6.5], [2.95, 15], [16.8, -12]]) tree(x, z);
      for (const [i, x] of [-13, -7, 7].entries()) scene.details.push({ x, z: 16.9,
        boxes: vehicleModel(x, 16.9, -Math.PI / 2, false, i, true) });
    } else if (d.id === 'cedar') {
      for (const z of [-16, 6]) for (const x of [-16, -9, 4, 11])
        add(x, z, 5, 9, x % 2 === 0 ? 8 : 6.5, `Cedar House ${x + 17}${z + 17}`);
      for (const x of [-13, 7]) tree(x, -3.6, 3);
      bench(5, 17);
    } else if (d.id === 'market') {
      add(-16, -16, 12, 8, 8, 'Market Hall'); add(4, -16, 12, 8, 6, 'Grand Arcade');
      add(-16, 5, 5, 11, 7, 'Baker & Sons'); add(10, 5, 6, 11, 9, 'Mercantile House');
      for (const x of [-7, 4]) for (const z of [5, 11]) {
        prop(x, z, 3, 1.4, .9, 'Produce stall', 'wood');
        add(x - .15, z - .2, 3.3, 1.8, .25, 'Market canopy', 'awning', 2.15, false);
        for (const dx of [0, 2.8]) prop(x + dx, z, .12, .12, 2.2, 'Stall post', 'metal');
      }
      bench(-5, -5); tree(16.5, 3.5);
    } else if (d.id === 'foundry') {
      add(5, 6, 10, 7, 3, 'Site Office'); add(-16, 7, 7, 8, 4, 'Materials Shed');
      // Open floors and posts, rather than a solid building pretending to be a frame.
      for (const y of [0, 3.3, 6.6, 9.9]) {
        prop(-16, -16, 12, 11, .22, 'Concrete floor', 'paint', y, '#96968a');
        if (y < 9) for (const x of [-16, -10.2, -4.4]) for (const z of [-16, -5.4])
          prop(x, z, .4, .4, 3.3, 'Structural column', 'metal', y);
      }
      prop(7, -13, 1, 1, 18, 'Tower crane', 'paint', 0, '#bb913b');
      prop(-3, -13, 19, .65, .7, 'Crane jib', 'paint', 17.3, '#bb913b');
      prop(-3, -13, 2, 1.4, 1.2, 'Crane counterweight', 'metal', 16);
      prop(13, -12.8, .08, .08, 11, 'Crane cable', 'metal', 6.3);
      prop(12.5, -13, 1, .6, .45, 'Crane hook', 'metal', 6);
      for (const z of [5, 9, 13]) prop(-6, z, 2.5, 2, 1.2, 'Stacked timber', 'wood');
      for (const x of [-15, -11, -7]) {
        const barrier = prop(x, -3.5, 3, .3, 1, 'Site barrier', 'paint', 0, '#bd9439');
        barrier.feature = 'hazard';
      }
    } else if (d.id === 'park') {
      add(7, 7, 7, 6, 3.5, 'Park Pavilion');
      add(-14, -14, 9, 8, .12, 'Reflecting pond', 'water');
      for (const [x, z] of [[-15, 7], [-8, 13], [7, -13], [14, -7], [15, 15], [-14, 15], [-5, 6], [6, -6], [-16, -4]]) tree(x, z, 3.8);
      for (const [x, z] of [[-11, -3.5], [-5, 9], [7, -5], [6, 16]]) bench(x, z);
    } else if (d.id === 'civic') {
      add(-16, -16, 12, 10, 9, 'City Hall'); add(5, -16, 11, 9, 7, 'Public Archive');
      add(-16, 6, 11, 9, 5, 'Community Library');
      add(-11, -13, 3, 3, 7, 'Clock Tower', 'clock', 9, false);
      add(8, 8, 6, 6, .4, 'Fountain basin', 'water');
      prop(10.5, 10.5, 1, 1, 3, 'Fountain column', 'metal');
      prop(9.5, 9.5, 3, 3, .2, 'Fountain bowl', 'metal', 2.8);
      bench(6, 16); bench(-5, 3.5); tree(16.5, -3);
    } else if (d.id === 'depot') {
      add(-16, -16, 12, 11, 6, 'Freight Warehouse'); add(5, -16, 11, 10, 4, 'Repair Workshop');
      prop(-16, 5, 12, 10, .5, 'Bus depot canopy', 'metal', 4);
      for (const x of [-16, -4.3]) for (const z of [5, 14.7]) prop(x, z, .3, .3, 4, 'Depot column', 'metal');
      for (const x of [-13, -7]) scene.details.push({ x: d.x + x, z: d.z + 10, boxes: vehicleModel(d.x + x, d.z + 10, 0, true, 0, true) });
      for (const z of [5, 10]) prop(6, z, 9, 3, 2.4, 'Freight container', 'paint', 0, z === 5 ? '#6d8493' : '#98754e');
      bench(-5, 17);
    } else if (d.id === 'garden') {
      for (const x of [-16, 6]) for (const z of [-16, 6]) add(x, z, 10, 7, 4.8, 'Garden Court Apartments');
      for (const x of [-13, 9]) for (const z of [-5.5, 15]) {
        prop(x, z, 5, 1.4, .45, 'Raised garden', 'wood');
        add(x + .2, z + .2, 4.6, 1, .4, 'Herb garden', 'foliage', .45, false);
      }
      tree(-4, 11); tree(4, -10); bench(-9, -3); bench(10, 3.5);
    } else {
      add(-16, -16, 11, 8, 6, 'Ink Gallery'); add(5, -16, 11, 10, 8, 'Lantern Cinema');
      add(-16, 5, 6, 11, 5, 'Clay Studio'); add(-8, 6, 5, 8, 4, 'Violet Coffee');
      add(11, 6, 5, 10, 6.5, 'Print Works');
      bench(6, 15); tree(-4, -5);
    }
    const localBuildings = scene.coarse.filter(b => b.kind === 'building');
    for (let i = 0; i < localBuildings.length; i++) {
      const b = localBuildings[i];
      scene.details.push({ x: (b.min[0] + b.max[0]) / 2, z: (b.min[2] + b.max[2]) / 2, boxes: doorModels(b) });
      if (i % 3 === 0) scene.coarse.push({ min: [b.min[0] + 1, b.max[1], b.min[2] + 1],
        max: [b.min[0] + 3, b.max[1] + .65, b.min[2] + 2], name: b.name, kind: 'roof' });
      if (i < 2 || (d.id === 'maple' && [2, 4, 5, 6].includes(i))) {
        const text = d.id === 'maple' ? ['MAPLE', 'STUDIO', 'CAFE', '', 'RADIO', 'HOTEL', 'RECORDS'][i] : b.name.split(' ')[0].toUpperCase();
        scene.coarse.push({ min: [b.max[0], 2, b.max[2] + .15],
          max: [b.max[0] + .7, Math.min(b.max[1] - .2, 2.4 + text.length * .5), b.max[2] + .4], name: text, kind: 'sign', detail: b.detail });
      }
      if ((d.id === 'market' || d.id === 'arts') || (d.id === 'maple' && [2, 4, 6].includes(i)))
        scene.coarse.push({ min: [b.min[0] + .2, 2, b.max[2]], max: [b.max[0] - .2, 2.4, b.max[2] + .8], name: b.name, kind: 'awning', tint: d.color });
    }
    // Streets are shared by adjacent blocks. Street furniture stays on the sidewalks.
    for (const x of [-17.3, 17.3]) for (const z of [-17.3, 3.5, 17.3]) scene.lamps.push([d.x + x, 0, d.z + z]);
    // One neighborhood marker beside each south entrance, readable from the street.
    prop(2.9, 16.5, .12, .12, 3, `${d.name} wayfinding post`, 'metal');
    scene.coarse.push({ min: [d.x + 2.6, 2, d.z + 16.6], max: [d.x + 3.3, 3.6, d.z + 16.8], name: d.code, kind: 'sign', detail: `${d.name}: ${d.description}` });
  }
  // The river occupies a new waterfront outside the existing street grid.
  // Its open eastern lip meets a falling sheet, with no retaining wall across it.
  world.blocks[0].coarse.push(
    { min: [-66, -12, -66], max: [66, -.06, 76], name: 'City escarpment', kind: 'cliff',
      detail: 'Layers of stone beneath the city and its riverside.' },
    { min: [RIVER.west, 0, RIVER.north], max: [RIVER.east, RIVER.surface, RIVER.south],
      name: 'Skyline River', kind: 'river', detail: 'An eastward current follows the southern waterfront, then spills over the city edge.' },
    { min: [RIVER.east, RIVER.bottom, RIVER.north], max: [RIVER.east + .45, RIVER.surface, RIVER.south],
      name: 'Infinity Falls', kind: 'waterfall', detail: 'The river slips over an open stone lip and falls into the mist below.' },
    ...[-66, 3].flatMap(x => [
      { min: [x, 0, 65.65] as Vec, max: [x === -66 ? -3 : 66, .32, 66] as Vec, name: 'River embankment', kind: 'prop', finish: 'paint' as const, tint: '#919c90' },
      { min: [x, 0, 76] as Vec, max: [x === -66 ? -3 : 66, .25, 76.35] as Vec, name: 'Outer riverbank', kind: 'prop', finish: 'paint' as const, tint: '#919c90' },
    ]),
    { min: [-66.3, 0, 66], max: [-66, .25, 76.35], name: 'River headwall', kind: 'prop', finish: 'paint', tint: '#919c90' },
  );
  const waterfront = world.blocks[0].coarse;
  const yardProp = (b: Box, solid = true) => { waterfront.push(b); if (solid) world.colliders.push(b); };
  yardProp({ min: [-3, -.4, 64], max: [3, .35, 78], name: 'Visitor Bridge', kind: 'bridge', detail: 'Cross the river to leave your name in the visitor yard.' }, false);
  yardProp({ min: [-24, -12, 76.35], max: [24, -.06, 108], name: 'Visitor garden island', kind: 'cliff' }, false);
  for (const x of [-3, 2.85]) {
    yardProp({ min: [x, .35, 64], max: [x + .15, 1.25, 78], name: 'Bridge railing', kind: 'prop', finish: 'wood' });
  }
  for (const x of [-23.8, 23.5]) yardProp({ min: [x, 0, 76.4], max: [x + .3, .65, 108], name: 'Garden wall', kind: 'prop', finish: 'paint', tint: '#919c90' });
  yardProp({ min: [-24, 0, 107.6], max: [24, .65, 108], name: 'Garden wall', kind: 'prop', finish: 'paint', tint: '#919c90' });
  yardProp({ min: [-1.1, 0, 86], max: [1.1, 1.25, 87.2], name: 'Leave your name', kind: 'visitor-pedestal', detail: 'Leave a name slate to mark your visit.' });
  for (const x of [-21, 21]) for (const z of [80, 104]) {
    yardProp({ min: [x - .15, 0, z - .15], max: [x + .15, 3, z + .15], name: 'Willow trunk', kind: 'prop', finish: 'wood' });
    yardProp({ min: [x - 1.4, 2.2, z - 1.4], max: [x + 1.4, 4, z + 1.4], name: 'Willow canopy', kind: 'foliage' }, false);
  }
  // Flush stone slots keep all garden aisles walkable, independent of loaded pages.
  for (let i = 0; i < 48; i++) {
    const [x, , z] = slatePosition(i);
    yardProp({ min: [x - 1.55, .01, z - .95], max: [x + 1.55, .08, z + .95], name: 'Empty slate setting', kind: 'slate-empty' }, false);
  }
  return world;
}

export function slatePosition(slot: number): Vec {
  const column = slot % 8;
  return [(column < 4 ? -17.5 + column * 4 : 5.5 + (column - 4) * 4), 0, 83 + Math.floor(slot / 8) * 4];
}
