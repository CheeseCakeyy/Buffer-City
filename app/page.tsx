'use client';
import { useEffect, useRef, useState } from 'react';
import { City, type CityStats } from '../lib/city';
export default function Home() {
  const map = useRef<HTMLCanvasElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<City | null>(null);
  const [panel, setPanel] = useState(false),
    [paused, setPaused] = useState(false),
    [mode, setMode] = useState('ink');
  const [stats, setStats] = useState<CityStats>({
    time: '09:00',
    fps: 0,
    cells: 0,
    selected: 'Click a building to inspect it.',
  });
  const overview = stats.overview ?? false;
  useEffect(() => {
    if (!canvas.current) return;
    const city = new City(canvas.current, setStats);
    engine.current = city;
    if (map.current) city.attachMap(map.current);
    const lifecycle = new AbortController();
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (context?.registerTool) {
      try {
        void Promise.resolve(
          context.registerTool(
            {
              name: 'recenter_ascii_city',
              description:
                'Return the player and camera to the starting crossing.',
              inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false,
              },
              annotations: { readOnlyHint: false },
              execute: (input: unknown) => {
                if (
                  !input ||
                  typeof input !== 'object' ||
                  Object.keys(input).length
                )
                  throw new Error('Expected an empty object');
                city.reset();
                return { position: [0, 0, 18], view: 'default' };
              },
            },
            { signal: lifecycle.signal },
          ),
        ).catch(() => {});
      } catch {}
    }
    return () => {
      lifecycle.abort();
      city.destroy();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    if (engine.current) {
      engine.current.paused = paused;
      engine.current.mode = mode;
    }
  }, [paused, mode]);
  return (
    <main>
      <header>
        <div className="brand">
          <div>
            <h1>
              ascii city<span> / maple street</span>
            </h1>
            <p>An inhabited drawing.</p>
          </div>
        </div>
        <div className="header-right">
          <button onClick={() => setPanel(!panel)}>How it works ↗</button>
        </div>
      </header>
      <section className="world" aria-label="Explorable ASCII city">
        <canvas
          ref={canvas}
          tabIndex={0}
          aria-label="Click a street to walk there. WASD or arrows to walk, Shift to run, drag to orbit, Q and E to rotate. Scroll to zoom."
        />

        <div className="clock">
          <strong>{stats.time}</strong>
        </div>
        <div className="legend">
          Click a street to walk · drag to look around
        </div>
        <div className="camera-controls">
          <button
            className={overview ? 'active' : ''}
            onClick={() => {
              engine.current?.setOverview();
            }}
          >
            {overview ? 'Street view' : 'Whole block'}
          </button>
          <button
            aria-label="Rotate left"
            onClick={() => engine.current?.rotate(-1)}
          >
            ↶
          </button>
          <button
            aria-label="Rotate right"
            onClick={() => engine.current?.rotate(1)}
          >
            ↷
          </button>
          <button
            aria-label="Zoom out"
            onClick={() => engine.current?.zoomBy(1.15)}
          >
            −
          </button>
          <button
            aria-label="Zoom in"
            onClick={() => engine.current?.zoomBy(0.87)}
          >
            +
          </button>
          <button
            onClick={() => {
              engine.current?.recenter();
            }}
          >
            Find me
          </button>
        </div>
        <div className="neighborhood-map">
          <span>
            MAPLE STREET <span> N ↑</span>
          </span>
          <canvas
            ref={map}
            width={136}
            height={136}
            aria-label="Neighborhood map showing your location, heading and walking route"
          />
        </div>
        <div className="inspection">
          <p>{stats.selected}</p>
        </div>
        <div className="touch-controls">
          {['↑', '←', '↓', '→'].map((label, i) => (
            <button
              key={label}
              aria-label={'Walk ' + ['up', 'left', 'down', 'right'][i]}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                engine.current?.keys.add(
                  ['arrowup', 'arrowleft', 'arrowdown', 'arrowright'][i],
                );
              }}
              onPointerUp={() => engine.current?.keys.clear()}
              onPointerCancel={() => engine.current?.keys.clear()}
            >
              {label}
            </button>
          ))}
        </div>
        {panel && (
          <aside className="explanation">
            <div className="panel-title">
              <span className="eyebrow">UNDER THE CHARACTERS</span>
              <button
                onClick={() => setPanel(false)}
                aria-label="Close explanation"
              >
                ×
              </button>
            </div>
            <h2>
              A real world.
              <br />A text lens.
            </h2>
            <p>
              The city exists as 3D coordinates. ASCII is how we draw it, not
              how we store it.
            </p>
            <ol>
              <li>
                <h3>01 / Simulate the world</h3>
                <p>
                  Buildings are boxes with width, depth and height. Your
                  position changes with input; cars and residents follow looping
                  routes. A clock controls daylight. These are simple routines,
                  not a full economy or traffic model.
                </p>
              </li>
              <li>
                <h3>02 / Place an orthographic camera</h3>
                <p>
                  Street view looks down at 27°, with a closer camera with a
                  three-unit dead zone. Small movements leave the drawing still;
                  walking farther brings the camera along. Whole block switches
                  to a 35.3° overview. Parallel rays keep far buildings the same
                  size as near ones. Q / E rotates the view; zoom changes the
                  area each cell covers.
                </p>
              </li>
              <li>
                <h3>03 / Cast one ray per cell</h3>
                <p>
                  Imagine graph paper in front of the camera. From the center of
                  every cell, send a line into the scene:{' '}
                  <code>P(t) = O + tD</code>. O is the cell’s starting point; D
                  is the shared viewing direction.
                </p>
                <p>
                  Intersect the ray with building boxes and the ground, then
                  choose the closest positive hit. This is why a façade hides
                  the street behind it.
                </p>
              </li>
              <li>
                <h3>04 / Turn the hit into a glyph</h3>
                <p>
                  The hit position identifies windows, roof edges, paving or
                  lane markings. The surface normal and sun direction give
                  brightness using <code>max(0, N · L)</code>. Edges use /, |
                  and _; surfaces use dots and hatching. Amber marks lit windows
                  and your character.
                </p>
              </li>
              <li>
                <h3>05 / Draw, then repeat</h3>
                <p>
                  A world-anchored sampling grid travels with the drawing as the
                  camera pans. Each cell resolves to one final glyph, preventing
                  overlapping strokes and reducing movement shimmer. The canvas
                  draws the surface glyphs, then projects window frames, roof
                  rails, signs and curb lines into the same character grid. Each
                  line sample checks its depth against the ray buffer, so it
                  disappears behind nearer walls. This is CPU raycasting, not a
                  3D image passed through a text filter. This version has no
                  secondary reflection rays or cast-shadow rays.
                </p>
              </li>
            </ol>
            <p className="render-stats">
              {stats.cells.toLocaleString()} cells · {stats.fps} frames / second
            </p>
            <div className="experiment">
              <h3>See the intermediate information</h3>
              <div className="segmented">
                {['ink', 'depth', 'normals'].map((m) => (
                  <button
                    className={mode === m ? 'active' : ''}
                    key={m}
                    onClick={() => {
                      setMode(m);
                      if (engine.current) engine.current.mode = m;
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <p>
                {mode === 'depth'
                  ? 'Depth: nearer hits are darker. This distance resolves visibility.'
                  : mode === 'normals'
                    ? 'Normals: colors distinguish roofs, X-facing walls and Z-facing walls. Shading uses these surface directions.'
                    : 'Ink: surface details and lighting become architectural character patterns.'}
              </p>
            </div>
            <p>
              Clicking a street casts one picking ray, then searches a half-unit
              walkable grid using breadth-first search. You follow the route
              around buildings; WASD cancels it. Dragging orbits the camera. The
              amber player marker deliberately stays visible through walls so
              you never lose your position.
            </p>
          </aside>
        )}
      </section>
      <footer>
        <div>
          <span className="key">W A S D</span> Walk{' '}
          <span className="key">SHIFT</span> Run{' '}
          <span className="key">Q E</span> Orbit{' '}
          <span className="key">SCROLL</span> Zoom
        </div>
        <div className="footer-actions">
          <span>
            {stats.cells.toLocaleString()} rays / frame · {stats.fps} fps
          </span>
          <button
            onClick={() => {
              const next = !paused;
              setPaused(next);
              if (engine.current) engine.current.paused = next;
            }}
          >
            {paused ? '▶ Resume city' : 'Ⅱ Pause city'}
          </button>
          <button onClick={() => engine.current?.toggleNight()}>
            Day / night
          </button>
        </div>
      </footer>
    </main>
  );
}
