'use client';

import { useState } from 'react';
import { DISTRICTS } from '../../lib/city-world';
import s from './guide.module.css';
import { BuildingBuilder } from './building-builder';
import { RaySimulation, CameraSimulation, ProjectionSimulation } from './simulations';

const chapters = ['A world of boxes', 'A screen of cells', 'First hit wins', 'The moving camera', 'From 3D to 2D', 'One frame at a time'];
const glyphs = [['_', 'Roof edge', 'A hit close to a horizontal roof boundary.'], ['|', 'Wall edge', 'A hit near the vertical end of a wall.'], ['#', 'Lit window', 'A window bay chosen to glow amber.'], ['~', 'Water', 'A repeating pattern sampled on a water surface.'], ['&', 'Foliage', 'Leaf patterns sampled from the tree canopy.'], ['o', 'A person', 'A small character used for a pedestrian’s head.']];

function Chapter({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <section id={`chapter-${n}`} className={s.chapter}><div className={s.chapterHeading}><span>0{n}</span><h2>{title}</h2></div>{children}</section>;
}

export function FieldGuide() {
  const [district, setDistrict] = useState(4);
  const d = DISTRICTS[district];
  return <div className={s.guide}>
    <nav className={s.topbar} aria-label="Page navigation"><a href="/" className={s.wordmark}>ascii city <span>/ how it works</span></a><a href="/" className={s.back}>↖ Back to the city</a></nav>
    <div className={s.hero}>
      <div className={s.heroCopy}><p className={s.kicker}>THE RENDERER / AN OPEN NOTEBOOK</p><h1>How a city<br />becomes text.</h1><p className={s.lede}>There’s a 3D world behind these characters. Here’s how we build it, look at it, and draw it—one cell at a time.</p><div className={s.heroIndex}><span>01 — Define a box</span><span>02 — Find its visible surfaces</span><span>03 — Give each surface a character</span></div><p className={s.heroHint}>Start with the building on the right. Change its height. Then follow the drawing down the page.</p><a className={s.start} href="#chapter-1">Read the notes ↓</a></div>
      <BuildingBuilder />
    </div>
    <div className={s.layout}>
      <aside className={s.contents}><p className={s.kicker}>CONTENTS</p>{chapters.map((c, i) => <a key={c} href={`#chapter-${i + 1}`}><span>0{i + 1}</span>{c}</a>)}<div className={s.marginNote}>The diagrams run on their own. Pause any of them to look closer.</div></aside>
      <article className={s.article} role="main">


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
          <figure className={s.cellFigure}><div className={s.cellSwatch} aria-hidden="true">{Array.from({length:60},(_,i)=><span key={i}>{i % 7 === 0 ? '#' : i % 4 === 0 ? '|' : '.'}</span>)}</div><figcaption><b>One square. One sample.</b><p>A cell is 5 × 9 CSS pixels. An 800 × 450 canvas holds about 160 columns × 50 rows.</p><strong>8,000 rays per frame.</strong><small>The renderer adds a small border for panning.</small></figcaption></figure>
          <p>Zooming in does not make the cells larger. It lets each cell see a smaller piece of the world, so more cells describe a window or roof. A world-anchored grid helps the drawing stay steady while the camera pans.</p>
        </Chapter>

        <Chapter n={3} title="First hit wins.">
          <p>Every cell sends an imaginary laser into the city. The first surface it touches wins. If a wall is in front of a tree, the wall hides the tree. The renderer remembers that hit distance in a <strong>depth buffer</strong>.</p>
          <RaySimulation />
          <h3>Then the surface gets a letter.</h3><p>The hit tells us the object type, its surface direction and the exact place we touched. Those facts choose a glyph and a colour. This is geometry drawn as text, rather than a finished image converted with an ASCII filter.</p><dl className={s.glyphTable}>{glyphs.map(([mark,label,description])=><div key={label}><dt>{mark}</dt><dd><b>{label}</b><span>{description}</span></dd></div>)}</dl>
          <p>Windows repeat in approximately 2-unit bays and 2.7-unit floors. Their positions belong to the wall, so they stay attached as you move. The city now uses a permanent dark palette; selected windows glow amber.</p>
          <details className={s.math}><summary>The maths / a ray and its nearest hit</summary><pre>{`P(t) = O + tD
O = ray origin     D = ray direction
Choose the smallest positive hit parameter t.
hitPoint = O + D × t`}</pre><p>The same depth information also hides projected window frames, signs and other details behind nearer surfaces. The amber player marker deliberately remains visible through walls.</p></details>
        </Chapter>

        <Chapter n={4} title="Let the camera catch up.">
          <p>The player and the camera’s focus are separate. In the city drawing, the player gets a <strong>three-unit circle of freedom</strong>. Small steps leave the camera still. Beyond that circle, the focus slides after you.</p>
          <CameraSimulation />
          <div className={s.cameraList}><div><b>01 / City drawing</b><p>Parallel rays give an architectural view. The camera looks down at 27° from 180 units behind its focus. Zoom changes the visible world span.</p></div><div><b>02 / Through your eyes</b><p>The camera sits 1.65 units above the player’s ground height. Rays fan out from your eyes; scrolling adjusts the field of view.</p></div><div><b>03 / Follow behind</b><p>The camera starts near the player at a height of 1.1 units, then pulls back by about 5.5 units. It moves closer when a wall gets in the way.</p></div></div>
          <p>Dragging turns the camera; Q and E rotate it by 22.5°. Whole-city mode uses a 35.3° downward view, a 195-unit span and a focus shifted south to include the river and yard.</p><details className={s.math}><summary>The maths / smooth following</summary><pre>{`if distance > 3:
  amount = ((distance − 3) / distance)
           × (1 − exp(−dt × 7))
  focus += (player − focus) × amount`}</pre><p><code>dt</code> is the time since the last simulation step. The camera moves only a fraction of the excess distance each time.</p></details>
        </Chapter>

        <Chapter n={5} title="Three dimensions. Two coordinates.">
          <p>How does a point in the city find a place on a flat screen? First subtract the camera position. Then measure how far the point is to the camera’s <strong>right</strong>, <strong>up</strong> and <strong>forward</strong>. Those measurements are horizontal position, vertical position and depth.</p>
          <ProjectionSimulation />
          <details className={s.math}><summary>The maths / follow one point onto the screen</summary><p>A dot product measures a vector along a direction: <code>dot([x,y,z], [a,b,c]) = xa + yb + zc</code>.</p><pre>{`relative = point − camera
horizontal = dot(relative, cameraRight)
vertical   = dot(relative, cameraUp)
depth      = dot(relative, cameraForward)

screenX = centreX + horizontal × scale
screenY = centreY − vertical × scale`}</pre><p>Screen Y grows downward, which is why we subtract vertical height. With a screen centre of (400, 250), horizontal = 4 and vertical = 2, at depth 10 with a focal length of 100 px, we get:</p><div className={s.formula}>(440, 230) pixels → cell (88, 25)</div><p>Divide by 5 for a column and 9 for a row, then round down. This simplified example omits the small grid offset used when panning. The city casts rays to find surfaces and projects extra line details into that same grid.</p></details>
        </Chapter>

        <Chapter n={6} title="And then, do it all again.">
          <p>A frame is one complete drawing. The city repeats this sequence many times a second, updating the scene and its view each time.</p><ol className={s.frameSteps}>{[['Move the world', 'Update the player, walking routes, cars, residents and river.'], ['Place the camera', 'Build its right, up and forward directions from yaw and pitch.'], ['Sample the grid', 'Send one ray through each cell and find the closest visible surface.'], ['Choose the marks', 'Use surface position and material to choose a character and colour.'], ['Draw the details', 'Depth-check frames, rails and signs, then draw the player and map.'], ['Reuse and repeat', 'Copy cached character/colour sprites from the glyph atlas for the next drawing.']].map(([title, body], i) => <li key={title}><span>0{i + 1}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol>
          <div className={s.closing}><span>That’s the renderer.</span><a href="/">Back to the city ↗</a></div>
        </Chapter>
        <div className={s.endnote}>Adapted from our conversation about the renderer. Explanations reflect the current dark-only city; the simulations are simplified teaching models.</div>
      </article>
    </div>
  </div>;
}
