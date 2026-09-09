# How ASCII City works

ASCII City is a small 3D world rendered as text. The world is not stored as a
picture, and the page does not render a normal 3D image and apply an ASCII
filter afterward. Buildings, roads, vehicles, residents, and the player have
positions in a three-dimensional coordinate system. A custom CPU renderer
works out which surface is visible through every character cell and draws one
character into that cell.

The core engine is in [`lib/city.ts`](lib/city.ts). The React page in
[`app/page.tsx`](app/page.tsx) creates the canvases, starts the engine, displays
its statistics, and connects the interface controls. [`app/globals.css`](app/globals.css)
controls the page layout. [`verify.mjs`](verify.mjs) checks geometry,
navigation, and important rendering behavior.

```text
Update world positions
        ↓
Build the camera coordinate system
        ↓
Cast one ray through each character cell
        ↓
Keep the nearest ground or box intersection
        ↓
Convert each visible surface into a glyph and color
        ↓
Project architectural line details into the same grid
        ↓
Draw each final character on a Canvas 2D context
```

## Running and controlling the city

Install dependencies with `npm install` and run the site with `npm run dev`.
The development server is available at `http://localhost:3000/`. Use
`npm run build` for a production build and `node verify.mjs` for the geometry
and navigation checks.

- Click a clear road or sidewalk to walk there.
- Use WASD or the arrow keys to walk manually. Hold Shift to run.
- Drag horizontally or use Q and E to rotate the camera.
- Scroll or use the buttons to zoom.
- **Whole block** switches between the following view and the overview.
- **Find me** recenters the camera without moving the player.
- Home restores the initial player position `(0, 0, 18)` and camera.
- Pause freezes the clock, cars, and residents. Camera and player controls
  continue to work.

## 1. The world is a collection of 3D boxes

The types at the top of `lib/city.ts` describe the basic data:

```ts
type Vec = [number, number, number];

type Box = {
  min: Vec;
  max: Vec;
  name: string;
  kind: string;
  detail?: string;
};
```

X and Z are the two ground axes, and Y is height. A box is represented by its
minimum and maximum corners. Buildings are created in `buildings()` using a
helper whose arguments are ground position, width, depth, height, name, kind,
and description.

```ts
box(-16, -16, 7, 9, 12, 'Maple House', 'building', '...')
```

Maple House begins at `x = -16`, `z = -16`; it is 7 units wide, 9 units deep,
and 12 units high. Ten boxes form the main buildings. `simulate()` adds boxes
for rooftop structures, awnings, signs, parked cars, moving vehicles,
residents, and the player.

Buildings remain axis-aligned. [`lib/street-details.ts`](lib/street-details.ts)
builds people, vehicles, benches and doors from individually shaded solid parts.
Each model has a local coordinate frame and yaw; rays are transformed into that
frame before intersection, then normals are transformed back into the world.
Wheels use capped cylinders within their bounding boxes. Decorative features
such as upper window frames, fire escapes, trees and lamps are mostly 3D lines. These lines are visible
and can be hidden by solid geometry, but they do not necessarily block rays or
movement themselves.

## 2. Simulation updates the world

`City.tick()` runs through `requestAnimationFrame`. On every frame it computes
the elapsed time, caps it at 50 milliseconds to avoid large jumps after a
stall, calls `simulate(dt)`, and then calls `render()`.

`simulate()` advances the clock by four city minutes per simulated second,
reads keyboard input, follows click-to-walk routes, eases the camera focus,
moves cars and residents around deterministic routes, and rebuilds the dynamic
objects. The movement simulation and renderer are separate. Changing
an object's coordinates changes where the renderer finds it on the next frame.

## 3. Orthographic and perspective cameras

The third-person drawing uses the orthographic camera described below. First
person and second person use a perspective camera: rays share an origin at the
camera, and their directions spread across the screen. Projection divides by
forward depth, making distant objects smaller. See [`CAMERA_VIEWS.md`](CAMERA_VIEWS.md)
for controls and how the player is rendered in each view.

`camera()` computes three unit directions: `right` points toward the right side
of the screen, `up` points toward its top, and `direction` points into the
world. Street view uses a 27-degree downward pitch and starts at a 28-degree
yaw. Whole-block mode uses a 35.264-degree pitch. The overview is strictly
isometric only at symmetric yaw angles such as 45 degrees.

This is an orthographic camera. It uses parallel rays, so distant objects do
not become smaller. Every screen cell gets a different ray origin but shares
the same direction.

Let `C` be the center of the camera plane, `R` its right vector, `U` its up
vector, and `D` its viewing direction. For camera-plane offsets `u` and `v`:

```text
O = C + uR + vU
P(t) = O + tD
```

`ray(px, py)` converts a pixel position into a 3D ray origin `O`. `P(t)`
describes every point along that ray, where positive `t` moves into the scene.

The inverse operation is `project(point)`. It converts a 3D point into screen
coordinates using dot products:

```text
screenX = centerX + dot(point - C, R) × scale
screenY = centerY - dot(point - C, U) × scale
depth   = dot(point - C, D)
```

Projection is used for outlines, signs, window frames, the map marker, and
other line details. Zoom changes `scale`, which changes how many screen pixels
represent one world unit.

## 4. One ray is cast through every ASCII cell

The display is divided into cells that are currently 5 CSS pixels wide and 9
CSS pixels high. `render()` casts a ray through the center of every cell.

`trace()` tests that ray against the ground and scene boxes. Ground intersection
uses:

```text
t = -origin.y / direction.y
```

At that distance, the X and Z coordinates must lie inside the city boundary.
The ray is also tested against every relevant box. The smallest positive `t`
wins because it is the first visible surface. This is how a nearby façade hides
a road or another building behind it.

Before casting rays, `buildRowBounds()` projects all eight corners of each box
to find its screen rectangle. In perspective views, edges crossing the camera's
near plane are clipped before computing those bounds. The box is assigned only to rows it can cover.
Each ray then tests boxes whose projected bounds include its cell. This reduces
work without intentionally changing the visibility result.

This is CPU raycasting. It is not the one-ray-per-column method used by early
first-person games, and it does not use a GPU 3D library, triangle
rasterization, or WebGL.

## 5. Ray-box intersection uses the slab method

`intersectBox(origin, direction, box)` treats a box as the overlap of an X
range, Y range, and Z range. On every axis it solves when the ray crosses the
minimum and maximum boundaries:

```text
t1 = (minimum - origin) / direction
t2 = (maximum - origin) / direction
```

After sorting `t1` and `t2`, they describe when the ray enters and exits that
axis's slab. Across all three axes:

```text
near = latest entry
far  = earliest exit
```

If `near > far`, the intervals never overlap and the ray misses. If `far < 0`,
the whole box is behind the ray. When the origin is inside a box, the positive
exit distance is used.

The axis responsible for the final entry or exit determines the surface
normal. A roof has a normal such as `(0, 1, 0)`, while a wall points along
positive or negative X or Z. The normal is used for texture choice, debug
colors, and lighting.

## 6. A visible hit becomes a character

For a successful hit, `render()` calculates the exact world position:

```text
hitPoint = origin + direction × hitDistance
```

It stores `hitDistance` in the depth buffer and sends the hit point and normal
to `glyph()`. `glyph()` chooses a character and color according to the object,
surface direction, position, time of day, and debug mode.

- `_`, `|`, `/`, and `\\` describe edges and directions.
- `.` and spaces create wall and ground texture.
- `-` and `=` make road and crossing markings.
- Amber `#` characters represent lit windows at night.
- `o` and `|` represent residents.

Windows, paving, and surface marks are procedural patterns derived from world
or object coordinates. They stay attached to surfaces as the camera moves;
there are no bitmap texture files.

Directional lighting uses surface normal `N` and a fixed light direction `L`:

```text
brightness = max(0, dot(N, L))
```

The result selects from a small set of colors. It provides directional shading,
but the renderer does not send secondary rays toward the light, so buildings do
not cast ray-traced shadows.

## 7. Details are projected over the raycast surfaces

The raycast pass produces the visible surfaces and fills a depth buffer.
`drawDetails()` creates architectural details from 3D line segments.
`line(a, b, color)` projects each endpoint, samples cells along the projected
line, and selects `_`, `|`, `/`, or `\\` from its screen direction.

Every line sample has an interpolated depth. It is written only when:

```text
lineDepth <= surfaceDepth + 0.65
```

This makes a fire escape disappear behind a nearer building. The tolerance
accounts for a character cell covering an area instead of one infinitely small
pixel. That 0.65 tolerance applies to the distant orthographic drawing;
perspective uses a smaller depth-dependent tolerance from 0.015 to 0.2 to keep
background linework from bleeding through nearby model parts. Lines are clipped
to the screen before sampling, so near-plane crossings do not create thousands
of offscreen samples.

Surface glyphs, details, and labels compete through a priority array. `stamp()`
keeps the higher-priority character for a cell. At the end of the frame,
`render()` calls Canvas 2D's `fillText()` once for every non-empty cell. The
player's `@` marker is drawn afterward so it remains easy to find through
buildings.

The renderer is therefore a hybrid: raycasting determines solid visible
surfaces, and projection adds line-based detail into the same character grid.

## 8. Why the image stays relatively stable during movement

If character sampling were fixed to the screen, a tiny camera movement could
make every cell sample a different part of every wall, making textures shimmer.

The grid is instead anchored to the projected world origin. `render()` takes
the origin's projected screen position modulo the cell width and height. As the
camera follows the player, the grid moves with the drawing and tends to sample
the same world positions. Surface patterns also use world coordinates.

The final display offset is snapped to device pixels, and every grid cell is
painted once. The street-view camera dead zone further reduces unnecessary
movement. Orbiting and zooming alter the projection, so some normal ASCII
aliasing remains during those actions.

## 9. Clicking and navigation

Clicking uses the same camera and intersection system as rendering. `ray()`
creates one picking ray through the pointer position, and `trace()` determines
whether it hit a box or the ground.

A box hit selects that object and displays its description. For a ground hit,
`walkTo()` searches for a route on a half-unit grid using breadth-first search.
`canWalk()` rejects positions outside the world or within a 0.35-unit margin
around a building.

The route is a list of waypoints. The player consumes the available movement
distance across as many waypoints as necessary each frame. Manual movement
cancels the route. X and Z are checked separately, which lets the player slide
along a wall when only one axis is blocked.

The minimap is a separate Canvas 2D drawing. It shows static building
footprints, player position, camera direction, and the remaining route.

## 10. Debug views and current limits

The **How it works** panel exposes three render modes:

- **Ink** displays the finished procedural characters and projected details.
- **Depth** displays the hit distance used for visibility.
- **Normals** colors roofs, X-facing walls, and Z-facing walls differently.

The project currently has no interiors, triangle meshes,
reflections, refractions, cast-shadow rays, save system, physics traffic,
dynamic obstacle avoidance, full resident schedules, or infinite city. See
[`DETAILS.md`](DETAILS.md) for the code areas to change when increasing visual
detail and world complexity.
