# How ASCII City works

ASCII City is a small 3D world rendered as text. The world is not stored as a
picture, and the page does not render a normal 3D image and apply an ASCII
filter afterward. Buildings, roads, vehicles, residents, and the player have
positions in a three-dimensional coordinate system. A custom CPU renderer
works out which surface is visible through every character cell and draws one
character into that cell.

The core engine is in [`lib/city.ts`](frontend/lib/city.ts). The 3×3 neighborhood generator
is in [`lib/city-world.ts`](frontend/lib/city-world.ts), and cached pedestrian navigation
is in [`lib/walking-grid.ts`](frontend/lib/walking-grid.ts). The React page in
[`app/page.tsx`](frontend/app/page.tsx) creates the canvases, starts the engine, displays
its statistics, and connects the interface controls. [`app/globals.css`](frontend/app/globals.css)
controls the page layout. [`verify.mjs`](frontend/verify.mjs) checks geometry,
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
- **Whole city** fits all nine neighborhoods into the orthographic overview.
- Choose a destination in **Walk to a neighborhood**, or click a minimap tile,
  to walk to its southern entrance. These actions create routes, not teleports.
- **Reset view** recenters the camera without moving the player.
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
minimum and maximum corners. `mapleBuildings()` preserves the original central
buildings; `generateWorld()` creates the surrounding blocks. Its local `add()`
helper offsets each shape by its district's X/Z origin. `cityWorld()` caches the
result. The exported `buildings()` function returns the collision collection,
which now includes low solid props as well as buildings.

```ts
box(-16, -16, 7, 9, 12, 'Maple House', 'building', '...')
```

Maple House begins at `x = -16`, `z = -16`; it is 7 units wide, 9 units deep,
and 12 units high. Those ten original buildings remain at the center of a city
with 39 buildings. Permanent roofs, awnings, signs, trees, construction pieces,
ponds and furniture are created once. `simulate()` selects the appropriate
detail level and updates moving vehicles, residents, and the player.

### Nine connected neighborhoods

| North → south | West | Center | East |
| --- | --- | --- | --- |
| North row | CR · Cedar Row: residential | MS · Market Square: commercial | FW · Foundry Works: construction |
| Middle row | JP · Juniper Park: park | MP · Maple Street: mixed use | CQ · Civic Quarter: civic buildings |
| South row | DY · Depot Yard: industrial | GC · Garden Courts: courtyard homes | AL · Arts Lane: galleries and cafés |

District centers are at X/Z = −42, 0, or 42. Each district occupies a 42×42
tile. Perimeter roads are shared with neighbors; central cross streets continue
through the grid. Road centerlines repeat every 21 units, with a 2.4-unit half
width. Ground extends to ±66; the player's center stays inside ±65. Streets,
sidewalks, crossings and open alleys connect the districts without loading screens.

The park has a pond and groves; the construction block has open floors, columns,
a tower crane, barriers and timber; the depot has warehouses, containers and
parked buses. District-specific ground patterns, building colors, signs and
street furniture help distinguish the places even at a distance.

Buildings remain axis-aligned. [`lib/street-details.ts`](frontend/lib/street-details.ts)
builds people, vehicles, benches and doors from individually shaded solid parts.
Each model has a local coordinate frame and yaw; rays are transformed into that
frame before intersection, then normals are transformed back into the world.
Wheels use capped cylinders within their bounding boxes. Decorative features
such as upper window frames, fire escapes and lamps are mostly 3D lines. Trees
now have solid trunks and shaded canopy boxes. The projected lines are visible
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
forward depth, making distant objects smaller. See [`CAMERA_VIEWS.md`](frontend/docs/CAMERA_VIEWS.md)
for controls and how the player is rendered in each view.

`camera()` computes three unit directions: `right` points toward the right side
of the screen, `up` points toward its top, and `direction` points into the
world. Street view uses a 27-degree downward pitch and starts at a 28-degree
yaw. Whole-city mode uses a 35.264-degree pitch. The overview is strictly
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
Each ray then tests boxes whose projected bounds include its cell. Candidates
are ordered by their nearest possible depth; once that depth is beyond the
closest hit, the remaining candidates cannot be visible. Original object order
breaks equal-distance ties. This reduces work without changing visibility.

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
`render()` uses [`lib/glyph-atlas.ts`](frontend/lib/glyph-atlas.ts) to rasterize each
character/color combination once onto a small offscreen canvas. Each non-empty
cell then copies its cached glyph with `drawImage()`. This preserves the font,
color, character spacing and detail while avoiding thousands of repeated text
rasterizations. The cache is rebuilt when the canvas display density changes. The
player's `@` marker is drawn afterward so it remains easy to find through
buildings.

The renderer is therefore a hybrid: raycasting determines solid visible
surfaces, and projection adds line-based detail into the same character grid.

Camera projection constants are calculated once per frame, and the cell loop
reuses ray and hit-position vectors. Model rotations cache their sine and cosine;
box intersection avoids temporary arrays for misses. These optimizations are
especially useful in first-person and follow views, where surfaces cover many
more character cells.

`node benchmark.mjs` profiles three scenes in all three views at 1600×900. It
counts canvas commands and measures CPU work with drawing stubbed, so its frame
times are not browser FPS. Pass an output JSON path to save results; `--reference`
compares against source from Git HEAD. The saved glyph/color hash can be compared
between runs to check that performance changes preserve the displayed content.

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
`walkTo()` asks `WalkingGrid` for a route on a half-unit grid using breadth-first
search. The 265×265 occupancy array is built once from solid footprints and
reused. Typed arrays hold the queue and parent indices, so a long route does not
allocate thousands of string keys or recheck every building for each cell.
`canWalk()` rejects positions outside the world or within a 0.35-unit margin
around a building, tree trunk, pond, or other low solid prop. Moving actors and
detail-only benches/parked vehicles do not participate in pedestrian collision.

The route is a list of waypoints. The player consumes the available movement
distance across as many waypoints as necessary each frame. Manual movement
cancels the route. X and Z are checked separately, which lets the player slide
along a wall when only one axis is blocked.

The minimap is a separate Canvas 2D drawing. It shows static building
footprints, two-letter district codes, player position, camera direction, and the
remaining route. Clicking a map tile routes to a known clear entrance rather
than to a building under the pointer. The neighborhood selector provides the
same action through a keyboard-accessible control, with full district names.

### Keeping the larger world responsive

- `generateWorld()` caches static geometry and detailed models once.
- Doors, benches and parked vehicles activate within 32 units of the player.
  Vehicles use multipart models within 28 units; pedestrians within 26 units.
  Farther actors use coarse shapes, and distant architecture retains its silhouette.
- The overview omits tiny furniture and pedestrians and uses simple vehicles;
  all nine blocks remain present, with fewer than 350 solid parts in total.
- A bounding sphere rejects objects outside the camera view. Surviving boxes
  get conservatively clipped screen bounds. Each row is divided into bins of
  16 character columns; rays test only their bin, sorted from near to far.
- Window linework is limited to nearby, on-screen buildings. The existing
  depth buffer, reusable vectors and glyph atlas remain in use.

`node verify.mjs` checks all 81 district routes, unobstructed street and sidewalk
loops, all camera modes, and accelerated intersections against exhaustive tests.
`node benchmark.mjs outputs/city-profile.json` measures CPU time at 1600×900
for the original crossing, shops and vehicles plus the park, construction site,
market and overview. Drawing commands are stubbed: these are CPU measurements,
not measured browser FPS. A larger skyline and more filled cells still add cost;
actual FPS depends on the device, viewport and browser canvas implementation.

Traffic consists of 27 vehicles following district perimeter loops at radius
20.2. Neighboring blocks use opposite sides of their shared road. There are 64
residents, with extra pedestrians around the market and park. These routes have
no traffic-light logic, intersection yielding, bus schedules, or dynamic collisions.

## 10. Debug views and current limits

The **How it works** panel exposes three render modes:

- **Ink** displays the finished procedural characters and projected details.
- **Depth** displays the hit distance used for visibility.
- **Normals** colors roofs, X-facing walls, and Z-facing walls differently.

The project currently has no interiors, triangle meshes,
reflections, refractions, cast-shadow rays, save system, physics traffic,
dynamic obstacle avoidance, full resident schedules, or infinite city. See
[`DETAILS.md`](frontend/docs/DETAILS.md) for the code areas to change when increasing visual
detail and world complexity.

## Visitor yard and Python backend

The code is split into two independently started services. Everything related to
rendering and the browser lives in `frontend/`. The Python/FastAPI application,
Chroma Cloud adapter, legacy import tools, and tests live in `backend/`.

The browser calls `/api/visitors` on the frontend. A small server-side proxy sends
the request to FastAPI, authenticating with a shared secret and forwarding the
visitor cookie. FastAPI owns all validation, database access, pagination, rate
limits, duplicate protection, and owner moderation. Chroma Cloud stores names,
dates, stable placement sequences, hidden status, and hashed browser/network
identifiers as metadata. A fixed vector avoids running an embedding model.
The API uses a process lock and requires one active writer per collection,
including during deployment and imports. A deterministic visitor UUID makes
retries after uncertain cloud responses reuse the original record. Hourly
network limits are counted from stored slates, so backend restarts do not reset
them. The adapter scans metadata in batches of 300; this is a small-garden
implementation, not a distributed transaction system.

The bridge extends the walkable ground across the river into a separate garden.
Each page has 48 flush stone slots. Only the current page's names are loaded.
Slates keep their complete name: the inscription renderer wraps long names into
lines, centers the block horizontally and vertically, and projects it onto the
stone's top surface. A depth mask keeps nearer geometry in front of the lettering.
This crisp text pass complements the city's ASCII surface rendering.

The backend reads `CHROMA_API_KEY`, `CHROMA_TENANT`, `CHROMA_DATABASE`, and
`CHROMA_COLLECTION` from its environment. No cloud credentials are bundled into
the frontend. Local SQLite/D1 files remain backups only. The explicit
`backend/scripts/import_sqlite.py` importer preserves their IDs, creation times,
positions and shared links without changing the source. Cloud records remain
independent of the Render backend's temporary filesystem.
