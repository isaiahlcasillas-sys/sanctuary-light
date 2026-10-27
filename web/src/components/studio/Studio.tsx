/**
 * The operator's design workspace: a large stage in the middle, the fixture and group browser
 * on the left, the inspector on the right, and looks, cues and submasters in a collapsible
 * bottom panel. Every panel can be hidden, and the stage can fill the window.
 */
import { ChevronDown, ChevronUp, Clapperboard, Library, Maximize2, Minimize2, PanelBottom, PanelLeft, PanelRight, SlidersVertical } from 'lucide-react';
import { useEffect } from 'react';
import { useApp, type BottomTab } from '../../state/store';
import { CuePanel } from '../CuePanel';
import { StageView } from '../StageView';
import { SubmasterBank } from '../SubmasterBank';
import { Tip } from '../ui';
import { Browser } from './Browser';
import { DesignerBar } from './DesignerBar';
import { Inspector } from './Inspector';
import { LookLibrary } from './LookLibrary';

const TABS: { id: BottomTab; label: string; icon: JSX.Element }[] = [
  { id: 'looks', label: 'Looks', icon: <Library size={14} /> },
  { id: 'cues', label: 'Cues', icon: <Clapperboard size={14} /> },
  { id: 'subs', label: 'Submasters', icon: <SlidersVertical size={14} /> },
];

export function Studio() {
  const panels = useApp((s) => s.panels);
  const toggle = useApp((s) => s.togglePanel);
  const tab = useApp((s) => s.bottomTab);
  const setTab = useApp((s) => s.setBottomTab);
  const designer = useApp((s) => s.designer);
  const max = panels.maximized;
  const left = panels.left && !max; const right = panels.right && !max; const bottom = panels.bottom && !max;

  // Keyboard: Escape leaves full-stage view; F toggles it (outside text fields).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      if (e.key === 'Escape' && useApp.getState().panels.maximized) toggle('maximized');
      else if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) toggle('maximized');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const toolbar = (
    <div className="panel-toggles" role="group" aria-label="Panels">
      <Tip label={left ? 'Hide browser' : 'Show browser'}><button className={`btn sm icon ${left ? 'active' : ''}`} aria-pressed={left} aria-label="Fixture browser" disabled={max} onClick={() => toggle('left')}><PanelLeft size={15} /></button></Tip>
      <Tip label={bottom ? 'Hide looks & cues' : 'Show looks & cues'}><button className={`btn sm icon ${bottom ? 'active' : ''}`} aria-pressed={bottom} aria-label="Looks and cues panel" disabled={max} onClick={() => toggle('bottom')}><PanelBottom size={15} /></button></Tip>
      <Tip label={right ? 'Hide inspector' : 'Show inspector'}><button className={`btn sm icon ${right ? 'active' : ''}`} aria-pressed={right} aria-label="Inspector" disabled={max} onClick={() => toggle('right')}><PanelRight size={15} /></button></Tip>
      <Tip label={max ? 'Show panels (Esc)' : 'Full stage (F)'}><button className={`btn sm icon ${max ? 'active' : ''}`} aria-pressed={max} aria-label={max ? 'Show panels' : 'Full stage view'} onClick={() => toggle('maximized')}>{max ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button></Tip>
    </div>
  );

  return (
    <main className="studio" data-left={left} data-right={right} data-bottom={bottom} aria-label="Design workspace" style={{
      gridTemplateColumns: [left && 'var(--left-w)', 'minmax(0, 1fr)', right && 'var(--right-w)'].filter(Boolean).join(' '),
      gridTemplateAreas: `"${[left && 'left', 'center', right && 'right'].filter(Boolean).join(' ')}" "${[left && 'bottom', 'bottom', right && 'bottom'].filter(Boolean).join(' ')}"`,
    }}>
      {left && <aside className="studio-left panel" aria-label="Fixtures and groups"><Browser /></aside>}
      <div className="studio-center">
        {designer && <DesignerBar />}
        <StageView toolbarExtra={toolbar} hideGroupChips />
      </div>
      {right && <aside className="studio-right panel" aria-label="Inspector"><Inspector /></aside>}
      {!max && <section className="studio-bottom panel" data-open={bottom} aria-label="Looks, cues and submasters">
        <div className="bottom-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} data-on={tab === t.id && bottom}
              onClick={() => { setTab(t.id); if (!bottom && !max) toggle('bottom'); }}>{t.icon}{t.label}</button>
          ))}
          <span className="spacer" />
          {<button className="btn sm icon ghost" aria-label={bottom ? 'Collapse panel' : 'Expand panel'} onClick={() => toggle('bottom')}>{bottom ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>}
        </div>
        {bottom && (
          <div className="bottom-body">
            {tab === 'looks' && <LookLibrary />}
            {tab === 'cues' && <CuePanel />}
            {tab === 'subs' && <SubmasterBank />}
          </div>
        )}
      </section>}
    </main>
  );
}
