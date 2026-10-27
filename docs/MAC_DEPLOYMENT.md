# Mac deployment plan

Goal: Sanctuary Light runs permanently on a Mac in the sanctuary, starts by itself, survives crashes and power cuts, and volunteers never touch Terminal. It must never come back up in Live mode, and it must never send lighting commands on its own.

## What is verified today

| Item | Status | Evidence |
|---|---|---|
| Builds, typechecks and passes all tests on **macOS, Apple Silicon (arm64)** | ✅ Verified in CI | GitHub Actions `macos-latest` job reports `darwin arm64`; every push runs typecheck, the full test suite and the production build |
| Server starts on macOS the way launchd starts it, comes up **offline**, serves the UI, writes a daily backup | ✅ Verified in CI | The "macOS deployment smoke test" step starts `server/src/index.ts` directly with Node, checks `/api/health` (`"mode":"offline"`, `"platform":"darwin-arm64"`), loads the page, and checks the backups folder |
| The LaunchAgent plist is valid | ✅ Verified in CI | Rendered by `deploy/macos/launchagent.mjs`, checked with Apple's `plutil -lint` |
| A restarted server never resumes Live and sends nothing | ✅ Unit-tested | `server/test/phase3.test.ts`, "Restart safety": a commissioned config, a "reboot", then 500 ms of silence at the fake console |
| `install.sh` / `.app` launcher / `caffeinate` on a real Mac | ⚠️ Not yet run on hardware | The installer runs in dry-run mode under macOS's bash 3.2 in CI. A full install needs the sanctuary Mac. |
| Intel Macs | ⚠️ Not tested | Should work (Node and esbuild/rollup ship x64 binaries); CI covers Apple Silicon only |

## Recommended setup (Phase 3a: dependable launcher, no packaging)

```
Mac login ──► launchd LaunchAgent (org.ltumc.sanctuary-light)
                 ├─ runs: <node> node_modules/tsx/dist/cli.mjs server/src/index.ts
                 ├─ RunAtLoad: starts at login
                 ├─ KeepAlive (SuccessfulExit=false) + ThrottleInterval 10 s: restarted after a crash
                 ├─ env: SANCTUARY_DATA_DIR = ~/Library/Application Support/Sanctuary Light
                 │       SANCTUARY_PREVENT_SLEEP = system   (caffeinate -i -w <pid>)
                 └─ logs: ~/Library/Logs/Sanctuary Light/server.log
Dock / Desktop ──► ~/Applications/Sanctuary Light.app
                 └─ checks /api/health, kick-starts the agent if needed, opens the browser
                    (optionally a full-screen Chrome app window: SANCTUARY_KIOSK=1)
```

### Install (one time, by the lighting lead)

1. Install **Node.js 22 LTS** (the macOS ARM64 installer from nodejs.org, or `brew install node@22`).
2. Put the repository somewhere permanent **in your home folder**, e.g. `~/SanctuaryLight`. **Not** Desktop, Documents, Downloads or iCloud Drive. Don't move it afterwards: the service remembers the path.
3. Run `./deploy/macos/install.sh`. Add `--lan` only if tablets on the church network must reach the app, and `--kiosk` for a full-screen Chrome window. The installer:
   * runs `npm ci`, `npm run build` and `npm test`, and stops if anything fails;
   * writes and validates the LaunchAgent, then loads it for the current user (no administrator rights, no root);
   * creates **Sanctuary Light.app** in `~/Applications`. Drag it to the Dock.
4. Sign in with the operator PIN and **change both PINs** (*Settings → Safety & Security*).
5. Run the **Ion Setup Wizard** and work through `docs/COMMISSIONING.md` at church.

Remove everything with `./deploy/macos/uninstall.sh`. It keeps your data. Other helpers: `check-mac.sh` (read-only health check), `update.sh` (refuses unless in SIM; rolls back on failure), `restore-backup.sh`. The beginner walkthrough is [`INSTALL_MAC.md`](INSTALL_MAC.md).

### macOS settings for an unattended booth Mac

| Setting | Recommendation | Why |
|---|---|---|
| Automatic login | On, for a dedicated standard (non-admin) account | LaunchAgents run only when a user is logged in |
| *System Settings → Energy*: "Start up automatically after a power failure" | On | Recovers after an outage |
| *Energy*: prevent automatic sleeping when the display is off | On | Belt and braces with `caffeinate` |
| Screen lock / screen saver | Off for the booth account, or a long delay | A locked screen hides the controls during a service |
| macOS updates | Manual. Never auto-restart on a Sunday | An update reboot mid-service shows the Ion fallback banner on every screen |
| FileVault | Your IT policy decides. With FileVault on, an automatic login after a power cut needs someone to type the password | Trade-off between unattended recovery and disk encryption |
| Network | Wired Ethernet on the lighting network. Static IP or DHCP reservation | The Ion connection uses a fixed IP |
| Time Machine | On, if an external disk is available | Second copy of `~/Library/Application Support/Sanctuary Light` |

## Startup at login vs. after a power cut

These are **two different things**, and only the first is handled by Sanctuary Light itself.

| | What starts it | What must be true |
|---|---|---|
| **At login** | The LaunchAgent (`RunAtLoad`) starts the server as soon as the booth user account logs in. | The service is installed for **that** account. The app folder isn't in Desktop, Documents, Downloads or iCloud Drive (macOS privacy protection blocks background services there; the installer refuses those locations). |
| **After a power cut** | Nothing in Sanctuary Light. The Mac must (1) power itself on and (2) log the booth account in automatically. Then the LaunchAgent starts as above. | (1) *System Settings → Energy → "Start up automatically after a power failure"* (Mac mini, Mac Studio and iMac; MacBooks don't have it). (2) *Users & Groups → Automatically log in as* the booth account. **FileVault disables automatic login**: with FileVault on, someone must type the password after every power cut, and until then nothing starts. |

Either way the server comes up in **Offline Simulation** and sends nothing. Check both settings on the sanctuary Mac before relying on unattended recovery.

## Behaviour at startup and on failures

| Event | What Sanctuary Light does |
|---|---|
| Mac boots or the app restarts | Starts in **Offline Simulation**. The operating mode is never stored, so Live cannot come back on its own. No OSC is sent; the console connection stays closed until an operator chooses Monitor or Live. |
| Server crash | launchd restarts it within about 10 s (throttled). It comes back offline as above. Browsers reconnect automatically and show "Lost contact with the Sanctuary Light server" until it returns. |
| Port already in use (second copy) | Exits with a clear message. The launcher simply opens the running copy. |
| Network or console drops while in Monitor or Live | Automatic reconnection with back-off (2–15 s), plus heartbeat and stale indication (Phase 2). Nothing is sent on disconnect. Group verification resets and is re-read on reconnect. |
| Mac sleeps | Prevented by `caffeinate -i` while the server runs. The `-w <pid>` flag releases it if the server dies. |
| Power cut | Mac auto-starts (setting above), logs in, and the agent starts the server, offline. The Ion keeps whatever it was doing. |

## Configuration backup

* **Every save** keeps a timestamped copy (`backups/config-*.json`, newest 50).
* **Daily snapshot** (`backups/daily-YYYY-MM-DD.json`, newest 30) taken at startup and checked hourly. Per-save rotation never deletes daily snapshots.
* *Settings → Backup* downloads or restores a full backup. Restores migrate older formats.
* Off-machine copies: Time Machine, or periodically copy the data folder to the church file server. Not automated yet (see Roadmap).

## Later options (not built)

| Option | Benefit | Cost and risk |
|---|---|---|
| **Tauri or Electron app bundle** with an embedded Node runtime | No Node install; a real `.app` with an icon; native window (kiosk) | Code signing and notarisation (Apple Developer account), larger build pipeline, auto-update decisions |
| Compile the server to a single binary (e.g. Node SEA) | Simpler install | Native-module edge cases; still needs signing |
| Dedicated touchscreen in kiosk mode | Volunteer-proof | Hardware purchase; kiosk lock-down |

Recommendation: stay with the LaunchAgent and launcher through commissioning. Package as a signed app only once the workflow is stable (Roadmap Phase 3c).
