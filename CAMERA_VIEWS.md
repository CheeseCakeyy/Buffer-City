# Three views of the same city

Use the Point of view menu beneath the drawing.

- Third person preserves the orthographic 2.5D drawing and whole-block option.
- First person puts the camera at eye height. WASD walks, Q/E or horizontal
  dragging turns, and vertical dragging looks up/down. Scroll changes field of view.
- Second person puts the camera ahead of your character, facing them. W moves
  the character toward the camera; S moves away. Q/E changes their heading and
  repositions the camera. The camera retracts when a building blocks its position.

Orthographic rays share a direction and start at different points across a plane.
Perspective rays all start at the camera, with directions spread across the image.
Each ray hits the closest box or ground surface and chooses one ASCII character.
The world and collision rules are shared by all views.

Perspective projection divides screen position by forward depth. An object twice
as far away appears half as large. Character cells retain their actual pixel aspect
ratio. Lines are clipped at the near plane, with reciprocal-depth interpolation
for occlusion. First person hides the head and torso around the eye, while looking
down reveals your sleeves, hands, trousers and shoes. Second person shows the
complete amber-jacketed character, including a face, hair, backpack and moving
limbs. Both use the same 3D model and world-space materials.

People, cars, buses, benches and doors are built in `lib/street-details.ts`.
Their parts use local coordinates and a shared rotation, so clothing, window
frames, lights and handles stay attached as the model turns. Wheels use capped
cylinders for rounded silhouettes. Benches have real gaps between slats and below
the seat. Doors have solid frames, panels, glazing, thresholds and handles;
they remain closed exterior details. Navigation still uses building footprints.

The third-person grid stays anchored to the world. Perspective uses a fixed screen
grid: changing viewpoint necessarily changes which surface each character samples.
