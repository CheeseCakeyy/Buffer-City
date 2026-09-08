# ASCII City — the world behind the drawing

## Run and explore

Run npm install and npm run dev. The local preview is at http://localhost:3000/.
Build with npm run build. Check geometry and navigation with node verify.mjs.

- Click a clear street or sidewalk to walk there.
- WASD / arrows take over manually; Shift runs.
- Drag horizontally or hold Q / E to orbit; scroll to zoom.
- Whole block shows the neighborhood; Find me recenters without teleporting.
- Home restarts the walk at the south crossing, world position (0, 0, 18).
- The small map shows your position, viewing direction and remaining route.
- Pause freezes traffic, residents and time. Walking and camera controls remain available.

## 1. Geometry and simulation

X and Z describe the ground plane; Y is height. Buildings are axis-aligned
boxes stored as minimum and maximum corners. Signs, awnings, roof equipment
and vehicles also have volumes. Window frames, fire escapes, the water tank,
benches, trees and lamps add projected ASCII linework. Some of those details
are decorative: they do not all have solid collision or occlusion geometry.

Ten buildings make up the first block. Six moving vehicles, including Bus 16,
follow a perimeter loop. Twelve residents walk a sidewalk loop. Three cars
are parked. These are deterministic routines, not a traffic or economy model.

The simulation updates positions independently of the renderer. The clock
advances four city minutes per simulated second. Frame dt is capped at 50 ms
to avoid a large jump after a stall or hidden tab.

## 2. An orthographic camera

Street view looks down at 27 degrees with a default yaw of 28 degrees.
This deliberately asymmetric view emphasizes façades and the street.
Whole block uses a 35.264-degree pitch. It is only strictly isometric
when the yaw is also 45 degrees (or a corresponding symmetric angle).

The street view camera stays still within a three-unit movement dead zone.
Beyond that, its focus eases toward the player. Find me recenters that focus;
it does not move the character.

Unlike perspective, an orthographic camera uses parallel rays: far objects
are not made smaller. Let C be the camera-plane center, R its right vector,
U its up vector, and D its forward direction. For screen offsets u and v:

    O = C + u R + v U
    P(t) = O + t D

Each 7 by 12 CSS-pixel character cell has a different O but shares D.
The rectangular cell dimensions are accounted for in projection, avoiding
the distortion that would result from treating characters as square pixels.

## 3. Raycasting and visibility

A ray is a line with a starting point O and direction D. Positive t runs
forward. To intersect it with a box, solve for its two boundaries on each axis:

    t1 = (minimum - origin) / direction
    t2 = (maximum - origin) / direction

Sort each pair into entry and exit. The latest entry across the three axes
must be no later than the earliest exit. Otherwise the ray misses.
Parallel directions are handled explicitly. Rays starting inside a box use
the positive exit. The controlling axis supplies the surface normal.

Ground uses t = -origin.y / direction.y. The nearest positive intersection
wins, so a wall hides the street behind it.

Before sampling, the renderer projects each box's screen bounds and assigns
it to relevant character rows. Each ray tests only boxes whose projected
bounds cover its cell. This changes the work required, not the visibility
answer; regression checks compare it against exhaustive intersections.

This is one ray per character cell, not one ray per vertical screen column.
It does not use Wolfenstein-style 2D DDA traversal, triangle meshes, reflected
rays or cast-shadow rays.

## 4. Surface hits become characters

The hit point gives local façade coordinates. Repeating patterns identify
windows; a surface normal and approximate light direction choose ink tones.
The basic directional-light expression is max(0, normal dot light).
Roofs have a different texture from roads. At night, a deterministic subset
of windows lights up, using the same window bounds as the visible frames.

Architectural line segments are projected into the character grid. Their
interpolated depths are compared with the ray depth buffer. A small tolerance
accounts for each cell covering a finite area. Linework, surface texture
and sign letters compete by priority for one final glyph in each cell.
The player marker deliberately remains visible through buildings.

This is a hybrid raycast-surface and projected-line renderer. It is not
simply a 3D screenshot converted using a brightness ramp such as " .:-=+*#%@".

## 5. Why movement used to shimmer

Previously, camera motion shifted every surface across a fixed screen grid.
Even tiny movement sampled a new patch of each wall. Overlapping line samples
also drew several characters into the same cell, producing heavy corners.

The grid now anchors to the projected world origin. Its screen offset is
the origin's projection modulo cell width/height. When the camera translates,
the glyphs travel with the drawing while sampling the same world positions.
Only the final display offset snaps to device pixels; the geometry sampling
remains world-anchored. Surface patterns also depend on world coordinates.

Each cell is painted once. Combined with the camera dead zone, this reduces
crawling edges during walking. Orbiting and zooming still change the projection,
so some ASCII aliasing during those operations remains.

## 6. Navigation

Clicking casts a single picking ray. For a ground hit, breadth-first search
finds a route on a half-unit grid with a 0.35-unit building-clearance margin.
Movement spends the full frame's distance budget across as many waypoints
as necessary. It no longer loses a frame at every waypoint.

Manual input is transformed by camera yaw. Each ground axis is checked
separately, allowing sliding along buildings. The route map visualizes the
remaining path. Vehicle collisions and dynamic obstacle avoidance are absent.

## Verification and limits

Visual review covered the desktop view at 1280 by 900, the narrow layout at
390 by 844, day/night, walking, orbit dragging, overview and recentering.
The browser reported about 60 fps after the row-bound optimization, compared
with about 33 beforehand in the inspected desktop scene. This is a local
observation, not a cross-device performance guarantee.

Tests cover ray hits/misses and normals, building clearance, reachable and
blocked routes, movement at 30/60/120 Hz, 100 sub-cell camera translations,
and 5,184 accelerated-versus-exhaustive ray comparisons. The page's optional
WebMCP recenter tool was checked with valid and invalid input.

The production build, TypeScript and lint for the city files pass.
Full-repository lint still includes unrelated issues in unused starter
components.

This remains an exterior prototype. No interiors, save system, economy,
full agent schedules, physics traffic, cast shadows or infinite city exist yet.
