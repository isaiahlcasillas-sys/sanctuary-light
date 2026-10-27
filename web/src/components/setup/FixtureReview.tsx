/**
 * Step 2: review every imported fixture and group. Grouped by Eos fixture type and by the
 * controls Sanctuary Light will offer; flags everything the import could not verify.
 * Renaming here changes only Sanctuary Light's labels: channel numbers and Eos group
 * numbers (the identities Eos uses) never change.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Save, Undo2 } from 'lucide-react';
import { channelExpression, type AreaId, type Fixture, type FixtureGroup } from '@sanctuary/shared';
import { api } from '../../lib/api';
import { AREA_LABELS, AREA_ORDER, CAP_LABELS, fixtureFlags, type FlagKind } from '../../lib/setup';
import { useApp } from '../../state/store';
import { StepHeader } from './SanctuarySetup';

type Filter = 'all' | 'attention' | AreaId;
const FLAG_SUMMARY: Record<FlagKind, string> = {
  'unknown-type': 'fixture type unknown', 'assumed-controls': 'controls not confirmed', 'no-address': 'no DMX address',
  'no-group': 'not in any group', unplaced: 'not placed on stage', protected: 'protected', renamed: 'renamed here',
};

export function FixtureReview({ onNext }: { onNext(): void }) {
  const config = useApp((s) => s.config)!;
  const status = useApp((s) => s.status);
  const [fixtures, setFixtures] = useState<Fixture[]>(config.fixtures);
  const [groups, setGroups] = useState<FixtureGroup[]>(config.groups);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(fixtures) !== JSON.stringify(config.fixtures) || JSON.stringify(groups) !== JSON.stringify(config.groups);
  const profiles = useMemo(() => new Map(config.profiles.map((p) => [p.id, p])), [config.profiles]);
  const grouped = useMemo(() => new Set(groups.flatMap((g) => g.channels)), [groups]);
  const flags = useMemo(() => new Map(fixtures.map((f) => [f.channel, fixtureFlags(f, profiles.get(f.profileId), grouped.has(f.channel))])), [fixtures, profiles, grouped]);
  const counts = useMemo(() => {
    const c: Partial<Record<FlagKind, number>> = {};
    for (const list of flags.values()) for (const fl of list) c[fl.kind] = (c[fl.kind] ?? 0) + 1;
    return c;
  }, [flags]);
  const attention = fixtures.filter((f) => flags.get(f.channel)!.some((x) => x.attention)).length;
  const imported = config.eosShow;
  const fc = config.settings.commissioning.firstConnection;
  const reviewed = !!(imported && fc?.patchReviewedAt && fc.patchReviewedAt >= imported.importedAt);

  const shown = fixtures.filter((f) => (filter === 'all' || (filter === 'attention' ? flags.get(f.channel)!.some((x) => x.attention) : f.area === filter))
    && (!query || `${f.channel} ${f.label} ${f.eosLabel ?? ''} ${f.eosType ?? ''}`.toLowerCase().includes(query.toLowerCase())));
  // Sections: Eos fixture type, then the controls Sanctuary Light will offer.
  const sections = useMemo(() => {
    const m = new Map<string, Fixture[]>();
    for (const f of shown) {
      const p = profiles.get(f.profileId);
      const key = `${f.eosType ?? (p && p.id !== 'generic' ? p.name : 'Unknown fixture type')}|${(p?.capabilities ?? ['intensity']).join('+')}`;
      m.set(key, [...(m.get(key) ?? []), f]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown, profiles]);

  const updF = (channel: number, patch: Partial<Fixture>) => setFixtures(fixtures.map((f) => (f.channel === channel ? { ...f, ...patch } : f)));
  const updG = (id: string, patch: Partial<FixtureGroup>) => setGroups(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const save = async () => {
    setSaving(true);
    try {
      if (JSON.stringify(fixtures) !== JSON.stringify(config.fixtures)) await api.put('/api/config/fixtures', fixtures);
      if (JSON.stringify(groups) !== JSON.stringify(config.groups)) await api.put('/api/config/groups', groups);
      useApp.getState().toast('info', 'Saved on this computer. Channel and group numbers in Eos are unchanged.');
    } catch (e) { useApp.getState().toast('error', (e as Error).message); }
    setSaving(false);
  };
  const markReviewed = async (done: boolean) => {
    try { await api.post('/api/first-connection', { step: 'reviewed', done }); }
    catch (e) { useApp.getState().toast('error', (e as Error).message); }
  };

  return (
    <div>
      <StepHeader title="Review fixtures" intro="Every channel from your show, sorted by fixture type and by the controls Sanctuary Light will offer. Rename things for volunteers and set each fixture's category; channel numbers and Eos group numbers never change.">
        {dirty && <button className="btn" onClick={() => { setFixtures(config.fixtures); setGroups(config.groups); }}><Undo2 size={15} />Revert</button>}
        <button className="btn primary" disabled={!dirty || saving} onClick={() => void save()}><Save size={15} />{saving ? 'Saving…' : 'Save changes'}</button>
      </StepHeader>

      <div className="card" data-tone={attention ? 'warn' : 'ok'}>
        <strong>{attention ? <><AlertTriangle size={15} style={{ verticalAlign: -3 }} /> What the import could not verify</> : <><CheckCircle2 size={15} style={{ verticalAlign: -3 }} /> Nothing flagged in the import</>}</strong>
        <ul className="hint" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {(Object.keys(FLAG_SUMMARY) as FlagKind[]).filter((k) => counts[k]).map((k) => <li key={k}>{counts[k]} {FLAG_SUMMARY[k]}</li>)}
          <li>{config.verification && !config.verification.simulatedConsole
            ? `Last compared with Eos on ${new Date(config.verification.at).toLocaleString()}.`
            : 'Nothing has been compared with the console yet: a file the importer accepted is not proof it matches Eos. Use Verify with Eos (step 5).'}</li>
        </ul>
      </div>

      <div className="row wrap" style={{ margin: '10px 0' }}>
        <div className="tabs" role="tablist" style={{ margin: 0 }}>
          {(['all', 'attention', ...AREA_ORDER] as Filter[]).map((k) => {
            const n = k === 'all' ? fixtures.length : k === 'attention' ? attention : fixtures.filter((f) => f.area === k).length;
            if (k !== 'all' && k !== 'attention' && !n) return null;
            return <button key={k} role="tab" aria-selected={filter === k} data-on={filter === k} onClick={() => setFilter(k)}>{k === 'all' ? 'All' : k === 'attention' ? 'Needs attention' : AREA_LABELS[k]} ({n})</button>;
          })}
        </div>
        <input className="input grow" placeholder="Find a channel or name…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find fixture" />
      </div>

      {sections.map(([key, list]) => {
        const p = profiles.get(list[0].profileId);
        const [type] = key.split('|');
        return (
          <section key={key} className="type-section">
            <header className="row wrap">
              <strong>{type}</strong>
              {p && p.id !== 'generic' && p.manufacturer && <span className="hint">{p.manufacturer}</span>}
              <span className="hint">· {list.length} fixture{list.length === 1 ? '' : 's'}</span>
              <span className="spacer" />
              {(p?.capabilities ?? ['intensity']).map((c) => <span key={c} className="badge">{CAP_LABELS[c]}</span>)}
              {p && !p.verified && <span className="badge warn">not confirmed</span>}
            </header>
            {p?.notes && <p className="hint" style={{ margin: '2px 0 6px' }}>{p.notes}</p>}
            <table className="data-table">
              <thead><tr><th style={{ width: 70 }}>Chan</th><th>Label (Sanctuary Light)</th><th style={{ width: 90 }}>DMX</th><th style={{ width: 170 }}>Category</th><th>Notes</th></tr></thead>
              <tbody>
                {list.map((f) => (
                  <tr key={f.channel}>
                    <td><strong>{f.channel}</strong></td>
                    <td><input className="input" value={f.label} aria-label={`Label for channel ${f.channel}`} onChange={(e) => updF(f.channel, { label: e.target.value })} /></td>
                    <td>{f.dmx ? `${f.dmx.universe}/${f.dmx.address}` : <span className="badge warn">none</span>}</td>
                    <td><select className="select" value={f.area} aria-label={`Category for channel ${f.channel}`} onChange={(e) => updF(f.channel, { area: e.target.value as AreaId })}>
                      {AREA_ORDER.map((a) => <option key={a} value={a}>{AREA_LABELS[a]}</option>)}</select></td>
                    <td className="flag-cell">{flags.get(f.channel)!.map((fl) => <span key={fl.kind} className={`badge ${fl.attention ? 'warn' : fl.kind === 'protected' ? 'err' : ''}`} title={fl.text}>{FLAG_SUMMARY[fl.kind]}</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {!sections.length && <p className="hint">No fixtures match.</p>}

      <h3 className="section-title" style={{ marginTop: 20 }}>Groups</h3>
      <p className="hint">The <strong>name</strong> is what volunteers see. The Eos group number and Eos label stay as they are in Eos.</p>
      <table className="data-table">
        <thead><tr><th>Name volunteers see</th><th>Eos group</th><th>Channels</th><th>Checked against Eos</th><th>Volunteers</th></tr></thead>
        <tbody>
          {groups.map((g) => {
            const gv = status?.groupVerification[g.id];
            return (
              <tr key={g.id}>
                <td><input className="input" value={g.name} aria-label={`Name for group ${g.eosGroup ?? g.name}`} onChange={(e) => updG(g.id, { name: e.target.value })} /></td>
                <td>{g.eosGroup != null ? <>{g.eosGroup}{g.eosLabel !== undefined && <span className="hint"> · in Eos: {g.eosLabel || '(no label)'}</span>}</> : <span className="hint">local only</span>}</td>
                <td className="hint">{channelExpression(g.channels) || '—'}</td>
                <td>{g.eosGroup == null ? <span className="hint">—</span> : gv?.state === 'verified' ? <span className="badge confirmed">verified</span> : gv?.state === 'mismatch' || gv?.state === 'protected' ? <span className="badge err">{gv.state}</span> : <span className="badge warn">not yet</span>}</td>
                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={g.volunteerVisible} aria-label={`Volunteers can use ${g.name}`} onChange={(e) => updG(g.id, { volunteerVisible: e.target.checked })} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="row step-foot">
        {imported ? (
          <label className="row"><input type="checkbox" checked={reviewed} disabled={dirty} onChange={(e) => void markReviewed(e.target.checked)} />
            I've reviewed the imported patch and the flagged items{dirty ? ' (save first)' : ''}</label>
        ) : <span className="hint">Import your Eos show first (step 1) — these are sample fixtures.</span>}
        <span className="spacer" />
        <button className="btn primary" onClick={onNext} disabled={dirty}>Arrange sanctuary<ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
