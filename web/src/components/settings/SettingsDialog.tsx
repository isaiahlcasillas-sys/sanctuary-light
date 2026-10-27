import * as Tabs from '@radix-ui/react-tabs';
import { Archive, BookOpen, Building2, ClipboardCheck, Cable, Layers, ListOrdered, ScrollText, Shield, Sparkles, X, Boxes } from 'lucide-react';
import { Modal } from '../ui';
import { ConnectionSettings } from './ConnectionSettings';
import { PatchSettings } from './PatchSettings';
import { GroupSettings } from './GroupSettings';
import { LookSettings } from './LookSettings';
import { CueSubSettings } from './CueSubSettings';
import { SecuritySettings } from './SecuritySettings';
import { BackupSettings } from './BackupSettings';
import { LogView } from './LogView';
import { OscReference } from './OscReference';
import { ArchitectureSettings } from './ArchitectureSettings';
import { ReadinessSettings } from './ReadinessSettings';

const tabs = (onOpenWizard?: () => void) => [
  { id: 'connection', label: 'Connection', icon: Cable, el: <ConnectionSettings onOpenWizard={onOpenWizard} /> },
  { id: 'patch', label: 'Patch', icon: Boxes, el: <PatchSettings /> },
  { id: 'groups', label: 'Groups', icon: Layers, el: <GroupSettings /> },
  { id: 'looks', label: 'Looks', icon: Sparkles, el: <LookSettings /> },
  { id: 'cues', label: 'Cues & Subs', icon: ListOrdered, el: <CueSubSettings /> },
  { id: 'readiness', label: 'Sunday readiness', icon: ClipboardCheck, el: <ReadinessSettings /> },
  { id: 'architecture', label: 'Architectural audit', icon: Building2, el: <ArchitectureSettings /> },
  { id: 'security', label: 'Safety & Security', icon: Shield, el: <SecuritySettings /> },
  { id: 'backup', label: 'Backup', icon: Archive, el: <BackupSettings /> },
  { id: 'log', label: 'Traffic Log', icon: ScrollText, el: <LogView /> },
  { id: 'osc', label: 'OSC Reference', icon: BookOpen, el: <OscReference /> },
];

export function SettingsDialog({ open, onOpenChange, onOpenWizard, initialTab = 'connection' }: { open: boolean; onOpenChange(o: boolean): void; onOpenWizard?(): void; initialTab?: string }) {
  const TABS = tabs(onOpenWizard && (() => { onOpenChange(false); onOpenWizard(); }));
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Settings" wide>
      <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <strong style={{ fontSize: 16 }}>Settings</strong>
        <span className="hint">Saved on this computer only. Nothing here changes the Eos show file.</span>
        <span className="spacer" />
        <button className="btn sm icon ghost" aria-label="Close settings" onClick={() => onOpenChange(false)}><X size={16} /></button>
      </div>
      <Tabs.Root className="settings" defaultValue={initialTab} key={initialTab} orientation="vertical">
        <Tabs.List className="settings-nav" aria-label="Settings sections">
          {TABS.map((t) => <Tabs.Trigger key={t.id} value={t.id}><t.icon size={15} />{t.label}</Tabs.Trigger>)}
        </Tabs.List>
        {TABS.map((t) => <Tabs.Content key={t.id} value={t.id} className="settings-body">{t.el}</Tabs.Content>)}
      </Tabs.Root>
    </Modal>
  );
}
