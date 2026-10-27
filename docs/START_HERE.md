# Start here: Sanctuary Light hardware testing

*For the Technical Arts Director, Lake Travis UMC*

These guides take Sanctuary Light from "works on a computer" to "ready for a **supervised** first connection to our real ETC Ion". Follow them in order. Each one ends with a checkpoint you can tick off.

| Step | Guide | Where | Time | Touches real lights? |
|---|---|---|---|---|
| 1 | [Install on the sanctuary Mac](INSTALL_MAC.md) | Booth Mac | 45 min | No |
| 2 | [On-site information checklist](ONSITE_CHECKLIST.md) | Booth, Ion, racks | 1–2 h | No (read and photograph only) |
| 3 | [First-day testing: Simulation → Monitor → Live](FIRST_DAY_TESTING.md) | Booth, outside worship | 2 h | Only the final, authorized single-channel step |
| 4 | [SceneStation / house-light worksheet](SCENESTATION_WORKSHEET.md) | Sanctuary, booth | 1–2 h | Observation only. Anything disruptive needs a qualified person and a scheduled window. |
| 5 | [Sunday readiness](SUNDAY_READINESS.md) | Booth | 30 min | No |

## The three ground rules

1. **The Ion stays in charge.** Sanctuary Light is a remote control for the Ion. Anyone at the Ion can override it at any time, and closing or crashing Sanctuary Light never turns lights off.
2. **Nothing reaches the Ion until you choose it.** The app always starts in **SIM** (Offline Simulation), which sends no network traffic. **MONITOR** only listens. **LIVE** needs the operator PIN plus a confirmation, and is never switched on automatically, even after a restart.
3. **No guessing about the building.** If you're unsure how something is wired (SceneStation, gateways, relays), write "unknown" and ask a qualified person. Never unplug or rewire live DMX during the audit.

## Words used in these guides

| Word | Meaning |
|---|---|
| **SIM / Offline Simulation** | Practice mode. The stage picture changes; the real Ion and lights don't. |
| **MONITOR** | Connected to the Ion, read-only. Shows the Ion's current cue; can't change anything. |
| **LIVE** | Sanctuary Light sends commands to the Ion, which changes real lights. |
| **Channel** | The Ion's channel number (what you type on the Ion). **Not** the DMX address. |
| **Gateway / node** | A box that turns the Ion's network data into DMX cables (Pathport, ENTTEC ODE Mk3). |
| **SceneStation** | The wall button stations that run the room when the console is off. Sanctuary Light does **not** control them. |
| **Terminal** | The Mac's command-line app (Applications → Utilities → Terminal). You'll use it only during installation and for troubleshooting. Volunteers never need it. |

## Where things live on the Mac

| What | Where |
|---|---|
| The app's program files | `~/SanctuaryLight` (your home folder → SanctuaryLight) |
| Settings, patch, looks, PINs, backups | `~/Library/Application Support/Sanctuary Light` |
| Log file (for troubleshooting) | `~/Library/Logs/Sanctuary Light/server.log` |
| The icon volunteers click | `~/Applications/Sanctuary Light.app` (drag it to the Dock) |

(`~` means your home folder. In Finder, press **⌘⇧G** and paste the path to jump there. `~/Library` is hidden unless you use ⌘⇧G.)
