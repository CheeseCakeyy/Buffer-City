'use client';
import { useEffect, useRef, useState } from 'react';
import s from './guide.module.css';

// Timed teaching models. Only run while visible; respect reduced motion.
function useLoop(seconds: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const elapsedRef = useRef(0);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    change(); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!ref.current || paused || reduced) return;
    let frame = 0, previous = 0, visible = false;
    const tick = (now: number) => {
      if (visible && !document.hidden && previous && now - previous >= 40) {
        elapsedRef.current = (elapsedRef.current + Math.min((now - previous) / 1000, .1)) % seconds;
        setTime(elapsedRef.current); previous = now;
      } else if (!previous || !visible || document.hidden) previous = now;
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(ref.current); frame = requestAnimationFrame(tick);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [seconds, paused, reduced]);
  return { ref, time, paused: paused || reduced, toggle: () => {
    if (reduced) { elapsedRef.current = (elapsedRef.current + seconds / 8) % seconds; setTime(elapsedRef.current); }
    else setPaused(p => !p);
  }, label: reduced ? 'Next frame' : paused ? 'Play' : 'Pause' };
}

export function RaySimulation() {
  const loop = useLoop(9);
  const row = Math.min(8, Math.floor(loop.time));
  const y = 48 + row * 23;
  const wall = y >= 94 && y <= 222;
  const tree = y >= 48 && y <= 232;
  const hit = wall ? 238 : tree ? 410 : 510;
  const rayEnd = 52 + (hit - 52) * Math.min(1, (loop.time % 1) * 2.2);
  return <div ref={loop.ref} className={s.simulation}>
    <div className={s.windowBar}><span>02 / RAY CASTING</span><button onClick={loop.toggle}>{loop.label}</button></div>
    <svg viewBox="0 0 620 310" role="img" aria-label="Looping ray scan: a nearby wall hides part of a more distant tree. Each nearest hit fills one output cell.">
      <text x="25" y="25">SCREEN</text><text x="245" y="25">WORLD / SIDE VIEW</text><text x="537" y="25">OUTPUT</text>
      <rect x="238" y="94" width="86" height="128" fill="#202f29" stroke="#8b9d8d" />
      <rect x="410" y="48" width="57" height="184" fill="#24372a" stroke="#60836a" />
      <text x="251" y="257">wall</text><text x="409" y="257">tree</text>
      {Array.from({length:9}, (_, i) => <g key={i}><rect x="30" y={38 + i * 23} width="20" height="20" fill={i === row ? '#dfb478' : '#14201b'} stroke="#42574b" /><rect x="554" y={38 + i * 23} width="25" height="20" fill="#101913" stroke="#42574b" /><text x="561" y={53 + i * 23} className={s.amber}>{i <= row ? (i >= 2 && i <= 7 ? '.' : '&') : ' '}</text></g>)}
      <path d={`M52 ${y}H515`} stroke="#465249" strokeDasharray="3 5" /><path d={`M52 ${y}H${rayEnd}`} stroke="#dfb478" strokeWidth="2" /><circle cx={rayEnd} cy={y} r="4" fill="#dfb478" />
      <text x="30" y="292">ray {row + 1}/9</text><text x="238" y="292" className={s.amber}>{wall ? 'wall hit → .  / tree hidden' : 'tree hit → &'}</text>
    </svg>
    <p className={s.simCaption}>The scan is slowed down so you can follow it. The real renderer traces thousands of cells each frame.</p>
  </div>;
}

export function CameraSimulation() {
  const loop = useLoop(14);
  let focus = 0, player = 0;
  for (let step = 0; step <= Math.floor(loop.time * 30); step++) {
    const t = step / 30;
    player = t < 3 ? t * .7 : t < 8 ? 2.1 + (t - 3) * 1.4 : t < 10 ? 9.1 : 9.1 - (t - 10) * 2.275;
    const distance = Math.abs(player - focus);
    if (distance > 3) focus += (player - focus) * ((distance - 3) / distance) * (1 - Math.exp(-7 / 30));
  }
  const x = 140 + player * 30, f = 140 + focus * 30;
  return <div ref={loop.ref} className={s.simulation}>
    <div className={s.windowBar}><span>03 / CAMERA FOLLOW</span><button onClick={loop.toggle}>{loop.label}</button></div>
    <svg viewBox="0 0 620 265" role="img" aria-label="A player walks out of a three-unit dead zone, then the camera focus follows smoothly.">
      <text x="26" y="30">TOP VIEW</text><path d="M25 130H590" stroke="#344a3e" />
      <rect x={f - 3 * 30} y="66" width={6 * 30} height="126" rx="63" fill="#1b2a21" stroke="#71886f" strokeDasharray="4 6" />
      <circle cx={f} cy="130" r="5" fill="#a0b9b7" /><text x={f} y="219" textAnchor="middle">camera focus</text>
      <text x={x} y="138" textAnchor="middle" className={s.avatar}>@</text><text x={x} y="54" textAnchor="middle" className={s.amber}>player</text>
      <text x="26" y="250">3-unit radius</text><text x="295" y="250">{Math.abs(player - focus) <= 3.01 ? 'Inside the circle: camera holds.' : 'Outside the circle: camera follows.'}</text>
    </svg><p className={s.simCaption}>The focus follows only the excess distance, using the same easing equation as the city. The sequence resets every 14 seconds.</p>
  </div>;
}

export function ProjectionSimulation() {
  const loop = useLoop(10);
  const depth = 10 + (1 - Math.cos(loop.time * Math.PI / 5)) * 10;
  const size = 800 / depth;
  return <div ref={loop.ref} className={s.simulation}>
    <div className={s.windowBar}><span>04 / SAME BUILDING, TWO CAMERAS</span><button onClick={loop.toggle}>{loop.label}</button></div>
    <svg viewBox="0 0 620 290" role="img" aria-label="Side by side comparison: perspective shrinks a building as depth increases, while orthographic keeps its size constant.">
      <path d="M310 20V260" stroke="#344a3e" /><text x="28" y="35">ORTHOGRAPHIC</text><text x="335" y="35">PERSPECTIVE</text>
      {[155,465].map((cx,i) => { const sz=i ? size : 80; return <g key={cx}><path d={`M${cx-115} 185H${cx+115}`} stroke="#344a3e" /><rect x={cx-sz/2} y={185-sz} width={sz} height={sz} fill="#243128" stroke="#a6b19a" />{[0,1].map(r => [0,1].map(c => <rect key={`${r}-${c}`} x={cx-sz*.3+c*sz*.4} y={185-sz*.8+r*sz*.4} width={sz*.15} height={sz*.15} fill="#dfb478" />))}<text x={cx} y="225" textAnchor="middle">{i ? `100 / ${depth.toFixed(1)} = ${(100/depth).toFixed(1)} px/unit` : '10 px/unit at every depth'}</text></g>; })}
      <text x="310" y="273" textAnchor="middle" className={s.amber}>distance from camera: {depth.toFixed(1)} units</text>
    </svg><p className={s.simCaption}>Both buildings are 8 units wide. As distance changes, only perspective divides scale by depth.</p>
  </div>;
}
