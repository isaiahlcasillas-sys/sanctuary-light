/**
 * Sanctuary Setup: the guided path from installation to supervised testing.
 *   Import My Eos Show → Review Fixtures → Arrange Sanctuary → Worship Looks →
 *   Verify with Eos → Supervised Testing
 * Nothing on these screens sends a lighting command. Verification reads from Eos only in
 * Monitor mode, and only when the operator asks.
 */
import { CheckCircle2, Circle, FileUp, FlaskConical, LayoutGrid, ListChecks, ScanSearch, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { setupProgress } from '../../lib/setup';
import { useApp, type SetupStep } from '../../state/store';
import { ArrangeStep } from './ArrangeStep';
import { FirstConnection } from './FirstConnection';
import { FixtureReview } from './FixtureReview';
import { ImportStep } from './ImportStep';
import { ShowVerification } from './ShowVerification';
import { WorshipLooks } from './WorshipLooks';

const STEPS: { id: SetupStep; title: string; icon: ReactNode }[] = [
  { id: 'import', title: 'Import my Eos show', icon: <FileUp size={16} /> },
  { id: 'review', title: 'Review fixtures', icon: <ListChecks size={16} /> },
  { id: 'arrange', title: 'Arrange sanctuary', icon: <LayoutGrid size={16} /> },
  { id: 'looks', title: 'Worship looks', icon: <Sparkles size={16} /> },
  { id: 'verify', title: 'Verify with Eos', icon: <ScanSearch size={16} /> },
  { id: 'testing', title: 'Supervised testing', icon: <FlaskConical size={16} /> },
];

export function SanctuarySetup() {
  const config = useApp((s) => s.config)!;
  const status = useApp((s) => s.status);
  const step = useApp((s) => s.setupStep);
  const setStep = useApp((s) => s.setSetupStep);
  const progress = setupProgress(config, status?.groupVerification);
  const index = STEPS.findIndex((s) => s.id === step);

  const go = (id: SetupStep) => {
    const st = useApp.getState();
    if (st.editLayout && id !== 'arrange' && st.draftFixtures && JSON.stringify(st.draftFixtures) !== JSON.stringify(st.config?.fixtures)) {
      st.toast('info', 'You have unsaved stage changes: press Save arrangement (or Discard) first.');
      return;
    }
    if (id === 'arrange' && !st.editLayout) st.setEditLayout(true);
    if (id !== 'arrange' && st.editLayout) st.discardLayout();
    setStep(id);
  };

  return (
    <main className="setup" aria-label="Sanctuary setup">
      <nav className="setup-rail" aria-label="Setup steps">
        <div className="setup-rail-head">
          <strong>Sanctuary setup</strong>
          <span className="hint">From your Eos show to a supervised first test. Nothing here changes Eos.</span>
        </div>
        {STEPS.map((s, i) => (
          <button key={s.id} className="setup-step" data-active={s.id === step} aria-current={s.id === step ? 'step' : undefined} onClick={() => go(s.id)}>
            <span className="setup-step-mark">{progress[s.id].done ? <CheckCircle2 size={18} color="var(--ok)" /> : <Circle size={18} />}</span>
            <span className="setup-step-text">
              <span className="setup-step-title">{i + 1}. {s.title}</span>
              <span className="hint">{progress[s.id].text}</span>
            </span>
          </button>
        ))}
      </nav>
      <section className="setup-body" aria-label={STEPS[index]?.title}>
        {step === 'import' && <ImportStep onNext={() => go('review')} />}
        {step === 'review' && <FixtureReview onNext={() => go('arrange')} />}
        {step === 'arrange' && <ArrangeStep onNext={() => go('looks')} />}
        {step === 'looks' && <WorshipLooks onNext={() => go('verify')} />}
        {step === 'verify' && <ShowVerification onNext={() => go('testing')} />}
        {step === 'testing' && <FirstConnection goTo={go} />}
      </section>
    </main>
  );
}

/** Heading used by every setup screen. */
export function StepHeader({ title, intro, children }: { title: string; intro: ReactNode; children?: ReactNode }) {
  return (
    <header className="step-head">
      <div className="grow">
        <h2>{title}</h2>
        <p className="hint">{intro}</p>
      </div>
      {children}
    </header>
  );
}
