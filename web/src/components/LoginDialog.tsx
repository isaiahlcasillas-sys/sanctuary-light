import { useEffect, useState } from 'react';
import { Delete } from 'lucide-react';
import type { Role } from '@sanctuary/shared';
import { login, useApp } from '../state/store';
import { Modal } from './ui';

export function LoginDialog({ open, onOpenChange, onSuccess }: { open: boolean; onOpenChange(o: boolean): void; onSuccess?(r: Role): void }) {
  const [pin, setPin] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const role = useApp((s) => s.role);
  const error = useApp((s) => s.authError);

  useEffect(() => { if (open) { setPin(''); setSubmitted(false); useApp.setState({ authError: null }); } }, [open]);
  useEffect(() => {
    if (submitted && role) { onSuccess?.(role); onOpenChange(false); }
    if (submitted && error) { setPin(''); setSubmitted(false); }
  }, [role, error, submitted]);

  const press = (d: string) => setPin((p) => (p.length < 8 ? p + d : p));
  const submit = () => { if (pin.length >= 4) { setSubmitted(true); login(pin); } };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Sign in" description="Enter your volunteer or operator PIN.">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input className="sr-only" aria-label="PIN" inputMode="numeric" autoFocus value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
        <div className="pin-display" aria-hidden>{Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span key={i} data-on={i < pin.length} />)}</div>
        <div className="error-text" role="alert">{error}</div>
        <div className="pin-pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button type="button" key={d} onClick={() => press(d)}>{d}</button>)}
          <button type="button" aria-label="Delete" onClick={() => setPin((p) => p.slice(0, -1))}><Delete size={20} /></button>
          <button type="button" onClick={() => press('0')}>0</button>
          <button type="submit" className="primary" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>OK</button>
        </div>
      </form>
    </Modal>
  );
}
