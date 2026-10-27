import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { FileUp, LayoutGrid, Maximize, Move, RotateCw, Save, Tag, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { unplacedAreaTop, type AreaId, type Fixture, type FixtureProfile, type FixtureState, type StageElement } from '@sanctuary/shared';
import { useApp } from '../state/store';
import { api } from '../lib/api';
import { beamFor, lightColor } from '../lib/fixtureVisual';
import { SourceBadge, Tip } from './ui';

type Drag =
  | { kind: 'pan'; startX: number; startY: number; vb: ViewBox; moved: boolean; shift: boolean }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; additive: boolean }
  | { kind: 'fixture'; id: string; dx: number; dy: number }
  | { kind: 'element'; id: string; dx: number; dy: number };

interface ViewBox { x: number; y: number; w: number; h: number }

const ELEMENT_STYLE: Record<StageElement['kind'], { fill: string; stroke: string; rx: number }> = {
  platform: { fill: '#1a2033', stroke: '#2f3852', rx: 18 },
  step: { fill: '#161b2b', stroke: '#2a3147', rx: 6 },
  altar: { fill: '#3a2f1d', stroke: '#6b5530', rx: 6 },
  pulpit: { fill: '#2f2a22', stroke: '#5a4a32', rx: 10 },
  lectern: { fill: '#2f2a22', stroke: '#5a4a32', rx: 10 },
  choir: { fill: '#1d2438', stroke: '#33405f', rx: 10 },
  seating: { fill: 'url(#pews)', stroke: '#252c40', rx: 10 },
  screen: { fill: '#3b4a6b', stroke: '#6b82b8', rx: 3 },
  font: { fill: '#1e3a4f', stroke: '#3b6f94', rx: 30 },
  label: { fill: 'rgba(255,255,255,0.02)', stroke: '#2a3145', rx: 8 },
};

const SNAP = 5;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

/** Fixtures dragged from the Arrange list carry this data type. */
export const FIXTURE_DRAG_TYPE = 'application/x-sanctuary-fixture';

export function StageView({ compact = false, highlightArea = null, arrange = false }: { compact?: boolean; highlightArea?: AreaId | null; arrange?: boolean }) {
  const config = useApp((s) => s.config);
  const levels = useApp((s) => s.levels);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const editLayout = useApp((s) => s.editLayout);
  const setEditLayout = useApp((s) => s.setEditLayout);
  const draftFixtures = useApp((s) => s.draftFixtures);
  const draftElements = useApp((s) => s.draftElements);
  const role = useApp((s) => s.role);
  const mode = useApp((s) => s.status?.mode ?? 'offline');
  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<ViewBox | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [showLabels, setShowLabels] = useState(false);

  const allFixtures = (editLayout ? draftFixtures : null) ?? config?.fixtures ?? [];
  // Fixtures nobody has placed yet are not drawn on the stage (their position is unknown).
  // While editing, they wait in the "not yet placed" area below the stage.
  const fixtures = editLayout ? allFixtures : allFixtures.filter((f) => !f.unplaced);
  const elements = (editLayout ? draftElements : null) ?? config?.stage.elements ?? [];
  const profiles = useMemo(() => new Map((config?.profiles ?? []).map((p) => [p.id, p])), [config?.profiles]);
  const selected = useMemo(() => new Set(selection), [selection]);
  const W = config?.stage.width ?? 1200;
  const H = config?.stage.height ?? 800;
  const holdingBottom = editLayout ? Math.max(0, ...allFixtures.filter((f) => f.unplaced).map((f) => f.stage.y)) : 0;
  const fit = (): ViewBox => (holdingBottom > H ? { x: -20, y: -20, w: W + 40, h: holdingBottom + 70 } : { x: -20, y: -20, w: W + 40, h: H + 40 });
  const view = vb ?? fit();

  useEffect(() => { setVb(null); }, [W, H, holdingBottom > H]);

  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  const zoom = (factor: number, cx?: number, cy?: number) => {
    const v = view;
    const nw = Math.min(W * 3, Math.max(150, v.w * factor));
    const nh = (nw / v.w) * v.h;
    const px = cx ?? v.x + v.w / 2; const py = cy ?? v.y + v.h / 2;
    setVb({ x: px - ((px - v.x) * nw) / v.w, y: py - ((py - v.y) * nh) / v.h, w: nw, h: nh });
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  });

  const onBgDown = (e: RPointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toSvg(e.clientX, e.clientY);
    if (e.shiftKey || e.metaKey || e.ctrlKey) setDrag({ kind: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y, additive: true });
    else setDrag({ kind: 'pan', startX: e.clientX, startY: e.clientY, vb: view, moved: false, shift: false });
  };

  const onFixtureDown = (e: RPointerEvent, f: Fixture) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (editLayout) {
      const p = toSvg(e.clientX, e.clientY);
      useApp.getState().pushLayoutHistory();
      if (!selected.has(f.channel) || !(e.shiftKey || e.metaKey || e.ctrlKey)) select([f.channel], e.shiftKey || e.metaKey || e.ctrlKey ? 'toggle' : 'replace');
      setDrag({ kind: 'fixture', id: f.id, dx: p.x - f.stage.x, dy: p.y - f.stage.y });
      return;
    }
    select([f.channel], e.shiftKey || e.metaKey || e.ctrlKey ? 'toggle' : 'replace');
  };

  const onElementDown = (e: RPointerEvent, el: StageElement) => {
    if (!editLayout) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toSvg(e.clientX, e.clientY);
    setDrag({ kind: 'element', id: el.id, dx: p.x - el.x, dy: p.y - el.y });
  };

  const onMove = (e: RPointerEvent) => {
    if (!drag) return;
    if (drag.kind === 'pan') {
      const svg = svgRef.current!;
      const scale = drag.vb.w / svg.clientWidth;
      const dx = (e.clientX - drag.startX) * scale; const dy = (e.clientY - drag.startY) * scale;
      if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 3) drag.moved = true;
      if (drag.moved) setVb({ ...drag.vb, x: drag.vb.x - dx, y: drag.vb.y - dy });
      return;
    }
    const p = toSvg(e.clientX, e.clientY);
    if (drag.kind === 'marquee') setDrag({ ...drag, x1: p.x, y1: p.y });
    else if (drag.kind === 'fixture') useApp.getState().moveFixture(drag.id, snap(Math.max(0, Math.min(W, p.x - drag.dx))), snap(Math.max(0, Math.min(H, p.y - drag.dy))));
    else if (drag.kind === 'element') useApp.getState().moveElement(drag.id, snap(p.x - drag.dx), snap(p.y - drag.dy));
  };

  const onUp = () => {
    if (drag?.kind === 'pan' && !drag.moved && !editLayout) select([]);
    if (drag?.kind === 'marquee') {
      const [x0, x1] = [Math.min(drag.x0, drag.x1), Math.max(drag.x0, drag.x1)];
      const [y0, y1] = [Math.min(drag.y0, drag.y1), Math.max(drag.y0, drag.y1)];
      const hit = fixtures.filter((f) => f.stage.x >= x0 && f.stage.x <= x1 && f.stage.y >= y0 && f.stage.y <= y1).map((f) => f.channel);
      select(hit, drag.additive ? 'add' : 'replace');
    }
    setDrag(null);
  };

  const saveLayout = () => void useApp.getState().saveLayout();
  const unplacedCount = fixtures.filter((f) => f.unplaced).length;
  const singleSel = editLayout && selection.length === 1 ? fixtures.find((f) => f.channel === selection[0]) : undefined;
  const groupChips = (config?.groups ?? []).filter((g) => !compact || g.volunteerVisible);
  const anySource = levels ? (Object.values(levels.sources).includes('commanded') ? 'commanded' : 'simulated') : 'simulated';

  return (
    <section className="panel stage" aria-label="Stage view">
      <div className="stage-toolbar">
        {groupChips.map((g) => (
          <button key={g.id} className="group-chip" onClick={(e) => select(g.channels, e.shiftKey ? 'add' : 'replace')}>
            <span className="swatch" style={{ background: g.color }} />{g.name}
          </button>
        ))}
        <span className="spacer" />
        {singleSel && (
          <label className="row hint"><RotateCw size={14} />
            <input className="input num" type="number" step={15} value={singleSel.stage.rotation} aria-label="Rotation (degrees)"
              onChange={(e) => useApp.getState().rotateFixture(singleSel.id, Number(e.target.value) % 360)} />
          </label>
        )}
        <Tip label="Show labels"><button className={`btn sm icon ${showLabels ? 'active' : ''}`} aria-pressed={showLabels} aria-label="Show labels" onClick={() => setShowLabels(!showLabels)}><Tag size={15} /></button></Tip>
        <Tip label="Zoom out"><button className="btn sm icon" aria-label="Zoom out" onClick={() => zoom(1.25)}><ZoomOut size={15} /></button></Tip>
        <Tip label="Zoom in"><button className="btn sm icon" aria-label="Zoom in" onClick={() => zoom(0.8)}><ZoomIn size={15} /></button></Tip>
        <Tip label="Fit stage"><button className="btn sm icon" aria-label="Fit stage" onClick={() => setVb(null)}><Maximize size={15} /></button></Tip>
        {!compact && !arrange && role === 'operator' && (editLayout ? (
          <>
            <button className="btn sm" onClick={() => useApp.getState().discardLayout()}><Undo2 size={14} />Discard</button>
            <button className="btn sm primary" onClick={saveLayout}><Save size={14} />Save layout</button>
          </>
        ) : (
          <Tip label="Drag fixtures and stage pieces to match the sanctuary"><button className="btn sm" onClick={() => setEditLayout(true)}><Move size={14} />Edit layout</button></Tip>
        ))}
      </div>
      {!compact && !arrange && role === 'operator' && config && !config.eosShow && !editLayout && (
        <div className="arrange-bar">
          <FileUp size={15} /><span>These are <strong>sample fixtures</strong>. Bring in your real patch, groups and cues from Eos.</span>
          <span className="spacer" />
          <button className="btn sm primary" onClick={() => useApp.getState().setImportOpen(true)}>Import Eos Show</button>
        </div>
      )}
      {!compact && !arrange && role === 'operator' && unplacedCount > 0 && (
        <div className="arrange-bar">
          <LayoutGrid size={15} />
          {editLayout
            ? <span>Drag each fixture from <strong>Not yet placed</strong> (below the stage) to where it hangs. {unplacedCount} left. Press <strong>Save layout</strong> when done (you can stop and continue later).</span>
            : <span><strong>{unplacedCount}</strong> imported fixture(s) haven't been placed on the stage yet.</span>}
          <span className="spacer" />
          {!editLayout && <button className="btn sm primary" onClick={() => useApp.getState().goToSetup('arrange')}>Arrange now</button>}
        </div>
      )}
      <div className="stage-canvas" data-edit={editLayout}
        onDragOver={(e) => { if (editLayout && e.dataTransfer.types.includes(FIXTURE_DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(FIXTURE_DRAG_TYPE);
          if (!editLayout || !id) return;
          e.preventDefault();
          const p = toSvg(e.clientX, e.clientY);
          useApp.getState().pushLayoutHistory();
          useApp.getState().moveFixture(id, snap(Math.max(0, Math.min(W, p.x))), snap(Math.max(0, Math.min(H, p.y))));
          const f = allFixtures.find((x) => x.id === id);
          if (f) select([f.channel]);
        }}>
        <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="application" aria-label="Overhead stage plan. Click fixtures to select; shift-drag to select an area; drag to pan; scroll to zoom."
          onPointerDown={onBgDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#151a28" strokeWidth="1" /></pattern>
            <pattern id="pews" width="30" height="26" patternUnits="userSpaceOnUse"><rect width="30" height="26" fill="#141927" /><rect y="16" width="30" height="7" rx="2" fill="#1f2638" /></pattern>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
          </defs>
          <rect x={-2000} y={-2000} width={W + 4000} height={H + 4000} fill="url(#grid)" />
          <rect x={0} y={0} width={W} height={H} fill="none" stroke="#1d2335" strokeDasharray="6 6" />
          {elements.map((el) => {
            const st = ELEMENT_STYLE[el.kind];
            return (
              <g key={el.id} onPointerDown={(e) => onElementDown(e, el)} style={{ cursor: editLayout ? 'move' : undefined }}>
                <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={Math.min(st.rx, el.h / 2)} fill={st.fill} stroke={st.stroke} strokeWidth={1.5} />
                {el.h > 20 && <text x={el.x + el.w / 2} y={el.y + (el.kind === 'platform' ? 22 : el.h / 2 + 4)} textAnchor="middle" fontSize={el.kind === 'platform' ? 13 : 11} fill="#56607d" fontWeight={700} style={{ pointerEvents: 'none', letterSpacing: '0.08em' }}>{el.label.toUpperCase()}</text>}
              </g>
            );
          })}
          <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#3c4560" fontWeight={700} letterSpacing="0.2em">HOUSE ↓</text>
          {holdingBottom > H && (
            <g pointerEvents="none">
              <rect x={10} y={unplacedAreaTop(H)} width={W - 20} height={holdingBottom - unplacedAreaTop(H) + 30} rx={14} fill="rgba(245,185,66,0.04)" stroke="#f5b942" strokeOpacity={0.5} strokeDasharray="8 6" />
              <text x={24} y={unplacedAreaTop(H) + 18} fontSize={12} fill="#f5b942" fontWeight={700} letterSpacing="0.12em">NOT YET PLACED · drag each fixture up onto the stage where it really hangs</text>
            </g>
          )}

          <g style={{ mixBlendMode: 'screen' }} pointerEvents="none">
            {fixtures.map((f) => <Beam key={f.id} f={f} profile={profiles.get(f.profileId)} state={levels?.levels[f.channel]} />)}
          </g>

          {editLayout && fixtures.filter((f) => f.unplaced).map((f) => (
            <circle key={`u-${f.id}`} cx={f.stage.x} cy={f.stage.y} r={24} fill="none" stroke="#f5b942" strokeWidth={2} strokeDasharray="5 4" pointerEvents="none" />
          ))}
          {fixtures.map((f) => (
            <FixtureGlyph key={f.id} f={f} profile={profiles.get(f.profileId)} state={levels?.levels[f.channel]}
              selected={selected.has(f.channel)} showLabel={showLabels || (arrange && editLayout)} onPointerDown={(e) => onFixtureDown(e, f)} editing={editLayout}
              dim={!!highlightArea && f.area !== highlightArea} />
          ))}

          {drag?.kind === 'marquee' && (
            <rect x={Math.min(drag.x0, drag.x1)} y={Math.min(drag.y0, drag.y1)} width={Math.abs(drag.x1 - drag.x0)} height={Math.abs(drag.y1 - drag.y0)}
              fill="rgba(245,185,66,0.08)" stroke="#f5b942" strokeDasharray="5 4" />
          )}
        </svg>
        <div className="stage-watermark">
          {mode === 'offline' || anySource === 'simulated'
            ? <span className="badge sim"><span className="dot" />Simulated preview</span>
            : <span className="badge commanded"><span className="dot" />Commanded — not confirmed by console</span>}
          {editLayout && <span className="badge warn">Editing layout — unsaved</span>}
        </div>
        {!compact && <div className="stage-legend"><span className="hint">Shift-drag to box-select · scroll to zoom</span></div>}
      </div>
      {!compact && selection.length > 0 && levels && (
        <div className="row" style={{ padding: '6px 10px', borderTop: '1px solid var(--line)' }}>
          <span className="hint">{selection.length} selected</span>
          <span className="spacer" />
          <SourceBadge source={levels.sources[selection[0]] ?? 'simulated'} />
        </div>
      )}
    </section>
  );
}

function Beam({ f, profile, state }: { f: Fixture; profile?: FixtureProfile; state?: FixtureState }) {
  const level = (state?.intensity ?? 0) / 100;
  if (level <= 0.01) return null;
  const b = beamFor(f, profile, state);
  if (!b) return null;
  const [r, g, bl] = lightColor(state, profile);
  const color = `rgb(${r},${g},${bl})`;
  const id = `beam-${f.id}`;
  return (
    <g opacity={Math.min(1, 0.15 + level * 0.85)}>
      <radialGradient id={id}>
        <stop offset="0" stopColor={color} stopOpacity={0.85} />
        <stop offset="0.6" stopColor={color} stopOpacity={0.35} />
        <stop offset="1" stopColor={color} stopOpacity={0} />
      </radialGradient>
      {(profile?.kind === 'conventional' || profile?.kind === 'moving') && (
        <path d={`M ${f.stage.x} ${f.stage.y} L ${b.cx - b.rx * 0.6} ${b.cy} L ${b.cx + b.rx * 0.6} ${b.cy} Z`} fill={color} opacity={0.08 * level} />
      )}
      <ellipse cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill={`url(#${id})`} transform={b.angle ? `rotate(${b.angle} ${b.cx} ${b.cy})` : undefined} />
    </g>
  );
}

function FixtureGlyph({ f, profile, state, selected, showLabel, onPointerDown, editing, dim = false }: {
  f: Fixture; profile?: FixtureProfile; state?: FixtureState; selected: boolean; showLabel: boolean; editing: boolean; dim?: boolean;
  onPointerDown(e: RPointerEvent): void;
}) {
  const level = (state?.intensity ?? 0) / 100;
  const [r, g, b] = lightColor(state, profile);
  const lit = `rgb(${Math.round(30 + (r - 30) * level)},${Math.round(34 + (g - 34) * level)},${Math.round(46 + (b - 46) * level)})`;
  const stroke = selected ? '#f5b942' : f.protected ? '#f87171' : '#5b6684';
  const sw = selected ? 3 : 1.5;
  const kind = profile?.kind ?? 'conventional';
  const { x, y, rotation } = f.stage;
  let shape: JSX.Element;
  switch (kind) {
    case 'conventional':
      shape = <g transform={`rotate(${rotation})`}><rect x={-9} y={-15} width={18} height={26} rx={4} fill="#252b3d" stroke={stroke} strokeWidth={sw} /><rect x={-8} y={9} width={16} height={7} rx={2} fill={lit} stroke={stroke} strokeWidth={1} /></g>;
      break;
    case 'led-par':
      shape = <><circle r={14} fill="#252b3d" stroke={stroke} strokeWidth={sw} /><circle r={9} fill={lit} /></>;
      break;
    case 'led-bar':
    case 'striplight':
      shape = <g transform={`rotate(${rotation})`}><rect x={-24} y={-7} width={48} height={14} rx={4} fill="#252b3d" stroke={stroke} strokeWidth={sw} /><rect x={-20} y={-3.5} width={40} height={7} rx={2} fill={lit} /></g>;
      break;
    case 'pendant':
      shape = <><circle r={11} fill={lit} stroke={stroke} strokeWidth={sw} /><circle r={3} fill="#0b0d14" opacity={0.5} /></>;
      break;
    case 'moving':
      shape = <g transform={`rotate(${rotation + (state?.pan ?? 0)})`}><rect x={-15} y={-15} width={30} height={30} rx={8} fill="#252b3d" stroke={stroke} strokeWidth={sw} /><circle r={9} cy={4} fill={lit} /></g>;
      break;
    case 'relay':
      shape = <><rect x={-12} y={-12} width={24} height={24} rx={5} fill={level > 0 ? '#7f1d1d' : '#1f2433'} stroke={stroke} strokeWidth={sw} strokeDasharray="3 2" /><path d="M -2 -7 L -5 1 L 1 1 L -1 7 L 5 -2 L -1 -2 L 1 -7 Z" fill={level > 0 ? '#fca5a5' : '#5b6684'} /></>;
      break;
  }
  return (
    <g className="fixture" transform={`translate(${x} ${y})`} onPointerDown={onPointerDown} style={{ cursor: editing ? 'move' : 'pointer' }} opacity={dim ? 0.22 : 1}
      role="button" aria-pressed={selected} aria-label={`Channel ${f.channel} ${f.label}, ${Math.round(level * 100)} percent`}>
      <title>{`${f.channel} · ${f.label}`}</title>
      {selected && <circle r={22} fill="none" stroke="#f5b942" strokeOpacity={0.35} strokeWidth={6} />}
      {level > 0.02 && kind !== 'relay' && <circle r={16} fill={`rgb(${r},${g},${b})`} opacity={0.35 * level} filter="url(#glow)" />}
      {shape}
      <g transform="translate(0 -24)">
        <rect x={-13} y={-8} width={26} height={14} rx={7} fill={selected ? '#f5b942' : '#aab3cc'} />
        <text className="fixture-chan" textAnchor="middle" y={3}>{f.channel}</text>
      </g>
      {showLabel && <text className="fixture-label" textAnchor="middle" y={kind === 'led-bar' || kind === 'striplight' ? 20 : 28}>{f.label}</text>}
    </g>
  );
}
