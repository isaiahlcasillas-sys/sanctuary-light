import { useState } from 'react';
import { useApp } from './state/store';
import { TopBar, ModeBanner } from './components/TopBar';
import { StageView } from './components/StageView';
import { ControlPanel } from './components/ControlPanel';
import { LooksGrid } from './components/LooksGrid';
import { CuePanel } from './components/CuePanel';
import { SubmasterBank } from './components/SubmasterBank';
import { VolunteerView } from './components/VolunteerView';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { Toasts } from './components/Toasts';
import { SetupWizard } from './components/SetupWizard';
import { ArchitecturalStatus } from './components/ArchitecturalStatus';
import { SaveLookButton } from './components/SaveLookButton';
import { EosImportWizard } from './components/import/EosImportWizard';
import { SanctuarySetup } from './components/setup/SanctuarySetup';

export function App() {
  const config = useApp((s) => s.config);
  const uiMode = useApp((s) => s.uiMode);
  const role = useApp((s) => s.role);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('connection');
  const wizardOpen = useApp((s) => s.wizardOpen);
  const advanced = uiMode === 'advanced' && role === 'operator';

  return (
    <div className="app">
      <TopBar onOpenSettings={() => { setSettingsTab('connection'); setSettingsOpen(true); }} />
      <ModeBanner />
      {!config ? (
        <div style={{ display: 'grid', placeItems: 'center' }} className="hint">Connecting to the Sanctuary Light server…</div>
      ) : uiMode === 'setup' && role === 'operator' ? (
        <SanctuarySetup />
      ) : uiMode === 'architecture' ? (
        <ArchitecturalStatus onEdit={() => { setSettingsTab('architecture'); setSettingsOpen(true); }} />
      ) : advanced ? (
        <main className="workspace">
          <div className="area-stage"><StageView /></div>
          <ControlPanel />
          <div className="area-bottom">
            <section className="panel" aria-label="Looks" style={{ minHeight: 0, overflow: 'hidden' }}>
              <div className="panel-head"><h2>Looks</h2><span className="spacer" /><SaveLookButton /></div>
              <div className="panel-body" style={{ maxHeight: 272, overflow: 'auto' }}><LooksGrid /></div>
            </section>
            <div style={{ display: 'grid', gap: 12, alignContent: 'start', minHeight: 0, overflow: 'auto' }}>
              <CuePanel />
              <SubmasterBank />
            </div>
          </div>
        </main>
      ) : (
        <VolunteerView />
      )}
      {role === 'operator' && <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} initialTab={settingsTab} onOpenWizard={() => useApp.getState().openWizard(0)} />}
      {role === 'operator' && <SetupWizard open={wizardOpen} onOpenChange={(o) => (o ? useApp.getState().openWizard(useApp.getState().wizardStep) : useApp.getState().closeWizard())} />}
      {role === 'operator' && <EosImportWizard />}
      <Toasts />
    </div>
  );
}
