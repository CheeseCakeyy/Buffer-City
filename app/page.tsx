'use client';
import { useEffect, useRef, useState } from 'react';
import { City, type CityStats } from '../lib/city';
export default function Home() {
 const canvas=useRef<HTMLCanvasElement>(null), engine=useRef<City|null>(null);
 const [panel,setPanel]=useState(false),[paused,setPaused]=useState(false),[mode,setMode]=useState('ink');
 const [stats,setStats]=useState<CityStats>({time:'09:00',fps:0,cells:0,selected:'Click a building to inspect it.'});
 useEffect(()=>{if(!canvas.current)return;const city=new City(canvas.current,setStats);engine.current=city;
 const lifecycle=new AbortController();
 const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>unknown}}).modelContext;
 if(context?.registerTool){try{void Promise.resolve(context.registerTool({name:'recenter_ascii_city',description:'Return the player and camera to the starting crossing.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:(input:unknown)=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object');city.reset();return {position:[0,0,2],view:'default'};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 return()=>{lifecycle.abort();city.destroy();engine.current=null;};},[]);
 return <main>
 <header><div className="brand"><span className="brand-symbol">▦</span><div><h1>ASCII CITY<span> / 01</span></h1><p>A little world, made of characters.</p></div></div><div className="header-right"><span className="live-dot"/> ONE BLOCK ALIVE <button onClick={()=>setPanel(!panel)}>How it works ↗</button></div></header>
 <section className="world" aria-label="Explorable ASCII city">
 <canvas ref={canvas} tabIndex={0} aria-label="Use WASD or arrows to walk, Q and E to rotate, plus and minus to zoom. Click buildings to inspect."/>
 <div className="world-heading"><div className="eyebrow">NEIGHBORHOOD STUDY — 001</div><h2>The first block.</h2><p>Maple Street · independent city simulation</p></div>
 <div className="clock"><span className="eyebrow">CITY TIME</span><strong>{stats.time}</strong><span>1 real second = 4 city minutes</span></div>
 <div className="legend"><span><b className="you">@</b> You</span><span><b>i</b> Residents</span><span><b>▰</b> Traffic</span></div>
 <div className="camera-controls"><button aria-label="Rotate left" onClick={()=>engine.current?.rotate(-1)}>↶</button><button aria-label="Rotate right" onClick={()=>engine.current?.rotate(1)}>↷</button><button aria-label="Zoom out" onClick={()=>engine.current?.zoomBy(1.15)}>−</button><button aria-label="Zoom in" onClick={()=>engine.current?.zoomBy(.87)}>+</button><button onClick={()=>engine.current?.reset()}>Recenter</button></div>
 <div className="inspection"><span className="eyebrow">FIELD NOTES</span><p>{stats.selected}</p></div>
 <div className="touch-controls">{['↑','←','↓','→'].map((label,i)=><button key={label} aria-label={'Walk '+['up','left','down','right'][i]} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);engine.current?.keys.add(['arrowup','arrowleft','arrowdown','arrowright'][i]);}} onPointerUp={()=>engine.current?.keys.clear()} onPointerCancel={()=>engine.current?.keys.clear()}>{label}</button>)}</div>
 {panel&&<aside className="explanation"><div className="panel-title"><span className="eyebrow">UNDER THE CHARACTERS</span><button onClick={()=>setPanel(false)} aria-label="Close explanation">×</button></div><h2>A real world.<br/>A text lens.</h2><p>The city exists as 3D coordinates. ASCII is how we draw it, not how we store it.</p>
 <ol><li><h3>01 / Simulate the world</h3><p>Buildings are boxes with width, depth and height. Your position changes with input; cars and residents follow looping routes. A clock controls daylight. These are simple routines, not a full economy or traffic model.</p></li>
 <li><h3>02 / Place an isometric camera</h3><p>The camera looks down at 35.3°. Parallel rays keep far buildings the same size as near ones. Q / E rotates the view; zoom changes the area each cell covers.</p></li>
 <li><h3>03 / Cast one ray per cell</h3><p>Imagine graph paper in front of the camera. From the center of every cell, send a line into the scene: <code>P(t) = O + tD</code>. O is the cell’s starting point; D is the shared viewing direction.</p><p>Intersect the ray with building boxes and the ground, then choose the closest positive hit. This is why a façade hides the street behind it.</p></li>
 <li><h3>04 / Turn the hit into a glyph</h3><p>The hit position identifies windows, roof edges, paving or lane markings. The surface normal and sun direction give brightness using <code>max(0, N · L)</code>. Edges use /, | and _; surfaces use dots and hatching. Amber marks lit windows and your character.</p></li>
 <li><h3>05 / Draw, then repeat</h3><p>The canvas draws the glyphs and repeats as the world moves. This is CPU raycasting, not a 3D image passed through a text filter. This version has no secondary reflection rays or cast-shadow rays.</p></li></ol>
 <div className="experiment"><h3>See the intermediate information</h3><div className="segmented">{['ink','depth','normals'].map(m=><button className={mode===m?'active':''} key={m} onClick={()=>{setMode(m);if(engine.current)engine.current.mode=m;}}>{m}</button>)}</div><p>{mode==='depth'?'Depth: nearer hits are darker. This distance resolves visibility.':mode==='normals'?'Normals: colors distinguish roofs, X-facing walls and Z-facing walls. Shading uses these surface directions.':'Ink: surface details and lighting become architectural character patterns.'}</p></div>
 <p>Clicking also casts a ray, but only one: from your pointer. Walking uses a separate footprint collision check. Raycasting alone does not stop you passing through walls.</p></aside>}
 </section>
 <footer><div><span className="key">W A S D</span> Walk <span className="key">Q E</span> Orbit <span className="key">SCROLL</span> Zoom</div><div className="footer-actions"><span>{stats.cells.toLocaleString()} rays / frame · {stats.fps} fps</span><button onClick={()=>{const next=!paused;setPaused(next);if(engine.current)engine.current.paused=next;}}>{paused?'▶ Resume city':'Ⅱ Pause city'}</button><button onClick={()=>engine.current?.toggleNight()}>Day / night</button></div></footer>
 </main>;
}
