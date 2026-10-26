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

export function App() {
  const config = useApp((s) => s.config);
  const uiMode = useApp((s) => s.uiMode);
  const role = useApp((s) => s.role);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const advanced = uiMode === 'advanced' && role === 'operator';

  return (
    <div className="app">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} onOpenWizard={() => setWizardOpen(true)} />
      <ModeBanner />
      {!config ? (
        <div style={{ display: 'grid', placeItems: 'center' }} className="hint">Connecting to the Sanctuary Light server…</div>
      ) : advanced ? (
        <main className="workspace">
          <div className="area-stage"><StageView /></div>
          <ControlPanel />
          <div className="area-bottom">
            <section className="panel" aria-label="Looks" style={{ minHeight: 0, overflow: 'hidden' }}>
              <div className="panel-head"><h2>Looks</h2></div>
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
      {role === 'operator' && <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onOpenWizard={() => setWizardOpen(true)} />}
      {role === 'operator' && <SetupWizard open={wizardOpen} onOpenChange={setWizardOpen} />}
      <Toasts />
    </div>
  );
}
