# Adding more detail to ASCII City

More detail can mean more characters on screen, more complex silhouettes,
richer surface patterns, more architectural linework, stronger lighting, or
more activity in the world. Each kind belongs in a different part of
[`lib/city.ts`](lib/city.ts).

A useful order is:

1. Give buildings more distinctive shapes.
2. Add material-aware surface patterns.
3. Add a small number of readable architectural features.
4. Reduce character-cell size if those features need more resolution.
5. Add shadow rays only after measuring the cost of the denser scene.

Smaller characters make the same boxes sharper. They do not create new shape
or character, so geometry and materials usually provide the largest visual
improvement first.

## 1. Increase character resolution

The grid dimensions are fields on the `City` class:

```ts
private cw = 7;
private ch = 12;
```

The matching font is selected in `render()`:

```ts
ctx.font = '12px "Courier New",monospace';
```

Reducing all three values creates more cells and lets small features occupy
more characters. One starting experiment is:

```ts
private cw = 5;
private ch = 9;

// In render()
ctx.font = '9px "Courier New",monospace';
```

Cell width, cell height, and font size should be tuned together. The font's
actual glyph width needs to fit within `cw`, and its visible height should fit
within `ch`.

Performance grows roughly with the number of cells:

```text
ray count ≈ canvas width / cw × canvas height / ch
```

Changing from 7×12 cells to 5×9 cells creates about 1.87 times as many rays on
the same screen. It also enlarges the depth, glyph, color, and priority buffers.
Measure frame rate on desktop and mobile before reducing the cells again.

## 2. Add more expressive solid geometry

Permanent buildings are defined by `buildings()`. Roof equipment, awnings,
signs, vehicles, residents, and the player are assembled in `simulate()`.

A recognizable building can be assembled from multiple boxes: a main body,
narrower upper floor, rooftop room, chimney, entrance canopy, and balcony slab.

Use solid boxes for details that should hide surfaces behind them, receive
procedural surface glyphs, or affect collision. Use projected lines for thin
details such as railings, frames, wires, antennae, and trim. A balcony can use a
box for its slab and lines for its railing.

### Real recesses versus drawn recesses

A dark door pattern can suggest a recessed entrance from one view. A real
recess requires geometry around an opening so that a ray travels farther before
hitting the back wall. Real geometry continues to look correct as the camera
rotates.

### Shapes the current intersection code cannot represent

All boxes are axis-aligned. Rotated walls, sloping roofs, cylinders, arches,
and irregular silhouettes need new primitive types and intersection functions.
Possible additions include spheres for tree crowns, cylinders for poles,
triangles for sloping roofs, and oriented boxes for rotated objects.

Each new primitive needs a ray-intersection routine that returns hit distance
and normal, projected bounds for acceleration, and a material/glyph rule. If it
should block walking, `canWalk()` also needs a matching footprint test.

## 3. Introduce materials and richer surfaces

`glyph()` controls the appearance of raycast surfaces. Adding a material field
would keep appearance separate from object behavior:

```ts
type Material = 'brick' | 'concrete' | 'glass' | 'metal' | 'stone';

type Box = {
  min: Vec;
  max: Vec;
  name: string;
  kind: string;
  detail?: string;
  material?: Material;
};
```

Then `glyph()` can choose brick courses, concrete seams, glass bands, stone
blocks, corrugated metal, asphalt cracks, drains, or worn road markings.

Compute patterns from world coordinates or coordinates local to the box.
Screen-coordinate patterns will slide across surfaces when the camera moves.
For façades, derive horizontal and vertical coordinates like this:

```ts
const u = normal[0]
  ? hitPoint[2] - box.min[2]
  : hitPoint[0] - box.min[0];
const v = hitPoint[1] - box.min[1];
```

`u` measures distance along the wall and `v` measures height. Doors, windows,
panels, and signs can all use this local system.

## 4. Improve windows, doors, and shopfronts

The façade code currently creates repeated windows with fixed spacing and floor
height. Give buildings individual façade settings for `floorHeight`,
`windowWidth`, `windowGap`, `sillHeight`, and an optional `entranceOffset`.
Then a shop can have a broad ground-floor window while apartments use small,
repeated upper windows.

Use `glyph()` for openings and fills because it knows the exact visible surface
position. Use `drawDetails()` for crisp frames, sills, mullions, and awnings.

Night lighting should use a stable hash of building, floor, and window index.
That creates variety without flickering. A slow schedule could make lights
change over time while remaining stable from frame to frame.

## 5. Add architectural linework

`drawDetails()` is the main place for decorative geometry. Helpers such as
`line()`, `outline()`, `label()`, `waterTank()`, and `fireEscape()` show how 3D
points become ASCII samples.

Useful additions include window frames and ledges, doors and entrance steps,
balcony rails, roof parapets, aerials, ducts, ladders, utility wires, signs,
benches, bollards, bicycle racks, trees, and lamp posts.

Keep a clear priority hierarchy in `stamp()`: textures should have low priority,
windows and seams medium priority, and silhouettes, structural edges, and
labels high priority. Empty space is also important for readable ASCII.

Projected lines are tested against the ray depth buffer, so they disappear
behind solids. They do not fill that buffer themselves. If one detail must hide
another detail, it needs solid geometry or a detail pass that can also write
depth.

## 6. Improve lighting and atmosphere

Current lighting evaluates the direction a surface faces:

```text
brightness = max(0, surfaceNormal · lightDirection)
```

Cheap improvements include more brightness levels, dawn and dusk palettes, a
small ambient term, distance haze, and material-dependent highlights.

### Cast shadows

For a hard cast shadow, start another ray just above the visible point and send
it toward the sun:

```text
camera ray finds visible point
            ↓
offset point slightly along its normal
            ↓
cast a ray toward the light
            ↓
any blocking box means the point is in shadow
```

The small offset stops the surface from intersecting itself. A shadow ray for
every visible cell can almost double intersection work. Lower-cost alternatives
include casting only on every second cell, caching static shadows until the sun
changes, or projecting simple building footprints onto the ground.

Reflection, refraction, soft shadows, and indirect light would require more
rays and a much larger rendering design. The current engine is a raycaster,
not a path tracer.

## 7. Add more street life and behavior

World activity is controlled in `simulate()` and `route()`. Visual variety can
come from bicycles, delivery carts, resident groups, animals, vendors, or
vehicles with different dimensions.

Behavior changes need more simulation state. Examples include traffic lights,
cars that stop at crossings, residents with destinations and waiting periods,
doors that open on arrival, and day/night activity schedules.

Current actors follow deterministic loops. Dynamic collisions would also
require navigation to account for moving obstacles rather than only the fixed
building list.

## 8. Preserve readability and stability

Every feature competes for one character per cell. Keep textures low priority,
windows and material seams in the middle, and silhouettes and structural edges
high priority. Reserve final overlays for information that must always remain
visible.

Anchor procedural patterns in world or object coordinates and keep the grid
anchored to the projected world origin. These choices prevent texture from
swimming across walls during camera movement.

A feature narrower than one character cell may flicker or disappear during
rotation. Enlarge it, simplify it, or reduce the cell size instead of using a
very high-frequency pattern.

## 9. Performance considerations

More cells and more solid objects multiply the number of intersection tests.
Measure frame time before adding complex acceleration. Likely next steps are:

- Retain and refine the projected row and column bounds.
- Separate static from dynamic geometry so static bounds can be reused.
- Cache results while the camera and scene are unchanged.
- Group boxes into spatial tiles or a bounding-volume hierarchy when object
  counts grow substantially.
- Use larger character cells on small or slow devices.

Compare any acceleration method with exhaustive intersection results in
`verify.mjs`. An optimization must return the same closest hit.

## 10. A practical first detail pass

1. Add `material` and façade settings to boxes or separate building metadata.
2. Assign brick, concrete, glass, or stone to the ten buildings.
3. Give three landmarks an upper floor, canopy, balcony, or roof structure.
4. Add distinct ground-floor doors and shopfronts in `glyph()`.
5. Add frames, sills, rails, and signs in `drawDetails()`.
6. Test day, night, street view, overview, and all camera rotations.
7. Try 6×10 cells, measure performance, and only then consider 5×9.

Cast shadows are a sensible experiment after this pass. They will be more
noticeable once the scene has varied silhouettes for the light to reveal.
