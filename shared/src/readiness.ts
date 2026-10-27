/**
 * "Ready for a supervised Sunday?" — a read-only checklist computed from configuration
 * and commissioning records. It never changes anything; it only tells the Technical Arts
 * Director what is still missing before Sanctuary Light is used during worship.
 */
import type { AppConfig } from './model';
import { parseEosVersion } from './eosVersion';

export type ReadinessStatus = 'pass' | 'warn' | 'fail';

export interface ReadinessItem {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  fix: string;
}

export interface ReadinessInput {
  config: AppConfig;
  defaultPinsInUse: boolean;
  /** The address the server listens on: 127.0.0.1 = this Mac only, 0.0.0.0 = whole network. */
  boundHost: string;
  consoleVersion: string | null;
  hasTodaysBackup: boolean;
}

export interface ReadinessReport {
  items: ReadinessItem[];
  /** true when no item fails. Warnings still need a human decision. */
  readyForSupervisedSunday: boolean;
}

export function assessReadiness(input: ReadinessInput): ReadinessReport {
  const { config: cfg } = input;
  const c = cfg.settings.commissioning;
  const items: ReadinessItem[] = [];
  const add = (i: ReadinessItem) => items.push(i);

  add(input.defaultPinsInUse
    ? { id: 'pins', label: 'Default PINs replaced', status: 'fail', detail: 'The operator or volunteer PIN is still the factory default (1234 / 0000).', fix: 'Settings → Safety & Security → change both PINs.' }
    : { id: 'pins', label: 'Default PINs replaced', status: 'pass', detail: 'Both PINs have been changed.', fix: '' });

  const local = input.boundHost === '127.0.0.1' || input.boundHost === 'localhost' || input.boundHost === '::1';
  add(local
    ? { id: 'network', label: 'Network exposure', status: 'pass', detail: 'Only browsers on this Mac can reach Sanctuary Light.', fix: '' }
    : { id: 'network', label: 'Network exposure', status: 'warn', detail: `Listening on ${input.boundHost}: any device on the network can open the sign-in page. Traffic (including PINs) is not encrypted.`, fix: 'Only allow this on an isolated lighting/production network, never guest Wi-Fi. Otherwise turn on "localhost only" (Settings → Safety) and reinstall without --lan.' });

  const version = cfg.settings.connection.eosVersion;
  const reported = parseEosVersion(input.consoleVersion);
  const configured = parseEosVersion(version);
  if (!configured || !c.versionConfirmedAt) {
    add({ id: 'version', label: 'Eos version confirmed', status: 'fail', detail: 'The Eos version has not been read from the Ion.', fix: 'Ion Setup Wizard → step 1.' });
  } else if (reported && (reported.major !== configured.major || reported.minor !== configured.minor)) {
    add({ id: 'version', label: 'Eos version confirmed', status: 'fail', detail: `Settings say ${version} but the console reports ${input.consoleVersion}.`, fix: 'Correct the version in the Ion Setup Wizard.' });
  } else {
    add({ id: 'version', label: 'Eos version confirmed', status: 'pass', detail: `Eos ${version}${reported ? ' (matches the console)' : ''}.`, fix: '' });
  }

  add(c.monitorTest?.ok
    ? { id: 'monitor', label: 'Monitor (read-only) test passed', status: 'pass', detail: c.monitorTest.detail, fix: '' }
    : { id: 'monitor', label: 'Monitor (read-only) test passed', status: 'fail', detail: c.monitorTest ? `Last test failed: ${c.monitorTest.detail}` : 'Not run yet.', fix: 'Ion Setup Wizard → Monitor test.' });

  const lt = c.liveTest;
  add(lt && lt.operatorConfirmedLight === true && lt.released
    ? { id: 'live', label: 'Authorized single-channel live test', status: 'pass', detail: `Chan ${lt.channel} At ${lt.level} came on and was released.`, fix: '' }
    : { id: 'live', label: 'Authorized single-channel live test', status: 'fail', detail: !lt ? 'Not done yet.' : lt.operatorConfirmedLight !== true ? 'Sent, but nobody confirmed the light came on.' : 'Light confirmed, but the channel was not released (Sneak).', fix: 'Ion Setup Wizard → Live test, outside worship hours.' });

  add(c.recoveryObservedAt
    ? { id: 'recovery', label: 'Connection recovery observed', status: 'pass', detail: `The app lost and regained the console on ${new Date(c.recoveryObservedAt).toLocaleString()}.`, fix: '' }
    : { id: 'recovery', label: 'Connection recovery observed', status: 'warn', detail: 'The app has not yet been seen reconnecting after losing the console.', fix: 'In Monitor mode, unplug the Mac\'s network cable for ~20 s and plug it back in (docs/FIRST_DAY_TESTING.md, step M5).' });

  const protectedCount = cfg.fixtures.filter((f) => f.protected).length;
  add(protectedCount
    ? { id: 'protected', label: 'Relay/utility channels protected', status: 'pass', detail: `${protectedCount} channel(s) marked protected.`, fix: '' }
    : { id: 'protected', label: 'Relay/utility channels protected', status: 'warn', detail: 'No channel is marked protected.', fix: 'Settings → Patch → tick "Protect" on relays and utility channels.' });

  const demo = cfg.fixtures.filter((f) => /demo/i.test(f.label) || f.profileId === 'demo-mover');
  add(demo.length
    ? { id: 'demo', label: 'Sample/demo fixtures removed', status: 'warn', detail: `${demo.length} demo fixture(s) still in the patch (e.g. ${demo[0].label}).`, fix: 'Import the real Ion patch (Settings → Patch) and delete demo rows.' }
    : { id: 'demo', label: 'Sample/demo fixtures removed', status: 'pass', detail: 'No demo fixtures in the patch.', fix: '' });

  const unmappedVolunteer = cfg.looks.filter((l) => l.volunteerVisible && l.action.type === 'none');
  add(unmappedVolunteer.length
    ? { id: 'looks', label: 'Volunteer looks play Ion cues', status: 'warn', detail: `${unmappedVolunteer.length} volunteer look(s) are local previews only and won't change real lights.`, fix: 'Map them to Ion cues (Settings → Looks) or hide them from volunteers.' }
    : { id: 'looks', label: 'Volunteer looks play Ion cues', status: 'pass', detail: 'Every volunteer look triggers an Ion action.', fix: '' });

  add(cfg.architecture.auditCompletedAt
    ? { id: 'audit', label: 'SceneStation / DMX audit', status: 'pass', detail: 'Audit recorded.', fix: '' }
    : { id: 'audit', label: 'SceneStation / DMX audit', status: 'warn', detail: 'The architectural lighting audit is not complete, so failure behaviour is unknown.', fix: 'docs/SCENESTATION_WORKSHEET.md, then Settings → Architectural audit.' });

  add(input.hasTodaysBackup
    ? { id: 'backup', label: 'Configuration backed up today', status: 'pass', detail: 'Daily snapshot present.', fix: '' }
    : { id: 'backup', label: 'Configuration backed up today', status: 'warn', detail: 'No snapshot for today yet.', fix: 'Restart the app, or Settings → Backup → Download backup.' });

  return { items, readyForSupervisedSunday: !items.some((i) => i.status === 'fail') };
}
