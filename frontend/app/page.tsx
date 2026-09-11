'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { City, type CityStats } from '../lib/city';
import { DISTRICTS, VISITOR_DISTRICT } from '../lib/city-world';
import { VisitorYard } from '../components/visitor-yard';
import type { VisitorSlate } from '../lib/visitor-types';
export default function Home() {
  const map = useRef<HTMLCanvasElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<City | null>(null);
  const [panel, setPanel] = useState(false),
    [paused, setPaused] = useState(false),
    [mode, setMode] = useState('ink');
  const [yardOpen, setYardOpen] = useState(false);
  const [slate, setSlate] = useState<VisitorSlate | null>(null);
  const selectSlate = useCallback((selected: VisitorSlate | null) => {
    setSlate(selected); setYardOpen(true); setPanel(false);
  }, []);
  const [stats, setStats] = useState<CityStats>({
    time: '09:00',
    fps: 0,
    cells: 0,
    selected: 'Click a building to inspect it.',
  });
  const overview = stats.overview ?? false;
  const pov = stats.pov ?? 'third';
  const cameraHint = pov === 'second'
    ? 'W forward · S back · A / D sidestep · drag to turn · scroll for distance'
    : pov === 'first'
      ? 'WASD to walk · drag to look around · look down to see your feet'
      : 'Click a street to walk · drag to orbit · scroll to zoom';
  useEffect(() => {
    if (!canvas.current) return;
    const city = new City(canvas.current, setStats);
    engine.current = city;
    city.onVisitorSelect = selectSlate;
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
  }, [selectSlate]);
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
              ascii city<span> / nine blocks</span>
            </h1>
            <p>Nine neighborhoods. One inhabited drawing.</p>
          </div>
        </div>
        <div className="header-right">
          <button onClick={() => { setYardOpen(!yardOpen); setPanel(false); }}>Visitor yard</button>
          <button aria-expanded={panel} aria-controls="city-explanation" onClick={() => { setPanel(!panel); setYardOpen(false); }}>How it works ↗</button>
        </div>
      </header>
      <section className="world" data-pov={pov} aria-label="Explorable ASCII city">
        <canvas
          ref={canvas}
          tabIndex={0}
          aria-describedby="camera-hint"
          aria-label="Click a street to walk there. WASD or arrows to walk, Shift to run, drag to orbit, Q and E to rotate. Scroll to zoom."
        />

        <div className="clock">
          <strong>{stats.time}</strong>
        </div>
        <div className="district-navigation">
          <span className="eyebrow">{stats.identity ?? 'Mixed use'} · 3 × 3 CITY</span>
          <strong>{stats.district ?? 'Maple Street'}</strong>
          <select aria-label="Walk to a neighborhood" value="" onChange={e => {
            engine.current?.visitDistrict(e.target.value);
            canvas.current?.focus({ preventScroll: true });
          }}>
            <option value="" disabled>Walk to a neighborhood…</option>
            {[...DISTRICTS, VISITOR_DISTRICT].map(d => <option key={d.id} value={d.id}>{d.code} · {d.name} / {d.identity}</option>)}
          </select>
        </div>
        <div className="legend" id="camera-hint">
          {cameraHint}
        </div>
        <div className="camera-controls">
          <select aria-label="Point of view" value={pov}
            onChange={e => {
              const next = e.target.value as 'third' | 'second' | 'first';
              engine.current?.setPOV(next);
              setStats(s => ({ ...s, pov: next, overview: false }));
              canvas.current?.focus({ preventScroll: true });
            }}>
            <option value="third">City drawing</option>
            <option value="first">1st · Through your eyes</option>
            <option value="second">2nd · Follow behind</option>
          </select>
          <button
            className={overview ? 'active' : ''}
            onClick={() => {
              engine.current?.setOverview();
            }}
          >
            {overview ? 'Street drawing' : 'Whole city'}
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
            aria-label={pov === 'second' ? 'Move camera farther away' : 'Zoom out'}
            onClick={() => engine.current?.zoomBy(1.15)}
          >
            −
          </button>
          <button
            aria-label={pov === 'second' ? 'Move camera closer' : 'Zoom in'}
            onClick={() => engine.current?.zoomBy(0.87)}
          >
            +
          </button>
          <button
            onClick={() => {
              engine.current?.recenter();
            }}
          >
            Reset view
          </button>
        </div>
        <div className="neighborhood-map">
          <span>
            CITY MAP <span> N ↑</span>
          </span>
          <canvas
            ref={map}
            width={180}
            height={180}
            aria-label="City map. Click a block to walk there, or use the neighborhood selector. Your position and walking route are highlighted."
          />
          <small>Click a block to walk there</small>
        </div>
        <div className="inspection">
          <p>{stats.selected}</p>
        </div>
        {stats.inVisitorYard && !yardOpen && <button className="yard-arrival" onClick={() => selectSlate(null)}>Leave your name on a slate</button>}
        <VisitorYard engine={engine} open={yardOpen} inYard={stats.inVisitorYard ?? false} selected={slate} onSelect={selectSlate} onClose={() => setYardOpen(false)} />
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
              onPointerUp={() => engine.current?.keys.delete(['arrowup', 'arrowleft', 'arrowdown', 'arrowright'][i])}
              onPointerCancel={() => engine.current?.keys.delete(['arrowup', 'arrowleft', 'arrowdown', 'arrowright'][i])}
            >
              {label}
            </button>
          ))}
        </div>
        {panel && (
          <aside className="explanation" id="city-explanation">
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
                  Nine distinct blocks share a street grid. Buildings and props
                  are boxes with width, depth and height. Your
                  position changes with input; cars and residents follow looping
                  routes. A clock controls daylight. These are simple routines,
                  not a full economy or traffic model.
                </p>
              </li>
              <li>
                <h3>02 / Choose a camera</h3>
                <p>
                  First person places a perspective camera at eye height. Follow
                  behind places it above and behind your character: W moves
                  forward, S moves backward, and A / D sidestep left and right.
                  Drag to turn or adjust the camera height; scroll to change its
                  distance. It pulls closer near walls. Perspective rays fan
                  outward and objects shrink with distance. The city drawing
                  keeps parallel rays.
                </p>
                <p>
                  Street view looks down at 27°, with a closer camera with a
                  three-unit dead zone. Small movements leave the drawing still;
                  walking farther brings the camera along. Whole city switches
                  to a 35.3° overview. Parallel rays keep far buildings the same
                  size as near ones. Q / E rotates the view; zoom changes the
                  area each cell covers. Choose a neighborhood or click its map
                  tile to follow a walking route; WASD takes over at any time.
                </p>
              </li>
              <li>
                <h3>03 / Cast one ray per cell</h3>
                <p>
                  Imagine graph paper in front of the camera. From the center of
                  every cell, send a line into the scene:{' '}
                  <code>P(t) = O + tD</code>. O is the starting point and D is
                  the ray direction. The drawing uses parallel rays; perspective
                  rays spread out from a shared camera position.
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
          <span className="key">Q E</span> Turn{' '}
          <span className="key">SCROLL</span> {pov === 'second' ? 'Camera distance' : 'Zoom'}
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
