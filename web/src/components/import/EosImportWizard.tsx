/**
 * Import Eos Show: Select file → Preview everything → Import → Start arranging.
 *
 * Offline and read-only: the file is read by the local Sanctuary Light server, and applying
 * only changes Sanctuary Light's own configuration (after an automatic backup). Nothing is
 * sent to Eos, no levels change, and the operating mode is never changed.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  BookOpen, CheckCircle2, ChevronLeft, Circle, FileQuestion, FileUp, Info, LayoutGrid, ShieldCheck, TriangleAlert, Upload,
} from 'lucide-react';
import {
  EOS_EXPORT_STEPS, buildImportPlan, channelExpression, defaultImportOptions, describeTiming,
  type ImportIssue, type ImportOptions, type ImportPlan, type ParsedShow,
} from '@sanctuary/shared';
import { api } from '../../lib/api';
import { useApp } from '../../state/store';
import { Confirm, Modal } from '../ui';
import { UndoImportButton } from './UndoImportButton';

type Phase = 'choose' | 'reading' | 'preview' | 'applying' | 'done';
type Tab = 'fixtures' | 'groups' | 'cues' | 'palettes' | 'subs' | 'issues';

const STEPS = ['Select file', 'Preview', 'Import', 'Arrange'];
const PALETTE_NAMES = { preset: 'Preset', intensity: 'Intensity palette', focus: 'Focus palette', color: 'Color palette', beam: 'Beam palette' } as const;
const CAP_NAMES: Record<string, string> = { intensity: 'Intensity', rgb: 'Color (RGB)', white: 'White', amber: 'Amber', uv: 'UV', cct: 'Color temp', pantilt: 'Pan/Tilt', zoom: 'Zoom', focus: 'Edge/Focus', relay: 'Relay (on/off)' };

interface ApplyResponse { ok: true; backup: string; changes: ImportPlan['changes']; unplaced: number[] }

export function EosImportWizard() {
  const open = useApp((s) => s.importOpen);
  const setOpen = useApp((s) => s.setImportOpen);
  const config = useApp((s) => s.config);
  const mode = useApp((s) => s.status?.mode ?? 'offline');
  const [phase, setPhase] = useState<Phase>('choose');
  const [show, setShow] = useState<ParsedShow | null>(null);
  const [token, setToken] = useState('');
  const [opts, setOpts] = useState<ImportOptions | null>(null);
  const [tab, setTab] = useState<Tab>('fixtures');
  const [result, setResult] = useState<ApplyResponse | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importable = !!show && show.format !== 'eos-native' && show.format !== 'unsupported';
  const plan = useMemo(() => (importable && opts && config ? buildImportPlan(show!, config, opts) : null), [importable, show, opts, config]);
  const stepIndex = phase === 'choose' || phase === 'reading' ? 0 : phase === 'preview' ? 1 : phase === 'applying' ? 2 : 3;

  const reset = () => { setPhase('choose'); setShow(null); setToken(''); setOpts(null); setResult(null); setError(null); setTab('fixtures'); };
  const close = (o: boolean) => setOpen(o);
  // Start fresh every time the wizard is closed, however it was closed (e.g. "Start arranging").
  useEffect(() => {
    if (open) return;
    const t = setTimeout(reset, 200);
    return () => clearTimeout(t);
  }, [open]);

  const readFile = async (file: File) => {
    setError(null);
    setPhase('reading');
    try {
      const token = useApp.getState().token;
      const res = await fetch('/api/import/eos/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: file,
      });
      const data = res.headers.get('content-type')?.includes('json') ? await res.json() : { error: res.status === 413 ? 'The file is too large to be an Eos export.' : await res.text() };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const parsed = data.show as ParsedShow;
      setShow(parsed);
      setToken(data.token);
      if (config) setOpts(defaultImportOptions(parsed, config));
      setTab(parsed.channels.length ? 'fixtures' : parsed.cueLists.length ? 'cues' : 'issues');
      setPhase('preview');
    } catch (e) {
      setError((e as Error).message);
      setPhase('choose');
    }
  };

  const apply = async () => {
    if (!opts) return;
    setPhase('applying');
    try {
      const r = await api.post<ApplyResponse>('/api/import/eos/apply', { token, options: opts, confirm: true });
      setResult(r);
      setPhase('done');
    } catch (e) {
      setError((e as Error).message);
      setPhase('preview');
    }
  };

  return (
    <Modal open={open} onOpenChange={close} title="Import Eos Show" wide>
      <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <strong style={{ fontSize: 16 }}>Import Eos Show</strong>
        <span className="hint"><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> Offline file import. Nothing is sent to Eos and no lights change.</span>
        <span className="spacer" />
        <button className="btn sm" onClick={() => close(false)}>Close</button>
      </div>
      <div className="settings">
        <nav className="settings-nav" aria-label="Import steps">
          {STEPS.map((s, i) => (
            <button key={s} data-state={i === stepIndex ? 'active' : undefined} aria-current={i === stepIndex ? 'step' : undefined} disabled tabIndex={-1} style={{ cursor: 'default' }}>
              {i < stepIndex ? <CheckCircle2 size={15} color="var(--ok)" /> : <Circle size={15} />}{i + 1}. {s}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {error && <div className="card" role="alert" style={{ borderColor: 'var(--err)' }}><TriangleAlert size={15} color="var(--err)" style={{ verticalAlign: -3 }} /> {error}</div>}
          {(phase === 'choose' || phase === 'reading') && <ChooseStep busy={phase === 'reading'} onFile={readFile} />}
          {phase !== 'choose' && phase !== 'reading' && show && !importable && <CannotImport show={show} onBack={reset} />}
          {(phase === 'preview' || phase === 'applying') && importable && show && opts && plan && (
            <PreviewStep show={show} opts={opts} setOpts={setOpts} plan={plan} tab={tab} setTab={setTab} live={mode === 'eos-live'}
              busy={phase === 'applying'} onBack={reset} onImport={() => (opts.mode === 'replace' ? setConfirmReplace(true) : void apply())} />
          )}
          {phase === 'done' && result && show && <DoneStep show={show} result={result} onClose={() => close(false)} />}
        </div>
      </div>
      <Confirm open={confirmReplace} onOpenChange={setConfirmReplace} danger title="Replace your Sanctuary Light setup?"
        confirmLabel="Replace and import"
        body={<>The selected parts of Sanctuary Light's local setup are replaced by the Eos show ({plan?.changes.fixtures.removed ?? 0} fixtures, {plan?.changes.groups.removed ?? 0} groups would be removed). A backup is saved first. <strong>Eos itself is not changed.</strong></>}
        onConfirm={() => void apply()} />
    </Modal>
  );
}

// ───────────────────────────── step 1: choose a file ─────────────────────────────

function ChooseStep({ busy, onFile }: { busy: boolean; onFile(f: File): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) onFile(f); };
  return (
    <div>
      <h4>Bring in your Eos show</h4>
      <p className="hint">Use an export of the show that is in Eos today: a <strong>CSV export</strong> (best: includes fixture types and parameters) or a <strong>USITT ASCII</strong> file (.asc). Your patch, groups, cue lists, presets, palettes and submasters become your starting setup in Sanctuary Light.</p>
      <div className="dropzone" data-over={over} data-busy={busy} role="button" tabIndex={0}
        onClick={() => !busy && input.current?.click()} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) input.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        aria-label="Choose an Eos export file, or drop it here">
        {busy ? <><Upload size={30} /><strong>Reading the file…</strong></> : (
          <>
            <FileUp size={34} />
            <strong>Drop your Eos export here</strong>
            <span className="hint">or click to browse · .csv, .asc (native .esf files are recognised and explained)</span>
          </>
        )}
      </div>
      <input ref={input} type="file" hidden accept=".csv,.asc,.txt,.esf,.esf2,.esf3d,text/csv,text/plain"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      <ExportHelp />
    </div>
  );
}

function ExportHelp({ open = false }: { open?: boolean }) {
  return (
    <details className="card" open={open}>
      <summary><BookOpen size={15} style={{ verticalAlign: -3 }} /> <strong>How to export your show from Eos</strong> (2 minutes)</summary>
      <div style={{ marginTop: 8 }}>
        <strong>CSV (recommended)</strong>
        <ol className="hint">{EOS_EXPORT_STEPS.csv.map((s) => <li key={s}>{s}</li>)}</ol>
        <strong>Or USITT ASCII</strong>
        <ol className="hint">{EOS_EXPORT_STEPS.ascii.map((s) => <li key={s}>{s}</li>)}</ol>
        <div className="hint"><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> {EOS_EXPORT_STEPS.safety.join(' ')}</div>
      </div>
    </details>
  );
}

function CannotImport({ show, onBack }: { show: ParsedShow; onBack(): void }) {
  const native = show.format === 'eos-native';
  return (
    <div>
      <h4>{native ? <><FileQuestion size={18} style={{ verticalAlign: -3 }} /> This is a native Eos show file</> : 'This file can\'t be imported'}</h4>
      <p className="hint"><strong>{show.fileName}</strong> · {show.formatLabel}</p>
      {show.issues.map((i, k) => <p key={k}>{i.message}</p>)}
      {native && <p className="hint">ETC doesn't publish the .esf format, so reading it directly could produce wrong data. Exporting takes a couple of minutes and gives Sanctuary Light exactly what Eos has:</p>}
      <ExportHelp open />
      <button className="btn" onClick={onBack}><ChevronLeft size={16} />Choose another file</button>
    </div>
  );
}

// ───────────────────────────── step 2: preview ─────────────────────────────

function Stat({ label, value, sub, warn }: { label: string; value: number | string; sub?: string; warn?: boolean }) {
  return <div className="stat-tile" data-warn={warn}><div className="stat-value">{value}</div><div className="stat-label">{label}</div>{sub && <div className="hint">{sub}</div>}</div>;
}

function PreviewStep({ show, opts, setOpts, plan, tab, setTab, live, busy, onBack, onImport }: {
  show: ParsedShow; opts: ImportOptions; setOpts(o: ImportOptions): void; plan: ImportPlan; tab: Tab; setTab(t: Tab): void;
  live: boolean; busy: boolean; onBack(): void; onImport(): void;
}) {
  const cues = show.cueLists.reduce((n, l) => n + l.cues.length, 0);
  const firstImport = useApp((s) => s.config?.eosShow == null);
  const problems = show.issues.filter((i) => i.severity !== 'info').length;
  const fatal = show.issues.some((i) => i.severity === 'error') && !show.channels.length && !show.cueLists.length && !show.groups.length;
  const nothing = !Object.values(opts.include).some(Boolean);
  const inc = (k: keyof ImportOptions['include'], v: boolean) => setOpts({ ...opts, include: { ...opts.include, [k]: v } });
  const sourceText = Object.entries(show.source).map(([k, v]) => `${k.replace(/^\$+/, '')} ${v}`).join(' · ');

  return (
    <div>
      <div className="row wrap">
        <h4 className="grow">Preview: {show.fileName}</h4>
        <span className="badge">{show.formatLabel}</span>
        <span className="badge">{show.encoding}</span>
      </div>
      {sourceText && <div className="hint">{sourceText}</div>}

      <div className="stat-grid">
        <Stat label="Fixtures (channels)" value={show.channels.length} sub={`${show.channels.filter((c) => !c.fixtureType).length} without a fixture type`} />
        <Stat label="Groups" value={show.groups.length} />
        <Stat label="Cue lists" value={show.cueLists.length} sub={`${cues} cues`} />
        <Stat label="Presets & palettes" value={show.palettes.length} />
        <Stat label="Submasters" value={show.subs.length} />
        <Stat label="Needs attention" value={problems + plan.conflicts.length} sub={`${show.uninterpreted.total} item(s) not interpreted`} warn={problems + plan.conflicts.length > 0} />
      </div>

      <div className="tabs" role="tablist">
        {([['fixtures', `Fixtures (${show.channels.length})`], ['groups', `Groups (${show.groups.length})`], ['cues', `Cues (${cues})`],
          ['palettes', `Presets & palettes (${show.palettes.length})`], ['subs', `Submasters (${show.subs.length})`], ['issues', `Issues (${show.issues.length + plan.conflicts.length})`]] as const)
          .map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} data-on={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      <div className="table-scroll" style={{ maxHeight: 300 }}>
        {tab === 'fixtures' && <FixturesTable show={show} plan={plan} />}
        {tab === 'groups' && <GroupsTable show={show} plan={plan} />}
        {tab === 'cues' && <CuesTable show={show} />}
        {tab === 'palettes' && <PalettesTable show={show} />}
        {tab === 'subs' && <SubsTable show={show} plan={plan} />}
        {tab === 'issues' && <IssuesList show={show} plan={plan} />}
      </div>

      <div className="import-options">
        <div>
          <strong>What to import</strong>
          {([['fixtures', 'Fixtures & patch', show.channels.length], ['groups', 'Groups', show.groups.length], ['cueLists', 'Cue lists & timing', show.cueLists.length],
            ['submasters', 'Submasters', show.subs.length], ['palettes', 'Presets & palettes (reference)', show.palettes.length]] as const).map(([k, label, n]) => (
            <label key={k} className="row"><input type="checkbox" checked={opts.include[k]} disabled={!n} onChange={(e) => inc(k, e.target.checked)} />{label} <span className="hint">({n})</span></label>
          ))}
          <label className="row"><input type="checkbox" checked={opts.include.looks} disabled={!show.cueLists.length} onChange={(e) => inc('looks', e.target.checked)} />
            Make looks from labelled cues in list
            <select className="select" style={{ width: 90 }} value={opts.looksFromList ?? ''} disabled={!opts.include.looks} aria-label="Cue list for looks"
              onChange={(e) => setOpts({ ...opts, looksFromList: Number(e.target.value) })}>
              {show.cueLists.map((l) => <option key={l.list} value={l.list}>{l.list}{l.label ? ` · ${l.label}` : ''}</option>)}
            </select>
          </label>
        </div>
        <div>
          <strong>How</strong>
          <label className="row"><input type="radio" name="imp-mode" checked={opts.mode === 'merge'} onChange={() => setOpts({ ...opts, mode: 'merge' })} />Merge with my current setup {!firstImport && <span className="badge confirmed">recommended</span>}</label>
          <label className="row"><input type="radio" name="imp-mode" checked={opts.mode === 'replace'} onChange={() => setOpts({ ...opts, mode: 'replace' })} />Replace my current setup {firstImport && <span className="badge confirmed">recommended for the first import</span>}</label>
          {firstImport && <p className="hint">This is the first import, so Replace swaps the built-in sample fixtures for your real show. Relay protections are kept.</p>}
          {opts.mode === 'merge' && (
            <>
              <strong style={{ display: 'block', marginTop: 8 }}>When both have different data</strong>
              <label className="row"><input type="radio" name="imp-conf" checked={opts.conflicts === 'use-imported'} onChange={() => setOpts({ ...opts, conflicts: 'use-imported' })} />Use what's in Eos</label>
              <label className="row"><input type="radio" name="imp-conf" checked={opts.conflicts === 'keep-local'} onChange={() => setOpts({ ...opts, conflicts: 'keep-local' })} />Keep my Sanctuary Light changes</label>
            </>
          )}
          <label className="row" style={{ marginTop: 8 }}><input type="checkbox" checked={!!opts.keepPositions} onChange={(e) => setOpts({ ...opts, keepPositions: e.target.checked })} />
            Keep stage positions I've already arranged (same channel numbers)</label>
          {!opts.keepPositions && <p className="hint" style={{ margin: '2px 0 0' }}>Every imported fixture starts in "Not yet placed", so nothing ends up where a sample fixture used to be.</p>}
          <p className="hint" style={{ marginTop: 8 }}>Protected (relay) channels stay protected. Your connection settings aren't touched.</p>
        </div>
        <div>
          <strong>What will change</strong>
          <ChangeSummary plan={plan} />
          {plan.notices.length > 0 && <ul className="hint notice-list">{plan.notices.map((n, i) => <li key={i} data-sev={n.severity}>{n.message}</li>)}</ul>}
        </div>
      </div>

      {live && <div className="card" role="alert"><TriangleAlert size={15} color="var(--warn)" style={{ verticalAlign: -3 }} /> Live control is armed. Switch to <strong>SIM</strong> or <strong>MONITOR</strong> to import, so nothing changes while you are operating.</div>}
      <div className="row import-actions">
        <button className="btn" onClick={onBack} disabled={busy}><ChevronLeft size={16} />Choose another file</button>
        <span className="spacer" />
        <span className="hint"><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> A backup of your current setup is saved first.</span>
        <button className="btn primary" disabled={busy || live || fatal || nothing} onClick={onImport}>{busy ? 'Importing…' : opts.mode === 'replace' ? 'Replace & import' : 'Import'}</button>
      </div>
    </div>
  );
}

function ChangeSummary({ plan }: { plan: ImportPlan }) {
  const line = (label: string, c: ImportPlan['changes']['fixtures']) => {
    const parts = [c.added && `${c.added} new`, c.updated && `${c.updated} updated`, c.removed && `${c.removed} removed`].filter(Boolean);
    return parts.length ? <li key={label}><strong>{label}:</strong> {parts.join(', ')}</li> : null;
  };
  const c = plan.changes;
  const items = [line('Fixtures', c.fixtures), line('Fixture profiles', c.profiles), line('Groups', c.groups), line('Cue lists', c.cueLists),
    line('Submasters', c.submasters), line('Looks', c.looks), line('Presets & palettes', c.palettes)].filter(Boolean);
  return (
    <>
      <ul className="hint" style={{ margin: '4px 0', paddingLeft: 18 }}>{items.length ? items : <li>Nothing changes.</li>}</ul>
      {plan.conflicts.length > 0 && <div className="hint"><strong>{plan.conflicts.length}</strong> conflict(s): see the Issues tab.</div>}
    </>
  );
}

function FixturesTable({ show, plan }: { show: ParsedShow; plan: ImportPlan }) {
  const [filter, setFilter] = useState('');
  const fixtures = new Map(plan.config.fixtures.map((f) => [f.channel, f]));
  const profiles = new Map(plan.config.profiles.map((p) => [p.id, p]));
  const conflicts = new Set(plan.conflicts.filter((c) => c.kind === 'fixture').map((c) => c.key));
  const isNew = new Set(plan.unplaced);
  const rows = show.channels.filter((c) => !filter || `${c.channel} ${c.label} ${c.fixtureType ?? ''} ${c.manufacturer ?? ''}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <input className="input" placeholder="Filter fixtures…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter fixtures" style={{ margin: 6, width: 'calc(100% - 12px)' }} />
      <table className="data-table">
        <thead><tr><th>Chan</th><th>Label</th><th>Fixture type</th><th>DMX</th><th>Controls in Sanctuary Light</th><th /></tr></thead>
        <tbody>
          {rows.slice(0, 600).map((c) => {
            const f = fixtures.get(c.channel);
            const p = f ? profiles.get(f.profileId) : undefined;
            return (
              <tr key={c.channel}>
                <td>{c.channel}{c.parts > 1 ? <span className="hint"> ({c.parts} parts)</span> : null}</td>
                <td>{c.label || <span className="hint">no label</span>}</td>
                <td>{c.fixtureType ? <>{c.fixtureType}{c.manufacturer ? <span className="hint"> · {c.manufacturer}</span> : null}</> : <span className="badge warn">unknown type</span>}</td>
                <td>{c.dmx ? `${c.dmx.universe}/${c.dmx.address}` : <span className="hint">—</span>}{c.addresses.length > 1 ? <span className="hint"> +{c.addresses.length - 1}</span> : null}</td>
                <td className="hint">{f && p ? p.capabilities.map((k) => CAP_NAMES[k] ?? k).join(', ') : '—'}{p && !p.verified ? ' (unverified)' : ''}</td>
                <td>
                  {f?.protected && <span className="badge err">protected</span>}{' '}
                  {conflicts.has(`Channel ${c.channel}`) && <span className="badge warn">conflict</span>}{' '}
                  {isNew.has(c.channel) && <span className="badge">new</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > 600 && <p className="hint" style={{ padding: 8 }}>Showing 600 of {rows.length}. Use the filter to find a channel.</p>}
    </>
  );
}

function GroupsTable({ show, plan }: { show: ParsedShow; plan: ImportPlan }) {
  const patched = new Set(plan.config.fixtures.map((f) => f.channel));
  return (
    <table className="data-table">
      <thead><tr><th>Group</th><th>Label</th><th>Channels</th><th /></tr></thead>
      <tbody>
        {show.groups.map((g) => {
          const missing = g.channels.filter((c) => !patched.has(c));
          return (
            <tr key={g.number}>
              <td>{g.number}</td><td>{g.label || <span className="hint">no label</span>}</td>
              <td className="hint">{g.channels.length ? channelExpression(g.channels) : 'no channels in the export'}</td>
              <td>{missing.length > 0 && <span className="badge warn">{missing.length} not patched</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CuesTable({ show }: { show: ParsedShow }) {
  return (
    <>
      <p className="hint" style={{ margin: 8 }}><Info size={13} style={{ verticalAlign: -2 }} /> Eos stores cues as <strong>tracked</strong> changes, so a cue on its own isn't a complete look. Sanctuary Light keeps cue numbers, labels and timing, and plays cues by asking Eos to run them. It never rebuilds them from partial data.</p>
      <table className="data-table">
        <thead><tr><th>List</th><th>Cue</th><th>Label</th><th>Timing (as in Eos)</th><th>Changes</th></tr></thead>
        <tbody>
          {show.cueLists.flatMap((l) => l.cues.map((q) => (
            <tr key={`${l.list}/${q.cue}`}>
              <td>{l.list}{l.label ? <span className="hint"> {l.label}</span> : null}</td>
              <td>{q.cue}{q.parts ? <span className="hint"> · {q.parts} parts</span> : null}</td>
              <td>{q.label || <span className="hint">no label</span>}{q.notes ? <div className="hint">{q.notes}</div> : null}</td>
              <td className="hint">{describeTiming(q.timing) || '—'}</td>
              <td className="hint">{q.movedChannels ? `${q.movedChannels} channel(s) change` : '—'}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </>
  );
}

function PalettesTable({ show }: { show: ParsedShow }) {
  return (
    <>
      <p className="hint" style={{ margin: 8 }}>Presets and palettes are kept as a reference list. They stay in Eos and keep working there; looks can trigger presets by number.</p>
      <table className="data-table">
        <thead><tr><th>Type</th><th>Number</th><th>Label</th><th>Channels</th><th>Parameters</th></tr></thead>
        <tbody>
          {show.palettes.map((p) => (
            <tr key={`${p.kind}:${p.number}`}><td>{PALETTE_NAMES[p.kind]}</td><td>{p.number}</td><td>{p.label || <span className="hint">no label</span>}</td>
              <td className="hint">{p.channels.length ? channelExpression(p.channels) : '—'}</td><td className="hint">{p.parameters.join(', ') || '—'}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function SubsTable({ show, plan }: { show: ParsedShow; plan: ImportPlan }) {
  const subs = new Map(plan.config.submasters.map((s) => [s.sub, s]));
  return (
    <table className="data-table">
      <thead><tr><th>Sub</th><th>Label</th><th>Channels</th><th /></tr></thead>
      <tbody>
        {show.subs.map((s) => (
          <tr key={s.number}><td>{s.number}</td><td>{s.label || <span className="hint">no label</span>}</td>
            <td className="hint">{s.channels.length ? channelExpression(s.channels) : '—'}</td>
            <td>{subs.get(s.number)?.protected && <span className="badge err">protected</span>}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function IssuesList({ show, plan }: { show: ParsedShow; plan: ImportPlan }) {
  const sev = (i: ImportIssue) => (i.severity === 'error' ? 'err' : i.severity === 'warning' ? 'warn' : '');
  return (
    <div style={{ padding: 8 }}>
      {plan.conflicts.length > 0 && (
        <>
          <strong>Conflicts with your current setup</strong>
          <table className="data-table">
            <thead><tr><th>Item</th><th>In Sanctuary Light now</th><th>In the Eos export</th><th>Result</th></tr></thead>
            <tbody>{plan.conflicts.map((c, i) => <tr key={i}><td>{c.key}</td><td className="hint">{c.local}</td><td className="hint">{c.imported}</td><td>{c.resolution === 'used-imported' ? 'Eos data' : 'Kept yours'}</td></tr>)}</tbody>
          </table>
        </>
      )}
      <strong>From the file</strong>
      {show.issues.length === 0 ? <p className="hint">No problems found.</p> : (
        <ul className="issue-list">{show.issues.map((i, k) => <li key={k}><span className={`badge ${sev(i)}`}>{i.severity}</span> {i.line ? <span className="hint">line {i.line}: </span> : null}{i.message}</li>)}</ul>
      )}
      {show.uninterpreted.total > 0 && (
        <details>
          <summary><strong>Not interpreted ({show.uninterpreted.total})</strong> <span className="hint">read, but not used by Sanctuary Light. It all stays in Eos.</span></summary>
          <ul className="hint">{Object.entries(show.uninterpreted.byKind).map(([k, n]) => <li key={k}>{k}: {n}</li>)}</ul>
          <pre className="hint" style={{ whiteSpace: 'pre-wrap' }}>{show.uninterpreted.samples.map((s) => `line ${s.line}: ${s.text}`).join('\n')}</pre>
        </details>
      )}
    </div>
  );
}

// ───────────────────────────── step 4: done ─────────────────────────────

function DoneStep({ show, result, onClose }: { show: ParsedShow; result: ApplyResponse; onClose(): void }) {
  const startArranging = useApp((s) => s.startArranging);
  const c = result.changes;
  return (
    <div>
      <h4><CheckCircle2 size={18} color="var(--ok)" style={{ verticalAlign: -3 }} /> Your Eos show is in Sanctuary Light</h4>
      <ul className="checklist">
        <li>{c.fixtures.added + c.fixtures.updated} fixtures, {c.groups.added + c.groups.updated} groups, {c.cueLists.added + c.cueLists.updated} cue lists and {c.looks.added} looks imported from <strong>{show.fileName}</strong>.</li>
        <li>Your previous setup was saved as <code>{result.backup}</code>. <strong>Undo import</strong> below (or in Settings → Backup) puts it back.</li>
        <li>Nothing was sent to Eos. The show in Eos, the Gadget II, the wireless DMX and SceneStation are unchanged.</li>
        <li>Groups start <strong>unverified</strong>. Verify them in Monitor mode before relying on them live.</li>
        <li>Imported looks fire the real Eos cues and are hidden from volunteers until you choose them in Settings → Looks.</li>
      </ul>
      {result.unplaced.length > 0 && (
        <div className="card">
          <LayoutGrid size={16} style={{ verticalAlign: -3 }} /> <strong>{result.unplaced.length} fixtures need a place on the stage.</strong>
          <p className="hint">An Eos export doesn't say where lights hang, so new fixtures wait in a "Not yet placed" area below the stage plan until you drag each one to where it really is. Sanctuary Light never guesses positions.</p>
        </div>
      )}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" onClick={onClose}>Close</button>
        <UndoImportButton className="btn ghost" onDone={onClose} />
        <span className="spacer" />
        <button className="btn primary" onClick={startArranging}><LayoutGrid size={16} />Start arranging my sanctuary</button>
      </div>
    </div>
  );
}
