import type { Box, Vec } from './city';

export type Material = 'brick' | 'stone' | 'concrete' | 'glass' | 'metal';
export type Facade = {
  floorHeight: number; windowWidth: number; windowGap: number;
  windowHeight: number; margin: number; entranceOffset: number; shopfront: boolean;
};
export const DEFAULT_FACADE: Facade = {
  floorHeight: 2.7, windowWidth: 1.1, windowGap: .9,
  windowHeight: 1.35, margin: .8, entranceOffset: .5, shopfront: false,
};
const profiles: Array<[Material, Partial<Facade>]> = [
  ['brick', { windowWidth: .95, windowGap: .9, shopfront: true, entranceOffset: .72 }],
  ['metal', { windowWidth: 1.7, windowGap: .55, windowHeight: 1.6 }],
  ['brick', { floorHeight: 2.5, windowWidth: 1.8, windowGap: .6, shopfront: true, entranceOffset: .24 }],
  ['stone', { floorHeight: 3.1, windowHeight: 1.8, windowWidth: 1.45, windowGap: 1.05 }],
  ['metal', { windowWidth: 1.45, windowGap: .55, shopfront: true }],
  ['stone', { floorHeight: 3, windowWidth: 1.05, windowGap: .75, windowHeight: 1.7 }],
  ['brick', { windowWidth: 1.35, windowGap: .5, shopfront: true, entranceOffset: .75 }],
  ['concrete', { windowWidth: 2.15, windowGap: .55, shopfront: true }],
  ['glass', { floorHeight: 2.5, windowWidth: 2, windowGap: .28, windowHeight: 1.9, margin: .3 }],
  ['concrete', { windowWidth: 1.5, windowGap: .8, shopfront: true }],
];
export function describeBuildings(boxes: Box[]): Box[] {
  return boxes.map((b, i) => ({ ...b, material: profiles[i][0], facade: { ...DEFAULT_FACADE, ...profiles[i][1] }, seed: i + 1 }));
}
export function windowAt(b: Box, u: number, v: number, width: number) {
  const f = b.facade ?? DEFAULT_FACADE, first = b.min[1] > 0 ? .5 : f.floorHeight;
  const column = Math.floor((u - f.margin) / (f.windowWidth + f.windowGap));
  const floor = Math.floor((v - first) / f.floorHeight);
  const left = f.margin + column * (f.windowWidth + f.windowGap), bottom = first + floor * f.floorHeight;
  return {
    inside: column >= 0 && floor >= 0 && left + f.windowWidth <= width - f.margin + .001 &&
      bottom + f.windowHeight < b.max[1] - b.min[1] - .15 && u >= left && u < left + f.windowWidth && v >= bottom && v < bottom + f.windowHeight,
    column, floor,
  };
}
export function windowIsLit(seed: number, floor: number, column: number): boolean {
  const hash = Math.imul(seed + 11, 374761393) ^ Math.imul(floor + 7, 668265263) ^ Math.imul(column + 3, 1274126177);
  return (hash >>> 0) % 5 < 3;
}
const mod = (n: number, m: number) => ((n % m) + m) % m;
export function materialGlyph(material: Material, u: number, v: number): string {
  switch (material) {
    case 'brick': return mod(v, .65) < .075 ? '-' : mod(u + Math.floor(v / .65) % 2 * .65, 1.3) < .065 ? ':' : ' ';
    case 'stone': return mod(v, 1.35) < .09 ? '_' : mod(u + Math.floor(v / 1.35) % 2 * 1.1, 2.2) < .07 ? '|' : mod(Math.floor(u * 3) + Math.floor(v * 3), 7) === 0 ? '.' : ' ';
    case 'concrete': return mod(u, 3.2) < .08 ? '|' : mod(v, 2.7) < .07 ? '_' : mod(Math.floor(u * 3) + Math.floor(v * 3), 11) === 0 ? '.' : ' ';
    case 'metal': return mod(u, .65) < .09 ? '|' : mod(v, 2.4) < .075 ? '-' : ' ';
    case 'glass': return mod(u + v * .45, 2.4) < .13 ? '/' : ' ';
  }
}
export function createScenery(buildings: Box[]): Box[] {
  const solids = [...buildings];
  const add = (parent: Box, min: Vec, max: Vec, kind: string, material: Material = parent.material ?? 'metal') => {
    solids.push({ ...parent, min, max, kind, material });
  };
  buildings.forEach((b, i) => {
    const [x, , z] = b.min, [X, h, Z] = b.max;
    if (i % 3 === 0) add(b, [x + 1.2, h, z + 1.3], [x + 3.7, h + .7, z + 2.5], 'roof', 'metal');
    if ([2, 4, 6].includes(i)) add(b, [x + .3, 2, Z], [X - .3, 2.45, Z + .9], 'awning');
  });
  const maple = buildings[0];
  add(maple, [-14.8, 12, -14.8], [-10.2, 14.6, -8.2], 'building');
  add(maple, [-15, 11.85, -15], [-10, 12.1, -8], 'roof', 'concrete');
  const library = buildings[3];
  add(library, [6.5, 3.25, -10], [12.5, 3.65, -8.5], 'canopy', 'stone');
  for (const x of [6.6, 9.3, 12]) add(library, [x, 0, -9.1], [x + .4, 3.25, -8.7], 'column', 'stone');
  const hotel = buildings[5];
  for (const h of [3, 6, 9]) add(hotel, [-10.1, h, 5], [-8.95, h + .22, 7.6], 'balcony', 'stone');
  for (const [i, text] of [[0, 'MAPLE'], [2, 'CAFE'], [4, 'RADIO'], [5, 'HOTEL'], [6, 'RECORDS']] as [number, string][]) {
    const b = buildings[i], h = Math.min(b.max[1] - .3, 2.4 + text.length * .6);
    solids.push({ min: [b.max[0], 2, b.max[2] + .2], max: [b.max[0] + .9, h, b.max[2] + .45], name: text, kind: 'sign', detail: b.detail, material: 'metal' });
  }
  for (let i = 0; i < 3; i++) solids.push({min:[-12+i*4,0,23],max:[-9.4+i*4,1,24.15],name:'Parked car',kind:'car',detail:'A parked neighborhood runabout.'});
  solids.push({min:[-18.7,0,8],max:[-17.6,1.1,9.8],kind:'vendor',name:'Juniper coffee cart',material:'metal',detail:'Coffee and newspapers beside the hotel.'});
  solids.push({min:[-18.9,2.2,7.8],max:[-17.4,2.4,10],kind:'awning',name:'Juniper coffee cart',material:'metal'});
  return solids;
}

// Each 42-unit segment ends at a crossing: travel for 14s, yield for 3s.
export function trafficProgress(seconds: number, index: number) {
  const phase = mod(seconds + index * 11.3, 68), segment = Math.floor(phase / 17), within = mod(phase, 17);
  return { distance: 21 + segment * 42 + Math.min(within, 14) * 3, waiting: within >= 14 };
}
export function residentProgress(seconds: number, index: number) {
  const t = seconds + index * 2.3, within = mod(t, 24);
  return { distance: Math.floor(t / 24) * 18 + Math.min(within, 20) * .9 + index * 10, waiting: within >= 20 };
}
export function lightPhase(minutes: number): 'night' | 'dawn' | 'day' | 'dusk' {
  if (minutes < 330 || minutes >= 1170) return 'night';
  if (minutes < 450) return 'dawn';
  if (minutes >= 1020) return 'dusk';
  return 'day';
}
