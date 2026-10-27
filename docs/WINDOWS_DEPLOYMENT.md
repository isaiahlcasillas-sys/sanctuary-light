# Windows deployment (primary target)

Goal: Sanctuary Light and Eos (ETCnomad) run **side by side on the existing sanctuary Windows 11 PC**. Sanctuary Light becomes the volunteers' main lighting screen, and Eos keeps doing what it does today: the show file, patch, cues, and DMX out of the **Gadget II** to the **wireless DMX** and the rest of the rig. Sanctuary Light starts by itself, recovers from crashes, never comes back in Live mode, and never sends lighting commands on its own.

Beginner install steps: [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md). The Mac remains supported as a secondary option ([MAC_DEPLOYMENT.md](MAC_DEPLOYMENT.md)).

## Architecture on the one PC

```
                        Windows 11 sanctuary PC (one signed-in user)
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │  Edge app window ──HTTP/WebSocket 127.0.0.1:4700──► Sanctuary Light server   │
 │  (volunteer touchscreen)                            (node.exe, supervised)   │
 │                                                          │  OSC over TCP     │
 │                                                          ▼  127.0.0.1:3037   │
 │                                                    ETC Eos / ETCnomad        │  ◄─ USB license key
 │                                                    (show file, patch, cues)  │
 └──────────────────────────────────────────────────────────┬───────────────────┘
                                                            │ USB
                                                       ETC Gadget II ─ DMX ─► wireless DMX TX ─► receivers ─► fixtures
                                                                     └ DMX ─► (other lines, SceneStation…)
```

* **Sanctuary Light never outputs DMX, sACN or Art-Net.** In Eos mode those engines don't exist (the direct-DMX engine is a stub that refuses to start). Every lighting change is an OSC command to Eos, so the Gadget II, wireless DMX and SceneStation see exactly the same kind of output they see today.
* **Loopback OSC (`127.0.0.1`).** ETC documents loopback connections to ETCnomad for Eos 3.2 and later, provided Windows sees a working network adapter (Bitfocus/ETC notes). `check-windows.ps1` warns if no adapter is up. On Eos older than 3.2, use the PC's own lighting-network IP; the Setup Wizard offers it.
* **Address.** Choose it explicitly in the Setup Wizard ("Where does Eos run?"). A new install has no address, so it can't connect anywhere until someone picks one.
* **Ports.** Eos 3.1+: TCP **3037** (Third Party OSC, SLIP/OSC 1.1), recommended. Eos 2.x–3.0: TCP **3032** (OSC 1.0 by default). Never 3036 (reserved). See [EOS_OSC.md](EOS_OSC.md). On loopback, the UDP listening port must differ from Eos's UDP RX port; the app refuses a configuration where they're the same.
* **Loopback only.** With `127.0.0.1`, the UDP socket binds to `127.0.0.1` as well (so with UDP, set Eos's OSC UDP TX IP to `127.0.0.1`; TCP needs no such setting), and the web server listens on `127.0.0.1` unless installed with `-Lan`. So nothing on the network can reach Sanctuary Light, and Windows Firewall never prompts.
* **Keyboard focus.** Keys typed into the Sanctuary Light window go to Sanctuary Light, not to Eos. Eos only receives what Sanctuary Light sends over OSC. Use a dedicated **OSC user** number (*Settings → Connection*) so Sanctuary Light's commands never land on the Eos operator's command line.

## What the installer sets up

| Piece | What | Recovery behavior |
|---|---|---|
| **Scheduled task "Sanctuary Light"** | Trigger: this user signs in. Runs `powershell.exe -WindowStyle Hidden -File deploy\windows\run-server.ps1`. No administrator rights. No time limit. | If the supervisor itself ever fails, Task Scheduler restarts it every minute (up to 999 times). |
| **Supervisor** `run-server.ps1` | Runs one `node.exe --import tsx server\src\index.ts` with its output in `%LOCALAPPDATA%\Sanctuary Light\logs\server.log` and `server-errors.log`. The previous run's files are kept as `*.prev.log`, so the reason for a crash survives the restart. Starts and restarts go to `supervisor.log`. | After a **crash** (non-zero exit), it restarts the server in **10 s**. After a **clean exit** (code 0: quit, or another copy already on the port), it stops, so there's no restart loop. Tested in CI by killing the server. |
| **Sleep prevention** | `SetThreadExecutionState(ES_CONTINUOUS \| ES_SYSTEM_REQUIRED)` (plus `ES_DISPLAY_REQUIRED` with `-KeepDisplayOn`) | Windows releases the request automatically when the supervisor exits, so a crash can't leave the PC awake forever. |
| **Desktop / Start menu shortcut** | `open-sanctuary-light.ps1`: checks `/api/health`, starts the task if needed (waits up to 30 s), then opens **Edge `--app=http://127.0.0.1:4700`** (`--kiosk` with `-Kiosk`) | If the server won't start, a message box says so and tells volunteers to use Eos directly. |
| **Data** | `%LOCALAPPDATA%\Sanctuary Light` (`SANCTUARY_DATA_DIR`): config, PINs, daily snapshots, logs | Config writes are atomic, and the rename is retried if antivirus or the indexer briefly locks the file. |

**Every start is Offline Simulation.** The mode is never stored, so a reboot, crash, update or restore can't resume Monitor or Live. After a restart, an operator re-arms deliberately (PIN plus confirmation). This is a safety requirement and stays even when Sanctuary Light is the volunteers' main interface: the volunteer view shows SIM clearly, and the [Sunday readiness](SUNDAY_READINESS.md) routine includes arming.

## Start-up order and coexistence with Eos

* **Order doesn't matter.** Sanctuary Light starts in SIM. In Monitor/Live it retries the connection with backoff (up to 15 s) until Eos answers, and a half-open TCP link is detected and reset. Eos can be started before or after it, or restarted at any time.
* Starting Eos automatically at sign-in is optional and **not done by the installer** (it's Eos's own behavior). If you want it, put an Eos shortcut in the Startup folder (`shell:startup`) and test it outside services.
* **Eos must stay open.** Closing Eos stops Eos's output to the Gadget II. Sanctuary Light can't keep lights on by itself. The volunteer guidance on the Architectural page says "Do not close the Eos window."
* **Two monitors** (recommended): Eos on one display, the Sanctuary Light window (or kiosk) on the touchscreen. With one display, use the Sanctuary Light window maximized and leave Eos running behind it.
* **Resources:** the server uses roughly 100–200 MB of RAM and almost no CPU when idle. It's an ordinary user process, so it doesn't interfere with Eos's real-time output.

## Failure modes on a single PC

| Event | Effect on lights | Basis | What to do |
|---|---|---|---|
| Sanctuary Light crashes | **None.** Eos holds its state, and nothing is sent on stop. Restarts in SIM in about 10 s. | By design; CI crash test | Re-open from the icon and re-arm Live, or use Eos directly |
| Edge window closed | None. The server keeps running. | By design | Click the desktop icon |
| Eos closed or crashes | Eos stops driving the Gadget II. **What the lights then do depends on the Gadget II, the wireless DMX receivers and any SceneStation on those lines: unknown until tested.** Sanctuary Light shows "not answering" and retries. | Needs audit | Restart Eos. Record the observed behavior ([SCENESTATION_WORKSHEET](SCENESTATION_WORKSHEET.md), part D) |
| PC restarts (Windows Update, power cut) | As "Eos closed", until Eos is running again | Needs audit | Set active hours, automatic sign-in and BIOS power-on (INSTALL_WINDOWS step 8) |
| ETCnomad USB key removed or not detected | Eos's behavior without the key, which depends on the version: not tested by us | Needs audit | Don't unplug it. Turn off USB selective suspend. |
| Wireless DMX link drops | Depends on the receivers' loss-of-data setting | Needs audit | Record make/model and test |

The Architectural page's "What happens if…" table shows the same rows, filled in from your audit records. *Settings → Architectural audit* now lists the **Gadget II** and **Wireless DMX** as upstream devices to verify.

## Updates and Windows Update

* `update.ps1` refuses unless the app is in SIM and answering. It backs up the configuration, runs `git pull --ff-only`, then **stops Sanctuary Light** (Windows won't let `npm ci` replace files the running server has open; Eos keeps running), and runs `npm ci`, the build and the tests. If any step fails, it resets to the previous commit, rebuilds and restarts the old version, and says clearly if that rebuild failed too. Either way, it restarts the server in SIM.
* Windows Update: set **active hours** over service times, pause updates before major services, and don't use "Get the latest updates as soon as they're available". `check-windows.ps1` shows the current active hours.

## What is verified today

| Item | Status | Evidence |
|---|---|---|
| Typecheck, full test suite and production build on **Windows** (`windows-latest`, x64) | ✅ CI | GitHub Actions matrix |
| All PowerShell scripts parse in **Windows PowerShell 5.1** and are ASCII-only | ✅ CI | "Windows deployment smoke test" |
| `install.ps1 -DryRun` (environment checks and scheduled-task definition) | ✅ CI | Same step |
| The supervisor starts the server **offline** on `win32-x64`, listening on **127.0.0.1 only**, and serves the UI | ✅ CI | Same step |
| **Crash recovery:** kill `node.exe` and the supervisor restarts it, still offline | ✅ CI | Same step |
| `check-windows.ps1` runs cleanly | ✅ CI | Same step |
| UDP link binds to loopback when Eos is on the same PC; "Eos not answering on this computer" message | ✅ Unit-tested | `server/test/osc.test.ts`, `controller.test.ts` |
| Real scheduled task at sign-in, shortcuts, Edge app window | ⚠️ Not yet run on the sanctuary PC | CI runners have no interactive sign-in |
| Loopback OSC to a real ETCnomad | ⚠️ Not yet tested | Documented for Eos 3.2+; first test is MONITOR only ([FIRST_DAY_TESTING](FIRST_DAY_TESTING.md)) |
| Gadget II / wireless DMX / SceneStation behavior when Eos stops | ❓ Unknown | Site test, scheduled and supervised |
