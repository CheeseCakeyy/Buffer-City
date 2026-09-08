# ASCII City: how the first block works

Run locally: npm install, then npm run dev. Production build: npm run build.
Math checks: node verify.mjs. Type checking: npx tsc --noEmit.

## The three layers
1. Simulation: positions, building volumes, routes and a clock.
2. Camera: transforms between the world and the viewing plane.
3. Renderer: samples visible surfaces and draws characters.

The world uses X and Z for the ground plane, and Y for height. A building
has a minimum and maximum corner, not an ASCII drawing. All ten buildings
are axis-aligned boxes. Small rooftop boxes add silhouette detail.

## Camera and rays
The camera is orthographic, pitched down atan(1 / sqrt(2)) = 35.264 degrees.
At the default 45-degree yaw this gives the familiar isometric view.
Rotating keeps an orthographic view, although other yaw angles are not
strictly isometric.

A character occupies 7 by 11 CSS pixels. The ray starts at the center of
that cell. Accounting for the rectangular cell dimensions prevents the
world from being stretched as though letters were square pixels.

Let C be the center of a plane in front of the camera, R its right vector,
U its up vector, and D its forward direction. For screen offsets u and v:

    O = C + u R + v U
    P(t) = O + t D

All cell rays share D; each has a different O. A perspective camera would
instead usually share the camera origin and vary ray direction per cell.

## Ray–box intersection
For each axis, solve the ray equation at the two box boundaries:

    t1 = (minimum - origin) / direction
    t2 = (maximum - origin) / direction

Sort each pair into entry and exit. Across all three axes take the latest
entry and earliest exit. If entry exceeds exit, the ray misses the box.
Parallel rays are handled separately to avoid division by zero. If the
origin is inside a box, use the positive exit. The axis which produces the
entry also gives the face normal.

Ground intersection uses t = -origin.y / direction.y. The nearest positive
intersection among the ground and all objects wins. That implements
occlusion: objects behind a wall cannot replace its character.

This is one ray per character cell, not one ray per vertical screen column.
It does not use DDA grid traversal, triangle meshes, shadow rays, reflected
rays, or a rasterized 3D image followed by an ASCII postprocess.

## Surface to character
The hit point gives local surface coordinates. Repeating modular patterns
define windows and road markings without image textures. Proximity to the
box boundaries marks architectural edges. A fixed directional sun uses
max(0, normal dot light) to choose the wall ink tone. The current prototype
uses an approximate light vector and an abrupt day/night threshold rather
than physically based illumination. Night changes the background and
lights a deterministic subset of windows.

This is architectural glyph mapping, not simply brightness to characters.
A generic luminance renderer might map brightness through " .:-=+*#%@".
Here roofs, edges, walls, windows, people and roads have different rules.

Depth mode exposes ray distance as grayscale. Normals mode colors the
surface orientation. These modes make the intermediate renderer data
visible, but are not alternate physics simulations.

## Walking and city routines
Input is transformed using the camera yaw, so up moves up the ground plane
on screen. The player moves in X/Z, with a 0.35-unit collision margin.
Each movement axis is checked separately, allowing sliding along walls.
The camera follows 65 percent of the player displacement.

Six vehicles follow a perimeter loop at fixed speed; twelve residents
follow a sidewalk loop. They do not pathfind, avoid the player, obey signals,
or make decisions. Their 3D boxes participate in visibility just like
buildings. Simulation dt is capped at 50 ms to prevent jumps after stalls.
The city clock advances four minutes per simulated second. Pause freezes
routes and the clock, while walking and the camera remain available.

Pointer inspection casts one ray from the clicked location and reports
the closest object's name. Collision is separate from that picking ray and
from rendering rays.

## Scope and next steps
This is an exterior exploration prototype: no interiors, economy, traffic
collisions, persistent saves or unlimited world generation yet.

The renderer currently checks every object for every cell: O(cells * objects).
The next scaling step is spatial partitioning (a grid or bounding-volume
hierarchy), plus cached static samples and a glyph atlas. Larger cities
will also need road graphs, pathfinding, chunk streaming and simulation
levels of detail.

## Verification
The production build and TypeScript check pass. verify.mjs checks parallel
and backward rays, hits from inside boxes, surface normals, walkable roads,
building collision margins and world boundaries. Browser interaction,
visual appearance and device performance have not been manually verified.
Optional WebMCP registration is feature-detected; no supported validation
context was available in this run.

## Second-pass renderer and navigation
Street view now uses a 27-degree orthographic camera and a 40-unit span.
The overview retains 35.264 degrees. Camera focus eases toward the player.
Drag horizontally or hold Q/E to orbit, Shift to run, and Home to reset.

After the surface ray pass, projected world-space line segments draw window
frames, façade divisions, roof outlines, aerials, curb seams and lamps.
Each character compares its interpolated depth against the nearest ray hit,
with a small tolerance for the finite size of a character cell. This is a
hybrid raycast surface / projected line renderer. Car cabins, lamps and
aerials are decorative linework rather than collision volumes. Signs use
vertical text. The player HUD marker intentionally ignores depth.

Clicking walkable ground performs breadth-first search on a half-unit grid.
The route avoids building footprints including the player clearance margin.
Manual movement cancels the route; this search does not model moving cars.
