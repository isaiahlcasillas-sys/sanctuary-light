import * as Dialog from '@radix-ui/react-dialog';
import * as RSlider from '@radix-ui/react-slider';
import * as RSwitch from '@radix-ui/react-switch';
import * as RTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import type { ValueSource } from '@sanctuary/shared';

export function Tip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content className="tooltip" sideOffset={6}>{label}</RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function Fader(props: {
  value: number; onChange(v: number): void; onCommit?(v: number): void;
  orientation?: 'vertical' | 'horizontal'; label: string; min?: number; max?: number; step?: number; disabled?: boolean;
}) {
  const { orientation = 'horizontal', min = 0, max = 100, step = 1 } = props;
  return (
    <RSlider.Root
      className="fader-root" orientation={orientation} min={min} max={max} step={step} disabled={props.disabled}
      value={[props.value]} onValueChange={(v) => props.onChange(v[0])} onValueCommit={(v) => props.onCommit?.(v[0])}
      aria-label={props.label}
    >
      <RSlider.Track className="fader-track"><RSlider.Range className="fader-range" /></RSlider.Track>
      <RSlider.Thumb className="fader-thumb" aria-label={props.label} />
    </RSlider.Root>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <RSwitch.Root className="switch-root" checked={checked} onCheckedChange={onChange} aria-label={label}>
      <RSwitch.Thumb className="switch-thumb" />
    </RSwitch.Root>
  );
}

export function Modal({ open, onOpenChange, title, description, children, wide }: {
  open: boolean; onOpenChange(o: boolean): void; title: string; description?: ReactNode; children: ReactNode; wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog${wide ? ' wide' : ''}`} aria-describedby={undefined}>
          {wide ? <Dialog.Title className="sr-only">{title}</Dialog.Title> : <Dialog.Title asChild><h3>{title}</h3></Dialog.Title>}
          {description && <Dialog.Description asChild><p>{description}</p></Dialog.Description>}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Confirm({ open, onOpenChange, title, body, confirmLabel, danger, onConfirm }: {
  open: boolean; onOpenChange(o: boolean): void; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm(): void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title}>
      <div style={{ color: 'var(--text-2)' }}>{body}</div>
      <div className="actions">
        <button className="btn" onClick={() => onOpenChange(false)}>Cancel</button>
        <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={() => { onConfirm(); onOpenChange(false); }}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

const SOURCE_TEXT: Record<ValueSource, { cls: string; label: string; tip: string }> = {
  simulated: { cls: 'sim', label: 'Simulated', tip: 'Preview only. Nothing was sent to the console.' },
  commanded: { cls: 'commanded', label: 'Commanded', tip: 'Sent to Eos. Not confirmed — Eos does not report channel levels back.' },
  confirmed: { cls: 'confirmed', label: 'Console', tip: 'Reported by the console.' },
};

export function SourceBadge({ source }: { source: ValueSource }) {
  const s = SOURCE_TEXT[source];
  return <Tip label={s.tip}><span className={`badge ${s.cls}`} tabIndex={0}><span className="dot" />{s.label}</span></Tip>;
}
