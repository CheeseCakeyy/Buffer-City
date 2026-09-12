'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { City, type CityStats } from '../lib/city';
import { DISTRICTS, VISITOR_DISTRICT, SPAWN_POSITION } from '../lib/city-world';
import { VisitorYard } from '../components/visitor-yard';
import { Credits } from '../components/credits';
import type { VisitorSlate } from '../lib/visitor-types';
export default function Home() {
  const map = useRef<HTMLCanvasElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<City | null>(null);
  const [credits, setCredits] = useState(false),
    [paused, setPaused] = useState(false),
    [mode, setMode] = useState('ink');
  const [yardOpen, setYardOpen] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const [slate, setSlate] = useState<VisitorSlate | null>(null);
  const selectSlate = useCallback((selected: VisitorSlate | null) => {
    setSlate(selected); setYardOpen(true);
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
                'Return the player and camera to the south end of Arts Lane by the river.',
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
                return { position: [...SPAWN_POSITION], view: 'default' };
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
      engine.current.paused = paused || credits;
      if (credits) engine.current.keys.clear();
      engine.current.mode = mode;
    }
  }, [paused, mode, credits]);
  return (
    <>
    <main className={uiHidden ? 'city-page ui-hidden' : 'city-page'}>
      <button className="ui-toggle" aria-pressed={uiHidden} onClick={() => {
        setUiHidden(!uiHidden);
        setYardOpen(false);
        engine.current?.keys.clear();
      }}>{uiHidden ? 'Show UI' : 'Hide UI'}</button>
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
          <button onClick={() => { setYardOpen(!yardOpen); }}>Visitor yard</button>
          <a className="guide-link" href="/how-it-works">How it works ↗</a>
          <button className="guide-link" onClick={() => { setYardOpen(false); setCredits(true); }}>Credits ↗</button>
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
          <span className="eyebrow">{stats.identity ?? 'Arts & cafés'} · 3 × 3 CITY</span>
          <strong>{stats.district ?? 'Arts Lane'}</strong>
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

      </section>
      <footer>
        <div>
          <span className="key">W A S D</span> Walk{' '}
          <span className="key">SHIFT</span> Run{' '}
          <span className="key">Q E</span> Turn{' '}
          <span className="key">SCROLL</span> {pov === 'second' ? 'Camera distance' : 'Zoom'}
        </div>
        <div className="footer-actions">
          <select className="render-mode" aria-label="Render information" value={mode} onChange={e => setMode(e.target.value)}>
            <option value="ink">Ink</option>
            <option value="depth">Depth</option>
            <option value="normals">Normals</option>
          </select>
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
        </div>
      </footer>
    </main>
    {credits && <Credits onClose={() => setCredits(false)} />}
    </>
  );
}
