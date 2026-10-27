/**
 * Step 3: arrange the sanctuary. Drag fixtures from the list onto the stage plan (or drag
 * them up from the "not yet placed" area). Positions are the operator's: nothing is
 * invented, and an arrangement can be saved to a file independently of the Eos show.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, ChevronRight, Download, GripVertical, Rows3, Columns3, Save, Undo2, Upload, X } from 'lucide-react';
import type { AreaId, Fixture } from '@sanctuary/shared';
import { downloadText } from '../../lib/api';
import { AREA_COLORS, AREA_LABELS, AREA_ORDER } from '../../lib/setup';
import { useApp } from '../../state/store';
import { FIXTURE_DRAG_TYPE, StageView } from '../StageView';
import { Tip } from '../ui';
import { StepHeader } from './SanctuarySetup';

interface ArrangementFile {
  app: 'sanctuary-light';
  kind: 'arrangement';
  savedAt: string;
  fixtures: { channel: number; x: number; y: number; rotation: number; area: AreaId }[];
}

export function ArrangeStep({ onNext }: { onNext(): void }) {
  const config = useApp((s) => s.config)!;
  const editLayout = useApp((s) => s.editLayout);
  const draft = useApp((s) => s.draftFixtures);
  const history = useApp((s) => s.layoutHistory);
  const selection = useApp((s) => s.selection);
  const [highlight, setHighlight] = useState<AreaId | null>(null);
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!useApp.getState().editLayout) useApp.getState().setEditLayout(true); }, []);

  const fixtures = (editLayout ? draft : null) ?? config.fixtures;
  useApp((s) => s.draftElements); // re-render on stage-piece moves too
  const dirty = useApp.getState().layoutChanged();
  const unplaced = fixtures.filter((f) => f.unplaced);
  const visibleUnplaced = unplaced.filter((f) => !query || `${f.channel} ${f.label} ${f.eosType ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const byArea = useMemo(() => {
    const m = new Map<AreaId, Fixture[]>();
    for (const f of visibleUnplaced) m.set(f.area, [...(m.get(f.area) ?? []), f]);
    return AREA_ORDER.filter((a) => m.has(a)).map((a) => [a, m.get(a)!] as const);
  }, [visibleUnplaced]);
  const areaCounts = AREA_ORDER.map((a) => [a, fixtures.filter((f) => f.area === a).length] as const).filter(([, n]) => n > 0);

  const exportArrangement = () => {
    const file: ArrangementFile = {
      app: 'sanctuary-light', kind: 'arrangement', savedAt: new Date().toISOString(),
      fixtures: fixtures.filter((f) => !f.unplaced).map((f) => ({ channel: f.channel, x: f.stage.x, y: f.stage.y, rotation: f.stage.rotation, area: f.area })),
    };
    downloadText(`sanctuary-arrangement-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(file, null, 2));
  };

  const loadArrangement = async (file: File) => {
    const st = useApp.getState();
    try {
      const data = JSON.parse(await file.text()) as ArrangementFile;
      if (data.app !== 'sanctuary-light' || data.kind !== 'arrangement' || !Array.isArray(data.fixtures)) throw new Error('This isn\'t a Sanctuary Light arrangement file.');
      if (!st.draftFixtures) st.setEditLayout(true);
      const list = useApp.getState().draftFixtures!;
      const pos = new Map(data.fixtures.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => [p.channel, p]));
      st.pushLayoutHistory();
      let applied = 0;
      useApp.setState({
        draftFixtures: list.map((f) => {
          const p = pos.get(f.channel);
          if (!p) return f;
          applied++;
          return { ...f, stage: { x: p.x, y: p.y, rotation: p.rotation ?? 0 }, area: AREA_ORDER.includes(p.area) ? p.area : f.area, unplaced: false };
        }),
      });
      const skipped = data.fixtures.length - applied;
      st.toast('info', `Arrangement loaded for ${applied} fixture(s)${skipped ? `; ${skipped} channel(s) in the file aren't in this patch` : ''}. Press Save arrangement to keep it.`);
    } catch (e) { st.toast('error', (e as Error).message); }
  };

  const setArea = (area: AreaId) => {
    if (!selection.length) { useApp.getState().toast('info', 'Select fixtures on the stage first.'); return; }
    useApp.getState().setDraftArea(selection, area);
  };

  return (
    <div className="arrange">
      <StepHeader title="Arrange your sanctuary" intro="An Eos export doesn't say where lights hang, so you place them here. Drag each fixture onto the stage plan where it really is. This arrangement belongs to Sanctuary Light: it's saved on this computer, separate from the Eos show.">
        <Tip label="Undo the last move"><button className="btn" disabled={!history.length} onClick={() => useApp.getState().undoLayout()}><Undo2 size={15} />Undo</button></Tip>
        <button className="btn" disabled={!dirty} onClick={() => { useApp.getState().discardLayout(); useApp.getState().setEditLayout(true); }}><X size={15} />Discard</button>
        <button className="btn primary" disabled={!dirty} onClick={() => void useApp.getState().saveLayout({ keepEditing: true })}><Save size={15} />Save arrangement</button>
      </StepHeader>

      <div className="arrange-grid">
        <aside className="arrange-tray" aria-label="Fixtures to place">
          <div className="row"><strong className="grow">To place ({unplaced.length})</strong></div>
          {unplaced.length > 0 && <input className="input" placeholder="Find…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a fixture to place" />}
          {unplaced.length === 0 && <p className="hint">Every fixture is on the stage. Drag any of them to adjust.</p>}
          {byArea.map(([area, list]) => (
            <div key={area} className="tray-group">
              <div className="tray-head"><span className="swatch" style={{ background: AREA_COLORS[area] }} />{AREA_LABELS[area]} <span className="hint">({list.length})</span></div>
              {list.map((f) => (
                <div key={f.id} className="tray-item" draggable
                  onDragStart={(e) => { e.dataTransfer.setData(FIXTURE_DRAG_TYPE, f.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onClick={() => useApp.getState().select([f.channel])} data-selected={selection.includes(f.channel)}
                  title="Drag onto the stage plan">
                  <GripVertical size={14} className="hint" />
                  <strong>{f.channel}</strong>
                  <span className="grow ellipsis">{f.label}</span>
                  {f.eosType && <span className="hint ellipsis" style={{ maxWidth: 110 }}>{f.eosType}</span>}
                </div>
              ))}
            </div>
          ))}
          <div className="tray-group">
            <div className="tray-head">Arrangement file</div>
            <p className="hint">Keep a copy of your arrangement, or load one saved earlier. Positions are matched by channel number.</p>
            <div className="row wrap">
              <button className="btn sm" onClick={exportArrangement}><Download size={14} />Save to file</button>
              <button className="btn sm" onClick={() => fileRef.current?.click()}><Upload size={14} />Load from file</button>
              <input ref={fileRef} type="file" hidden accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadArrangement(f); e.target.value = ''; }} />
            </div>
          </div>
        </aside>

        <div className="arrange-main">
          <div className="arrange-tools row wrap">
            <span className="hint">Show:</span>
            <button className={`chip ${highlight === null ? 'on' : ''}`} onClick={() => setHighlight(null)}>All</button>
            {areaCounts.map(([a, n]) => (
              <button key={a} className={`chip ${highlight === a ? 'on' : ''}`} onClick={() => setHighlight(highlight === a ? null : a)}>
                <span className="swatch" style={{ background: AREA_COLORS[a] }} />{AREA_LABELS[a]} ({n})
              </button>
            ))}
            <span className="spacer" />
            <Tip label="Spread the selected fixtures evenly in a row between the outermost two"><button className="btn sm" onClick={() => useApp.getState().alignSelection('line-h')}><Rows3 size={14} />Line up</button></Tip>
            <Tip label="Spread the selected fixtures evenly in a column"><button className="btn sm" onClick={() => useApp.getState().alignSelection('line-v')}><Columns3 size={14} />Column</button></Tip>
            <Tip label="Put the selected fixtures on one straight line (same height)"><button className="btn sm icon" aria-label="Align horizontally" onClick={() => useApp.getState().alignSelection('align-top')}><AlignHorizontalJustifyCenter size={15} /></button></Tip>
            <Tip label="Put the selected fixtures in one straight column"><button className="btn sm icon" aria-label="Align vertically" onClick={() => useApp.getState().alignSelection('align-left')}><AlignVerticalJustifyCenter size={15} /></button></Tip>
            <select className="select" style={{ width: 'auto' }} value="" aria-label="Set category of selected fixtures" onChange={(e) => e.target.value && setArea(e.target.value as AreaId)}>
              <option value="">Set category of selected…</option>
              {AREA_ORDER.map((a) => <option key={a} value={a}>{AREA_LABELS[a]}</option>)}
            </select>
          </div>
          <div className="arrange-stage"><StageView highlightArea={highlight} arrange /></div>
          <p className="hint">Tips: shift-click or shift-drag to select several fixtures, then <strong>Line up</strong> to space them along a truss. Scroll to zoom. Your arrangement is only saved when you press <strong>Save arrangement</strong>.</p>
        </div>
      </div>

      <div className="row step-foot">
        <span className="hint">{unplaced.length ? `${unplaced.length} fixture(s) still to place. You can continue and come back later.` : 'All fixtures placed.'}</span>
        <span className="spacer" />
        <button className="btn primary" disabled={dirty} onClick={onNext}>{dirty ? 'Save first' : <>Worship looks<ChevronRight size={16} /></>}</button>
      </div>
    </div>
  );
}
