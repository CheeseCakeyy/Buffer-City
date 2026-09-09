# Detail pass

The 5 × 9 character grid is unchanged. This pass applies the geometry, material,
façade, architectural detail, lighting, activity and performance ideas in details.md.

Building profiles in lib/details.ts specify material, window size, spacing, floor
height and entrance position. Both ray-hit window fills and projected window
frames use these dimensions. Window lighting is a deterministic hash of building,
floor and column, so walking does not reroll the lights.

Maple House gains a setback floor; the library gains a canopy with solid columns;
the hotel gains balcony slabs and rails. These are ordinary boxes in the existing
ray intersection renderer. Rays hit the closest surface, so additional volumes
occlude each other naturally. Column and vendor collisions also affect walking.

Materials sample coordinates on the wall rather than screen coordinates. Brick
mortar, stone joints, concrete panels, metal ribs and glass streaks therefore stay
attached to the building while the camera moves. Fine patterns can still alias
when smaller than a character cell.

Ground shadows cast a second ray toward a fixed sun from each half-unit ground
tile. Results are cached against static scenery and reused across frames. This
is deliberately a ground-only approximation: moving cars do not cast shadows,
and the sun direction does not yet track time. Dawn and dusk tint the paper;
night retains the existing warm windows and lamps.

Static scenery is constructed once. Moving vehicles and residents are rebuilt
each frame, and projected row bounds still update with the camera. Vehicles pause
periodically along the loop; residents pause independently. These are scripted
behaviors, not traffic signals, collision avoidance or resident schedules.

Further experiments from the guide remain: recessed openings, curved geometry,
dynamic shadows, distance haze and caching projected static bounds. They are
separate extensions rather than requirements for this first detail pass.
