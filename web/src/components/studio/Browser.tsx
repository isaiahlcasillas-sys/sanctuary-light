/**
 * Fixture and group browser (left panel). Selecting here is the same as selecting on the
 * stage. Labels are the friendly names; Eos numbers are shown small, for reference.
 */
import { useMemo, useState, type MouseEvent } from 'react';
import { Lock, Palette, Search } from 'lucide-react';
import { controlsUnknown, supportedParams } from '@sanctuary/shared';
import { AREA_COLORS, AREA_LABELS, AREA_ORDER } from '../../lib/setup';
import { useApp } from '../../state/store';
import { Tip } from '../ui';

type Tab = 'groups' | 'fixtures';
const modeFor = (e: MouseEvent) => (e.shiftKey || e.metaKey || e.ctrlKey ? 'toggle' : 'replace') as 'toggle' | 'replace';

export function Browser() {
  const config = useApp((s) => s.config)!;
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const designer = useApp((s) => s.designer);
  const [tab, setTab] = useState<Tab>('groups');
  const [q, setQ] = useState('');
  const sel = useMemo(() => new Set(selection), [selection]);
  const profiles = useMemo(() => new Map(config.profiles.map((p) => [p.id, p])), [config.profiles]);
  const needle = q.trim().toLowerCase();
  const match = (...s: (string | number | null | undefined)[]) => !needle || s.some((x) => String(x ?? '').toLowerCase().includes(needle));

  const groups = config.groups.filter((g) => match(g.name, g.eosLabel, g.eosGroup));
  const fixtures = config.fixtures.filter((f) => match(f.label, f.channel, f.eosType, profiles.get(f.profileId)?.name));

  return (
    <div className="browser">
      <div className="seg" role="tablist" aria-label="Browse">
        <button role="tab" aria-selected={tab === 'groups'} data-on={tab === 'groups'} onClick={() => setTab('groups')}>Groups</button>
        <button role="tab" aria-selected={tab === 'fixtures'} data-on={tab === 'fixtures'} onClick={() => setTab('fixtures')}>Fixtures</button>
      </div>
      <label className="search">
        <Search size={14} aria-hidden />
        <input placeholder={tab === 'groups' ? 'Search groups' : 'Search name, channel, type'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </label>
      <div className="browser-list">
        {tab === 'groups' ? (
          groups.length === 0 ? <p className="hint">No groups match.</p> : groups.map((g) => {
            const all = g.channels.length > 0 && g.channels.every((c) => sel.has(c));
            const inLook = designer ? g.channels.filter((c) => designer.states[c]).length : 0;
            return (
              <button key={g.id} className="browser-row" data-on={all} aria-pressed={all}
                onClick={(e) => select(g.channels, e.shiftKey || e.metaKey || e.ctrlKey ? 'add' : 'replace')}>
                <span className="swatch" style={{ background: g.color }} aria-hidden />
                <span className="grow">
                  <span className="row-title">{g.name}</span>
                  <span className="row-sub">{g.channels.length} light{g.channels.length === 1 ? '' : 's'}{g.eosGroup != null ? ` · Eos group ${g.eosGroup}` : ''}{designer && inLook ? ` · ${inLook} in look` : ''}</span>
                </span>
                {g.volunteerVisible && <Tip label="Volunteers can adjust this group"><span className="mini-badge">Vol</span></Tip>}
              </button>
            );
          })
        ) : (
          AREA_ORDER.map((area) => {
            const list = fixtures.filter((f) => f.area === area).sort((a, b) => a.channel - b.channel);
            if (!list.length) return null;
            return (
              <div key={area} className="browser-group">
                <button className="browser-group-head" onClick={(e) => select(list.map((f) => f.channel), e.shiftKey ? 'add' : 'replace')} title={`Select all ${AREA_LABELS[area]}`}>
                  <span className="swatch" style={{ background: AREA_COLORS[area] }} aria-hidden />{AREA_LABELS[area]}<span className="hint">{list.length}</span>
                </button>
                {list.map((f) => {
                  const p = profiles.get(f.profileId);
                  const caps = supportedParams(p);
                  const unconfirmed = controlsUnknown(p);
                  return (
                    <button key={f.id} className="browser-row fixture-row" data-on={sel.has(f.channel)} aria-pressed={sel.has(f.channel)} onClick={(e) => select([f.channel], modeFor(e))}>
                      <span className="chan">{f.channel}</span>
                      <span className="grow">
                        <span className="row-title">{f.label}</span>
                        <span className="row-sub">{f.eosType || p?.name || 'Type unknown'}{f.unplaced ? ' · not placed' : ''}</span>
                      </span>
                      {designer?.states[f.channel] && <span className="in-look-dot" title="In this look" aria-label="In this look" />}
                      {caps.has('rgb') && <Palette size={13} aria-label="Color" />}
                      {unconfirmed && <Tip label="Controls not confirmed by the import: intensity only"><span className="unknown-mark" tabIndex={0}>?</span></Tip>}
                      {f.protected && <Lock size={13} aria-label="Protected" color="var(--err)" />}
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
      {selection.length > 0 && (
        <div className="browser-foot">
          <span>{selection.length} selected</span>
          <button className="btn sm ghost" onClick={() => select([])}>Clear</button>
        </div>
      )}
    </div>
  );
}
