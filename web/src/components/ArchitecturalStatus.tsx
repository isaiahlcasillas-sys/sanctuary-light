/**
 * Architectural Status: explains the relationship with the SceneStation wall stations.
 * Read-only and informational — Sanctuary Light has no control path to SceneStation.
 */
import { AlertTriangle, Building2, CheckCircle2, HelpCircle, Info, Pencil, ShieldOff } from 'lucide-react';
import {
  analyzeFailures, describeDmxRole, describeLossAction,
  type Confidence, type SceneStationRecord, type UpstreamDevice,
} from '@sanctuary/shared';
import { useApp } from '../state/store';

const CONFIDENCE: Record<Confidence, { cls: string; label: string }> = {
  'by-design': { cls: 'confirmed', label: 'By design' },
  documented: { cls: 'confirmed', label: 'Documented' },
  'needs-audit': { cls: 'warn', label: 'Needs audit' },
  hazard: { cls: 'err', label: 'Hazard' },
};

const UPSTREAM_TEXT: Record<UpstreamDevice['lossBehavior'], string> = {
  unknown: 'Not yet checked',
  'holds-last-look': 'Holds the last look when Eos stops',
  'stops-output': 'Stops DMX output when Eos stops',
  'fades-out': 'Fades out when Eos stops',
};

export function ArchitecturalStatus({ onEdit }: { onEdit?(): void }) {
  const config = useApp((s) => s.config);
  const role = useApp((s) => s.role);
  if (!config) return null;
  const arch = config.architecture;
  const scenarios = analyzeFailures(arch);
  const verified = arch.stations.filter((s) => s.verified).length;

  return (
    <main className="arch" aria-label="Architectural status">
      <section className="arch-hero panel">
        <ShieldOff size={28} />
        <div>
          <h1>Architectural lighting (SceneStation)</h1>
          <p><strong>Sanctuary Light does not control the SceneStation wall stations</strong> and cannot see their state. Nothing on this page sends anything. It records how the building is wired and explains, from the manufacturer's manual, what happens in each situation.</p>
        </div>
        {role === 'operator' && onEdit && <button className="btn" onClick={onEdit}><Pencil size={15} />Edit audit records</button>}
      </section>

      <section className="panel">
        <div className="panel-head"><Info size={16} /><h2>For volunteers</h2></div>
        <div className="panel-body arch-guidance">{arch.volunteerGuidance}</div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>System audit</h2><span className="spacer" />
          {arch.auditCompletedAt
            ? <span className="badge confirmed"><CheckCircle2 size={12} />Completed {new Date(arch.auditCompletedAt).toLocaleDateString()}{arch.auditBy ? ` by ${arch.auditBy}` : ''}</span>
            : <span className="badge warn"><HelpCircle size={12} />Not yet done — see docs/SYSTEM_AUDIT.md</span>}
        </div>
        <div className="panel-body">
          <div className="hint">{verified} of {arch.stations.length} SceneStation record{arch.stations.length === 1 ? '' : 's'} physically verified. Unverified records are guesses.</div>
          <div className="arch-cards">
            {arch.stations.map((s) => <StationCard key={s.id} s={s} />)}
          </div>
          <h3 className="section-title" style={{ marginTop: 14 }}>Between Eos and the lights</h3>
          <table className="data-table">
            <thead><tr><th>Device</th><th>Role</th><th>When Eos stops</th><th>Feeds</th><th /></tr></thead>
            <tbody>
              {arch.upstream.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td><td className="hint">{u.role}</td><td>{UPSTREAM_TEXT[u.lossBehavior]}</td><td className="hint">{u.feedsLines || '—'}</td>
                  <td>{u.verified ? <span className="badge confirmed">verified</span> : <span className="badge warn">unverified</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>What happens if…</h2></div>
        <div className="panel-body">
          <table className="data-table arch-scenarios">
            <thead><tr><th style={{ width: '24%' }}>Situation</th><th>What happens</th><th style={{ width: 110 }}>Basis</th><th style={{ width: '24%' }}>What to do</th></tr></thead>
            <tbody>
              {scenarios.map((sc) => (
                <tr key={sc.id}>
                  <td><strong>{sc.scenario}</strong></td>
                  <td>{sc.confidence === 'hazard' && <AlertTriangle size={14} color="var(--err)" style={{ verticalAlign: -2, marginRight: 4 }} />}{sc.outcome}</td>
                  <td><span className={`badge ${CONFIDENCE[sc.confidence].cls}`}>{CONFIDENCE[sc.confidence].label}</span></td>
                  <td className="hint">{sc.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Control availability</h2></div>
        <div className="panel-body">
          <table className="data-table">
            <tbody>
              <tr><td>Change SceneStation presets from Sanctuary Light</td><td><span className="badge err">Not available</span></td><td className="hint">No integration exists. SceneStation has no network/IP interface. Possible future paths (IR codes via an IP-to-IR adapter, or new wiring) need hardware and testing — see docs/SCENESTATION.md.</td></tr>
              <tr><td>Read SceneStation state</td><td><span className="badge err">Not available</span></td><td className="hint">Not reported anywhere this app can read.</td></tr>
              <tr><td>House lights during services</td><td><span className="badge confirmed">Through Eos</span></td><td className="hint">Only channels patched in Eos, using the groups and protections in this app.</td></tr>
              <tr><td>SceneStation Studio (programming)</td><td><span className="badge">Separate tool</span></td><td className="hint">Interactive Technologies' own Mac/Windows software with its USB RF adaptor. Not part of this app.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function StationCard({ s }: { s: SceneStationRecord }) {
  return (
    <div className="arch-card">
      <header>
        <Building2 size={16} />
        <strong>{s.name}</strong>
        <span className="spacer" />
        {s.verified ? <span className="badge confirmed">verified</span> : <span className="badge warn">unverified</span>}
      </header>
      <dl>
        <dt>Location</dt><dd>{s.location || '—'}</dd>
        <dt>Model / firmware</dt><dd>{s.model || 'unknown'}{s.firmware ? ` · ${s.firmware}` : ''}</dd>
        <dt>DMX</dt><dd>{describeDmxRole(s.dmxRole)}{s.dmxLine ? ` (${s.dmxLine})` : ''}</dd>
        <dt>If console DMX stops</dt><dd>{s.dmxRole === 'inline-backup' ? `The station ${describeLossAction(s.lossAction, s.lossPreset)}.` : '—'}</dd>
        <dt>Buttons</dt><dd>{s.buttons || '—'}</dd>
      </dl>
      {s.notes && <p className="hint">{s.notes}</p>}
    </div>
  );
}
