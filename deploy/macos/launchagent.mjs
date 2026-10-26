#!/usr/bin/env node
/**
 * Renders the launchd LaunchAgent that keeps Sanctuary Light running on the sanctuary Mac.
 *
 *   node deploy/macos/launchagent.mjs --node /opt/homebrew/bin/node --repo /path/to/sanctuary-light
 *
 * The agent runs as the logged-in user (no root): it starts at login (RunAtLoad), is
 * restarted if it crashes (KeepAlive with a throttle), and writes logs to
 * ~/Library/Logs/Sanctuary Light. A restart ALWAYS comes back in Offline Simulation:
 * the operating mode is never stored, so nothing here can arm Live control.
 */
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const LABEL = 'org.ltumc.sanctuary-light';

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderLaunchAgent({ nodePath, repo, home = os.homedir(), port = 4700, preventSleep = 'system', lanAccess = false }) {
  if (!path.isAbsolute(nodePath) || !path.isAbsolute(repo)) throw new Error('nodePath and repo must be absolute paths (launchd has no PATH)');
  const dataDir = path.join(home, 'Library', 'Application Support', 'Sanctuary Light');
  const logDir = path.join(home, 'Library', 'Logs', 'Sanctuary Light');
  const env = {
    NODE_ENV: 'production',
    PORT: String(port),
    SANCTUARY_DATA_DIR: dataDir,
    SANCTUARY_PREVENT_SLEEP: preventSleep,
    ...(lanAccess ? { HOST: '0.0.0.0' } : {}),
  };
  const args = [nodePath, path.join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(repo, 'server', 'src', 'index.ts')];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${xml(a)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(repo)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${Object.entries(env).map(([k, v]) => `    <key>${k}</key>\n    <string>${xml(v)}</string>`).join('\n')}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <!-- Restart after a crash, but not after a clean "Quit" (exit code 0). -->
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>${xml(path.join(logDir, 'server.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(path.join(logDir, 'server.log'))}</string>
</dict>
</plist>
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  process.stdout.write(renderLaunchAgent({
    nodePath: arg('node', process.execPath),
    repo: arg('repo', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')),
    port: Number(arg('port', '4700')),
    preventSleep: arg('prevent-sleep', 'system'),
    lanAccess: process.argv.includes('--lan'),
  }));
}
