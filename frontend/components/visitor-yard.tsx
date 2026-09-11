'use client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { City } from '../lib/city';
import type { VisitorPage, VisitorSlate } from '../lib/visitor-types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const result = await fetch(url, { ...options, credentials: 'same-origin', signal: AbortSignal.timeout(12_000) });
  const data = await result.json() as T & { error?: string };
  if (!result.ok) throw new Error(data.error || 'The visitor yard is unavailable. Please try again.');
  return data as T;
}
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function VisitorYard({ engine, open, inYard, selected, onSelect, onClose }: {
  engine: RefObject<City | null>; open: boolean; inYard: boolean;
  selected: VisitorSlate | null; onSelect: (slate: VisitorSlate | null) => void; onClose: () => void;
}) {
  const [data, setData] = useState<VisitorPage | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const page = useRef(0), version = useRef(0), mounted = useRef(true);
  const load = useCallback(async (next = page.current, silent = false) => {
    const current = ++version.current;
    if (!silent) setLoading(true);
    try {
      const result = await request<VisitorPage>(`/api/visitors?page=${next}`);
      if (!mounted.current || current !== version.current) return;
      page.current = result.page;
      setData(result); setError('');
      engine.current?.setVisitorSlates(result.slates);
    } catch (e) {
      if (mounted.current && current === version.current) setError(e instanceof Error ? e.message : 'Could not load the visitor yard.');
    } finally {
      if (mounted.current && current === version.current) setLoading(false);
    }
  }, [engine]);
  useEffect(() => {
    mounted.current = true;
    void (async () => {
      const id = new URLSearchParams(window.location.search).get('slate');
      if (id) {
        try {
          const { slate } = await request<{ slate: VisitorSlate }>(`/api/visitors?slate=${encodeURIComponent(id)}`);
          if (!mounted.current) return;
          await load(slate.page);
          onSelect(slate); engine.current?.focusVisitor(slate);
        } catch (e) {
          await load();
          if (mounted.current) { setError(e instanceof Error ? e.message : 'Slate not found.'); onSelect(null); }
        }
      } else await load();
    })();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(page.current, true); }, 30_000);
    return () => { mounted.current = false; version.current++; clearInterval(timer); };
  }, [engine, load, onSelect]);

  if (!open) return null;
  const inscription = name.normalize('NFC').trim().replace(/\s+/g, ' ');
  return <aside className="visitor-yard-panel" aria-label="Visitor yard">
    <div className="panel-title">
      <span className="eyebrow">ACROSS THE RIVER</span>
      <button onClick={onClose} aria-label="Close visitor yard">×</button>
    </div>
    <h2>Leave a little of yourself.</h2>
    <p>A name, a date, a small stone in the city.</p>
    {!inYard && <button className="yard-walk" onClick={() => { engine.current?.visitDistrict('visitors'); onClose(); }}>Walk across the bridge</button>}
    <p className="yard-status" role="status">{loading ? 'Opening the garden…' : data ? `${data.total} ${data.total === 1 ? 'visitor has' : 'visitors have'} left a slate.` : 'The garden is waiting to reconnect.'}</p>
    {error && <div className="yard-error" role="alert"><p>{error}</p><button onClick={() => void load()}>Try again</button></div>}
    {selected ? <section className="slate-detail" aria-label="Selected slate">
      <span>I WAS HERE</span><strong>{selected.name}</strong><small>{date(selected.createdAt)}</small>
      <div className="yard-actions">
        <button onClick={async () => { await load(selected.page); engine.current?.focusVisitor(selected); }}>Find this slate</button>
        <button onClick={async () => {
          const link = new URL(window.location.href); link.searchParams.set('slate', selected.id);
          try { await navigator.clipboard.writeText(link.href); setNotice('Link copied.'); }
          catch { setNotice(`Your slate link: ${link.href}`); }
        }}>Copy link</button>
        <button onClick={() => onSelect(null)}>Back</button>
      </div>
    </section> : data?.alreadyVisited ? <section className="yard-saved">
      <p>{data.own ? `Your slate is here, ${data.own.name}.` : 'Your visit has already been recorded.'}</p>
      {data.own && <button onClick={() => onSelect(data.own)}>Find my slate</button>}
    </section> : <form onSubmit={async e => {
      e.preventDefault();
      if (saving || !inYard || !data || loading) return;
      setSaving(true); setError(''); setNotice('');
      try {
        const { slate, existing } = await request<{ slate: VisitorSlate; existing: boolean }>('/api/visitors', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: inscription }),
        });
        await load(slate.page);
        onSelect(slate); engine.current?.focusVisitor(slate);
        setNotice(existing ? 'Your slate is already in the garden.' : 'Your name is part of the city now.');
        setName('');
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your slate. Please try again.'); }
      finally { setSaving(false); }
    }}>
      <label htmlFor="visitor-name">Your name or nickname</label>
      <input id="visitor-name" value={name} onChange={e => setName(e.target.value)} maxLength={48}
        autoComplete="nickname" placeholder="A name to remember" aria-describedby="visitor-name-help" required disabled={saving} />
      <small id="visitor-name-help">Up to 24 characters. Names are public. One slate per browser.</small>
      <div className="slate-preview" aria-label="Inscription preview"><span>I WAS HERE</span><strong>{inscription || 'Your name'}</strong><small>{date(new Date().toISOString())}</small></div>
      <button className="yard-submit" type="submit" disabled={saving || loading || !data || !inYard || !inscription || Array.from(inscription).length > 24}>{saving ? 'Carving your slate…' : inYard ? 'Place my slate' : 'Cross the bridge to leave a slate'}</button>
    </form>}
    {notice && <p className="yard-notice" role="status">{notice}</p>}
    {data && <section className="yard-register" aria-label="Names in this garden">
      <div className="yard-pagination"><button aria-label="Previous garden" disabled={loading || data.page === 0} onClick={() => void load(data.page - 1)}>←</button><span>Garden {data.page + 1} of {data.lastPage + 1}</span><button aria-label="Next garden" disabled={loading || data.page >= data.lastPage} onClick={() => void load(data.page + 1)}>→</button></div>
      {data.slates.length === 0 ? <p>{data.total === 0 ? 'The first stone is waiting for a name.' : 'No slates are on display in this garden.'}</p> : <ul>{data.slates.map(s => <li key={s.id}><button onClick={() => { onSelect(s); engine.current?.focusVisitor(s); }}><span>{s.name}</span><small>{date(s.createdAt)}</small></button></li>)}</ul>}
    </section>}
  </aside>;
}
