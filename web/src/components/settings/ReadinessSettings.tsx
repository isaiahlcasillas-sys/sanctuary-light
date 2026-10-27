import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, RefreshCw, XCircle } from 'lucide-react';
import type { ReadinessReport } from '@sanctuary/shared';
import { api } from '../../lib/api';
import { useApp } from '../../state/store';

const ICON = { pass: CheckCircle2, warn: AlertTriangle, fail: XCircle };
const COLOR = { pass: 'var(--ok)', warn: 'var(--warn)', fail: 'var(--err)' };

/** Read-only checklist: what is still missing before Sanctuary Light is used in worship. */
export function ReadinessSettings() {
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const config = useApp((s) => s.config);
  const load = useCallback(() => {
    api.get<ReadinessReport>('/api/readiness').then(setReport).catch((e) => useApp.getState().toast('error', (e as Error).message));
  }, []);
  useEffect(load, [load, config]);

  return (
    <div>
      <div className="row">
        <h4 className="grow">Sunday readiness</h4>
        <button className="btn sm" onClick={load}><RefreshCw size={14} />Re-check</button>
      </div>
      <p className="hint">Nothing on this page changes anything. It lists what still has to be done before Sanctuary Light is used during worship, with someone at the Eos computer as backup. See docs/SUNDAY_READINESS.md.</p>
      {report && (
        <div className="card" style={{ borderColor: report.readyForSupervisedSunday ? 'var(--ok)' : 'var(--err)' }}>
          <strong>{report.readyForSupervisedSunday
            ? 'No blocking items. Review the warnings, then a supervised Sunday is reasonable.'
            : 'Not ready for Sunday yet. Fix the red items first.'}</strong>
        </div>
      )}
      <table className="data-table">
        <tbody>
          {report?.items.map((i) => {
            const Icon = ICON[i.status];
            return (
              <tr key={i.id}>
                <td style={{ width: 28 }}><Icon size={18} color={COLOR[i.status]} aria-label={i.status} /></td>
                <td><strong>{i.label}</strong><div className="hint">{i.detail}</div></td>
                <td className="hint" style={{ width: '40%' }}>{i.fix}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
