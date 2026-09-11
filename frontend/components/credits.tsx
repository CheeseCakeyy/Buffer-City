'use client';

import { useEffect, useRef, useState } from 'react';
import s from './credits.module.css';

// Kept separate so the credits destinations can be updated without changing the scene.
export const CREDIT_LINKS = {
  GitHub: 'https://github.com/CheeseCakeyy',
  LinkedIn: 'https://www.linkedin.com/in/adwait-tagalpallewar-6158b6249',
  Portfolio: 'https://bento-box-eight.vercel.app/',
};

function drawRiver(canvas: HTMLCanvasElement, time: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#060f0e'; ctx.fillRect(0, 0, width, height);
  const mobile = width < 700;
  const sceneHeight = mobile ? height * .53 : height;
  const cell = Math.max(5, Math.min(width / (mobile ? 76 : 148), 11));
  const rowH = cell * 1.65;
  ctx.font = `${cell * 1.6}px "Courier New",monospace`; ctx.textBaseline = 'top';
  const cols = Math.ceil(width / cell), rows = Math.ceil(height / rowH);
  const bank = (y: number) => width * (mobile ? .23 : .17) + Math.sin(y / sceneHeight * 4) * width * .07;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * cell, y = r * rowH;
    const hash = ((c * 73 + r * 191 + c * r * 7) % 101) / 101;
    const land = y < sceneHeight && x < bank(y);
    if (land) {
      ctx.fillStyle = hash > .7 ? '#526149' : '#293e30';
      ctx.fillText(hash > .85 ? '"' : hash > .4 ? ',' : '.', x, y);
    } else {
      const wave = Math.sin(c * .32 + r * .77 - time * .7);
      if (wave > .54 && hash > .42) {
        // Keep the area behind the credits calm and legible.
        const behindText = mobile ? y > sceneHeight : x > width * .53;
        ctx.fillStyle = behindText ? '#142724' : wave > .93 ? '#45665d' : '#243f37';
        ctx.fillText(wave > .93 ? '~' : '-', x, y);
      }
    }
  }
  const px = width * (mobile ? .29 : .255), py = sceneHeight * .57;
  const unit = Math.max(6, Math.min(width / (mobile ? 70 : 130), 12));
  const text = (lines: string[], x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * rowH));
  };
  // A small timber pier, with the amber-jacketed player seated at its edge.
  text(['==================', '|_|_|_|_|_|_|_|_|_', '  |            |'], px - unit * 14, py + rowH * 3, '#716b4c');
  text(['  ___', ' /___\\', '  o )'], px - unit * 4, py - rowH * 2, '#d3bc8a');
  text([' /##|__', ' |##___)', '  |  \\', '  |_  \\_'], px - unit * 4, py + rowH, '#d49c52');
  const tipX = px + unit * 12, tipY = py - rowH * 2;
  ctx.strokeStyle = '#b9ac7f'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px + unit * 2, py + rowH * 2); ctx.quadraticCurveTo(px + unit * 8, py - rowH * 3, tipX, tipY); ctx.stroke();
  const bobX = tipX + unit * 5, bobY = py + rowH * 6 + Math.sin(time * 2) * 2;
  ctx.strokeStyle = '#687d68'; ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(bobX, bobY); ctx.stroke();
  ctx.fillStyle = '#e6b568'; ctx.fillText('!', bobX - 2, bobY);
  for (let f = 0; f < 3; f++) {
    const phase = ((time + f * 3.1) % 10) / 10;
    const baseX = width * (mobile ? .64 : .36) + f * unit * 5;
    const baseY = sceneHeight * (.39 + f * .18);
    if (phase < .19) {
      const p = phase / .19;
      const fx = baseX + p * unit * 8;
      const fy = baseY - Math.sin(p * Math.PI) * rowH * 4;
      ctx.fillStyle = '#a1c8ad'; ctx.fillText(p < .5 ? '><>' : '<><', fx, fy);
    } else if (phase < .3) {
      const p = (phase - .19) / .11;
      ctx.strokeStyle = `rgba(139,188,166,${1 - p})`;
      ctx.beginPath(); ctx.ellipse(baseX + unit * 8, baseY + rowH, unit * (1 + p * 4), unit * (.3 + p), 0, 0, Math.PI * 2); ctx.stroke();
      if (p < .35) text(['.  |  .'], baseX + unit * 5, baseY - rowH, '#81ad94');
    }
  }
  text(['~  ~'], bobX - unit * 2, bobY + rowH, '#426454');
  // Distant fireflies move slowly along the bank.
  for (let i = 0; i < 7; i++) {
    const x = width * .04 + (i % 3) * unit * 5 + Math.sin(time * .3 + i) * unit;
    const y = sceneHeight * .16 + i * sceneHeight * .1;
    ctx.fillStyle = `rgba(178,186,112,${.25 + .3 * Math.sin(time + i) ** 2})`; ctx.fillText('·', x, y);
  }
}

export function Credits({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [still, setStill] = useState(false);
  const [closing, setClosing] = useState(false);
  const time = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = () => {
    if (closeTimer.current) return;
    setClosing(true); closeTimer.current = setTimeout(onClose, 450);
  };
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStill(media.matches);
    update(); media.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      opener?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    let frame = 0, last = 0;
    const render = (now: number) => {
      if (!document.hidden && canvas.current && (!last || now - last >= 40)) {
        if (!still && last) time.current += Math.min((now - last) / 1000, .1);
        drawRiver(canvas.current, time.current); last = now;
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [still]);
  return <dialog ref={dialog} className={`${s.credits} ${closing ? s.closing : ''}`} aria-labelledby="credits-title" onCancel={e => { e.preventDefault(); close(); }} onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()}>
    <div className={s.scene}>
      <canvas ref={canvas} className={s.river} role="img" aria-label="Your amber-jacketed character sits fishing on a wooden pier. Fish leap from the dark river and leave little ripples." />
      <div className={s.topline}><span>ASCII CITY / AT THE RIVER</span><button onClick={close} autoFocus>Back to the city ↗</button></div>
      <div className={s.names}><p className={s.eyebrow}>MADE BY</p><h2 id="credits-title">Adwait<br />Tagalpallewar</h2><p className={s.note}>A little world, one character at a time.</p><nav aria-label="Creator links">{Object.entries(CREDIT_LINKS).map(([label, url]) => url ? <a key={label} href={url} target="_blank" rel="noopener noreferrer">{label} ↗</a> : <span key={label} className={s.pending}>{label}</span>)}</nav><p className={s.thanks}>Thanks for spending a little time here.</p><span className={s.signature}>~ ~ ~</span></div>
      <div className={s.bottomline}><span>There’s no hurry.</span><button aria-pressed={still} onClick={() => setStill(v => !v)}>{still ? 'Play scene' : 'Pause scene'}</button></div>
    </div>
  </dialog>;
}
