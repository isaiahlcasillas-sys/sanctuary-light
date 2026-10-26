import { CheckCircle2, Info, MonitorSmartphone, ShieldAlert, XCircle } from 'lucide-react';
import { useApp } from '../state/store';

const ICON = { sent: CheckCircle2, simulated: MonitorSmartphone, blocked: ShieldAlert, error: XCircle, info: Info };
const PREFIX = { sent: 'Sent', simulated: 'Preview', blocked: 'Blocked', error: 'Error', info: '' };

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div key={t.id} className="toast" data-kind={t.kind} role={t.kind === 'error' || t.kind === 'blocked' ? 'alert' : 'status'} onClick={() => dismiss(t.id)}>
            <Icon size={18} />
            {PREFIX[t.kind] && <span className={`badge ${t.kind === 'sent' ? 'confirmed' : t.kind === 'simulated' ? 'sim' : 'err'}`}>{PREFIX[t.kind]}</span>}
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
