'use client';

import { useState } from 'react';
import { DISTRICTS } from '../../lib/city-world';
import s from './guide.module.css';

const chapters = ['A world of boxes', 'A screen of cells', 'First hit wins', 'The moving camera', 'From 3D to 2D', 'One frame at a time'];
const glyphs = [['_', 'Roof edge', 'A hit close to a horizontal roof boundary.'], ['|', 'Wall edge', 'A hit near the vertical end of a wall.'], ['#', 'Lit window', 'A window bay chosen to glow amber.'], ['~', 'Water', 'A repeating pattern sampled on a water surface.'], ['&', 'Foliage', 'Leaf patterns sampled from the tree canopy.'], ['o', 'A person', 'A small character used for a pedestrian’s head.']];

function Chapter({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <section id={`chapter-${n}`} className={s.chapter}><div className={s.chapterHeading}><span>0{n}</span><h2>{title}</h2></div>{children}</section>;
}

export function FieldGuide() {
  const [district, setDistrict] = useState(4);
  const [width, setWidth] = useState(800);
  const [rayY, setRayY] = useState(130);
  const [glyph, setGlyph] = useState(2);
  const [player, setPlayer] = useState(0);
  const [focus, setFocus] = useState(0);
  const [perspective, setPerspective] = useState(true);
  const [depth, setDepth] = useState(10);
  const d = DISTRICTS[district];
  const hit = rayY >= 90 && rayY <= 195 ? 'wall' : rayY >= 45 && rayY <= 210 ? 'tree' : 'nothing';
  const hitX = hit === 'wall' ? 240 : hit === 'tree' ? (rayY <= 150 ? 420 : 447) : 530;
  const scale = perspective ? 100 / depth : 10;
  const screenX = 400 + 4 * scale, screenY = 250 - 2 * scale;
  const movePlayer = (next: number) => {
    setPlayer(next);
    // Apply one 1/30-second step of the city's actual dead-zone equation.
    const distance = Math.abs(next - focus);
    if (distance > 3) setFocus(focus + (next - focus) * ((distance - 3) / distance) * (1 - Math.exp(-7 / 30)));
  };
  return <div className={s.guide}>
    <nav className={s.topbar} aria-label="Page navigation"><a href="/" className={s.wordmark}>ascii city <span>/ field notes</span></a><a href="/" className={s.back}>↖ Back to the city</a></nav>
    <div className={s.hero}>
      <div><p className={s.kicker}>FIELD GUIDE 001 · UNDER THE CHARACTERS</p><h1>A real world.<br />A <em>text</em> lens.</h1><p className={s.lede}>A tiny city, drawn with a typewriter. Follow one character all the way from a box in 3D space to a mark on your screen.</p><a className={s.start} href="#chapter-1">Take it apart <span>↓</span></a></div>
      <div className={s.heroDrawing} aria-label="An ASCII illustration of a city building"><span className={s.diagramLabel}>THE WORLD, THROUGH A CHARACTER GRID</span><pre aria-hidden="true">{`            .__________.
           /__________/|
          |  ##  ##  | |
     _____|  ##  ##  | |
    /____/|          | |
   | ## | |  ##  ##  | |
   |    | |__________|/
   |____|/   .  .  .
 . . . .  @  . . . . .
========     ==========
 . . . . . . . . . . .`}</pre><div className={s.drawingCaption}><span>3 dimensions</span><span>1 character per cell</span></div></div>
    </div>
    <div className={s.layout}>
      <aside className={s.contents}><p className={s.kicker}>IN THIS GUIDE</p>{chapters.map((c, i) => <a key={c} href={`#chapter-${i + 1}`}><span>0{i + 1}</span>{c}</a>)}<div className={s.marginNote}>Start with the pictures.<br />Open “The maths” whenever you want to go deeper.</div></aside>
      <article className={s.article} role="main">
        <div className={s.intro}><span>THE IDEA TO KEEP IN YOUR HEAD</span><p>The computer stores a 3D toy city. Imagine holding a sheet of graph paper in front of it. Each square asks, <em>“What can I see?”</em> The answer becomes a character.</p><div className={s.pipeline}><b>3D boxes</b><span>→</span><b>Camera rays</b><span>→</span><b>ASCII marks</b></div></div>

        <Chapter n={1} title="A world of boxes.">
          <p>The map exists before a single character is drawn. Positions use <code>[x, y, z]</code>: east/west, height, and north/south. Ground level is usually <code>y = 0</code>.</p>
          <div className={s.twoCards}><div className={s.noteCard}><span>WORLD SPACE</span><h3>Units measure the city.</h3><p>A person is about 1.7 units tall. You walk at 4 units per second. A district is 42 units wide. A unit is an imaginary measure, roughly like a metre.</p></div><div className={s.noteCard}><span>SCREEN SPACE</span><h3>Cells hold the drawing.</h3><p>A cell is a little rectangle on your screen. It contains one character. It has no fixed size inside the city: zoom changes how much world it sees.</p></div></div>
          <p>Nine districts sit on a 3 × 3 grid. Buildings are placed relative to their district’s centre, then moved into world coordinates. Think of arranging Lego on nine separate base plates.</p>
          <div className={s.experiment}><div className={s.experimentHeading}><span>01 / TRY IT</span><strong>Move the same building between districts</strong></div><div className={s.mapExperiment}><div className={s.districts}>{DISTRICTS.map((item, i) => <button key={item.id} aria-pressed={district === i} onClick={() => setDistrict(i)}><b>{item.code}</b><small>{item.x}, {item.z}</small></button>)}</div><div className={s.readout} aria-live="polite"><span>{d.identity}</span><h3>{d.name}</h3><p>Place a building 5 units east and 6 units south of this district’s centre.</p><code>({d.x}, {d.z}) + (5, 6)<br /><b>= ({d.x + 5}, {d.z + 6})</b></code></div></div><p className={s.caption}>Top-down view · north is up · the river runs along the south edge; Visitor Yard sits across its bridge.</p></div>
          <details className={s.math}><summary>The maths / storing a building</summary><p>Two opposite corners define a box. Subtract the minimum corner from the maximum to get its dimensions.</p><pre>{`min = [10, 0, 5]     max = [17, 12, 14]
width  = 17 − 10 = 7 units
height = 12 − 0  = 12 units
depth  = 14 − 5  = 9 units`}</pre><p>More detailed objects combine parts. Rotated parts use their own local coordinate frame. The main city ground extends from −66 to +66; roads repeat every 21 units.</p></details>
        </Chapter>

        <Chapter n={2} title="A screen of cells.">
          <p>Now put graph paper over the camera’s view. In this city, each character cell is <strong>5 CSS pixels wide and 9 high</strong>. The renderer samples the centre of each cell.</p>
          <div className={s.experiment}><div className={s.experimentHeading}><span>02 / TRY IT</span><strong>Give the drawing a wider screen</strong></div><label className={s.slider}>Canvas width <output>{width} px</output><input type="range" min="400" max="1200" step="100" value={width} onChange={e => setWidth(+e.target.value)} /></label><div className={s.cellDemo}><div className={s.cellSwatch} aria-hidden="true">{Array.from({length: 60}, (_, i) => <span key={i}>{i % 7 === 0 ? '#' : i % 4 === 0 ? '|' : '.'}</span>)}</div><div className={s.bigNumber}>{((width / 5) * 50).toLocaleString()}<span>cells in a 450 px tall canvas</span></div></div><p className={s.caption}>{width} ÷ 5 = {width / 5} columns · 450 ÷ 9 = 50 rows. Idealised count; the renderer adds a small border for panning.</p></div>
          <p>Zooming in does not make the cells larger. It lets each cell see a smaller piece of the world, so more cells describe a window or roof. A world-anchored grid helps the drawing stay steady while the camera pans.</p>
        </Chapter>

        <Chapter n={3} title="First hit wins.">
          <p>Every cell sends an imaginary laser into the city. The first surface it touches wins. If a wall is in front of a tree, the wall hides the tree. The renderer remembers that hit distance in a <strong>depth buffer</strong>.</p>
          <div className={s.experiment}><div className={s.experimentHeading}><span>03 / TRY IT</span><strong>Aim one ray through the scene</strong></div><svg className={s.rayDiagram} viewBox="0 0 580 250" role="img" aria-label={`Side-view ray hits ${hit}. The wall is closer than the tree.`}><path d="M25 215H555" stroke="#42594e" /><rect x="240" y="90" width="70" height="105" fill="#30443a" stroke="#9bac96" /><text x="251" y="237">wall</text><rect x="447" y="145" width="10" height="65" fill="#64785b" /><rect x="420" y="45" width="65" height="105" fill="#354e3e" stroke="#9bac96" /><text x="435" y="237">tree</text><line x1="55" y1={rayY} x2="540" y2={rayY} stroke="#657169" strokeDasharray="4 6" /><line x1="55" y1={rayY} x2={hitX} y2={rayY} stroke="#edbe78" strokeWidth="2" /><circle cx="55" cy={rayY} r="6" fill="#edbe78" /><circle cx={hitX} cy={rayY} r="5" fill="#edbe78" /><text x="26" y="27">CELL RAY →</text></svg><label className={s.slider}>Ray height in this diagram <output>{hit === 'nothing' ? 'No surface → blank cell' : `First hit: ${hit} → ${hit === 'wall' ? '.' : rayY <= 150 ? '&' : '|'}`}</output><input type="range" min="25" max="220" value={rayY} onChange={e => setRayY(+e.target.value)} /></label><p className={s.caption}>A simplified side view: solid silhouettes stand in for the 3D boxes. Dashed ray segments show the path beyond the first hit.</p></div>
          <h3>Then the surface gets a letter.</h3><p>The hit tells us the object type, its surface direction and the exact place we touched. Those facts choose a glyph and a colour. This is geometry drawn as text, rather than a finished image converted with an ASCII filter.</p><div className={s.glyphPicker}>{glyphs.map(([mark, label], i) => <button key={label} aria-label={label} aria-pressed={glyph === i} onClick={() => setGlyph(i)}>{mark}</button>)}</div><p className={s.glyphDescription} aria-live="polite"><strong>{glyphs[glyph][1]}</strong> {glyphs[glyph][2]}</p>
          <p>Windows repeat in approximately 2-unit bays and 2.7-unit floors. Their positions belong to the wall, so they stay attached as you move. The city now uses a permanent dark palette; selected windows glow amber.</p>
          <details className={s.math}><summary>The maths / a ray and its nearest hit</summary><pre>{`P(t) = O + tD
O = ray origin     D = ray direction
Choose the smallest positive hit parameter t.
hitPoint = O + D × t`}</pre><p>The same depth information also hides projected window frames, signs and other details behind nearer surfaces. The amber player marker deliberately remains visible through walls.</p></details>
        </Chapter>

        <Chapter n={4} title="Let the camera catch up.">
          <p>The player and the camera’s focus are separate. In the city drawing, the player gets a <strong>three-unit circle of freedom</strong>. Small steps leave the camera still. Beyond that circle, the focus slides after you.</p>
          <div className={s.experiment}><div className={s.experimentHeading}><span>04 / TRY IT</span><strong>Walk out of the camera’s comfort zone</strong></div><svg viewBox="0 0 580 150" className={s.followDiagram} role="img" aria-label={`Player at ${player.toFixed(1)} units; focus at ${focus.toFixed(1)} units`}><line x1="40" y1="78" x2="540" y2="78" stroke="#42594e" /><rect x={290 + focus * 20 - 60} y="40" width="120" height="76" rx="38" fill="#293d32" stroke="#6f8c77" strokeDasharray="4 5" /><circle cx={290 + focus * 20} cy="78" r="5" fill="#9dbcb0" /><text x={290 + focus * 20} y="27" textAnchor="middle">focus</text><text x={290 + player * 20} y="88" textAnchor="middle" className={s.player}>@</text><text x="290" y="140" textAnchor="middle">← 3 units either side of focus →</text></svg><label className={s.slider}>Player position <output>{player.toFixed(1)} units</output><input type="range" min="-10" max="10" step="0.5" value={player} onChange={e => movePlayer(+e.target.value)} /></label><div className={s.demoActions}><button onClick={() => movePlayer(player)}>Advance camera 1 frame</button><button onClick={() => { setFocus(0); setPlayer(0); }}>Reset demo</button><span>Distance from focus: {Math.abs(player - focus).toFixed(1)}</span></div><p className={s.caption}>Each slider change or button press advances one camera step at 30 fps. In the city, these steps happen continuously.</p></div>
          <div className={s.cameraList}><div><b>01 / City drawing</b><p>Parallel rays give an architectural view. The camera looks down at 27° from 180 units behind its focus. Zoom changes the visible world span.</p></div><div><b>02 / Through your eyes</b><p>The camera sits 1.65 units above the player’s ground height. Rays fan out from your eyes; scrolling adjusts the field of view.</p></div><div><b>03 / Follow behind</b><p>The camera starts near the player at a height of 1.1 units, then pulls back by about 5.5 units. It moves closer when a wall gets in the way.</p></div></div>
          <p>Dragging turns the camera; Q and E rotate it by 22.5°. Whole-city mode uses a 35.3° downward view, a 195-unit span and a focus shifted south to include the river and yard.</p><details className={s.math}><summary>The maths / smooth following</summary><pre>{`if distance > 3:
  amount = ((distance − 3) / distance)
           × (1 − exp(−dt × 7))
  focus += (player − focus) × amount`}</pre><p><code>dt</code> is the time since the last simulation step. The camera moves only a fraction of the excess distance each time.</p></details>
        </Chapter>

        <Chapter n={5} title="Three dimensions. Two coordinates.">
          <p>How does a point in the city find a place on a flat screen? First subtract the camera position. Then measure how far the point is to the camera’s <strong>right</strong>, <strong>up</strong> and <strong>forward</strong>. Those measurements are horizontal position, vertical position and depth.</p>
          <div className={s.experiment}><div className={s.experimentHeading}><span>05 / TRY IT</span><strong>Why faraway things look smaller</strong></div><div className={s.demoActions}><button aria-pressed={perspective} onClick={() => setPerspective(true)}>Perspective</button><button aria-pressed={!perspective} onClick={() => setPerspective(false)}>Orthographic</button></div><svg viewBox="0 0 580 240" className={s.projectionDiagram} role="img" aria-label={`A fixed-size object projected at depth ${depth}; scale ${scale.toFixed(1)}`}><path d="M290 20V220M70 120H510" stroke="#3c5246" strokeDasharray="3 6" /><rect x={290 - 4 * scale} y={120 - 4 * scale} width={8 * scale} height={8 * scale} fill="#334537" stroke="#aabd9b" /><text x="290" y="129" textAnchor="middle" fill="#edbe78">##</text><text x="25" y="25">SCREEN</text><text x="25" y="221">same world size · changing depth</text></svg><label className={s.slider}>Depth from camera <output>{depth} units</output><input type="range" min="5" max="30" value={depth} onChange={e => setDepth(+e.target.value)} /></label><div className={s.formula}>{perspective ? `scale = 100 ÷ ${depth} = ${scale.toFixed(2)}` : 'scale = 10 at every depth'}</div><p className={s.caption}>Illustrative focal length: 100 px. In perspective, doubling the depth halves the size. With parallel rays, distance does not change size.</p></div>
          <details className={s.math} open><summary>The maths / follow one point onto the screen</summary><p>A dot product measures a vector along a direction: <code>dot([x,y,z], [a,b,c]) = xa + yb + zc</code>.</p><pre>{`relative = point − camera
horizontal = dot(relative, cameraRight)
vertical   = dot(relative, cameraUp)
depth      = dot(relative, cameraForward)

screenX = centreX + horizontal × scale
screenY = centreY − vertical × scale`}</pre><p>Screen Y grows downward, which is why we subtract vertical height. With a screen centre of (400, 250), horizontal = 4 and vertical = 2, your current settings give:</p><div className={s.formula} aria-live="polite">({screenX.toFixed(1)}, {screenY.toFixed(1)}) pixels → cell ({Math.floor(screenX / 5)}, {Math.floor(screenY / 9)})</div><p>Divide by 5 for a column and 9 for a row, then round down. This simplified example omits the small grid offset used when panning. The city casts rays to find surfaces and projects extra line details into that same grid.</p></details>
        </Chapter>

        <Chapter n={6} title="And then, do it all again.">
          <p>A frame is one complete drawing. The city repeats this sequence many times a second, updating the scene and its view each time.</p><ol className={s.frameSteps}>{[['Move the world', 'Update the player, walking routes, cars, residents and river.'], ['Place the camera', 'Build its right, up and forward directions from yaw and pitch.'], ['Sample the grid', 'Send one ray through each cell and find the closest visible surface.'], ['Choose the marks', 'Use surface position and material to choose a character and colour.'], ['Draw the details', 'Depth-check frames, rails and signs, then draw the player and map.'], ['Reuse and repeat', 'Copy cached character/colour sprites from the glyph atlas for the next drawing.']].map(([title, body], i) => <li key={title}><span>0{i + 1}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol>
          <div className={s.closing}><p className={s.kicker}>BACK THROUGH THE TEXT LENS</p><h2>Now every <em>#</em><br />has a backstory.</h2><p>Walk past a window. Turn the camera. Watch how the marks change while the building stays put.</p><a href="/" className={s.start}>Explore the city <span>↗</span></a></div>
        </Chapter>
        <div className={s.endnote}>Adapted from our conversation about the renderer. Explanations reflect the current dark-only city; the interactive diagrams are simplified teaching models.</div>
      </article>
    </div>
  </div>;
}
