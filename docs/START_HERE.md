# Start here: Sanctuary Light hardware testing

*For the Technical Arts Director, Lake Travis UMC*

These guides take Sanctuary Light from "works on a computer" to "ready for a **supervised** first connection to our real Eos system". Follow them in order. Each one ends with a checkpoint you can tick off.

**Primary setup:** Sanctuary Light runs on the **sanctuary Windows 11 PC, next to Eos (ETCnomad)**, and talks to it over the PC's internal address `127.0.0.1`. Eos keeps driving the Gadget II, the wireless DMX and everything after it, exactly as today. (A Mac install is still supported: [INSTALL_MAC.md](INSTALL_MAC.md).)

| Step | Guide | Where | Time | Touches real lights? |
|---|---|---|---|---|
| 1 | [Install on the sanctuary Windows PC](INSTALL_WINDOWS.md) | Booth PC | 45 min | No |
| 2 | [On-site information checklist](ONSITE_CHECKLIST.md) | Booth, PC, racks | 1–2 h | No (read and photograph only) |
| 3 | [First-day testing: Simulation → Monitor → Live](FIRST_DAY_TESTING.md) | Booth, outside worship | 2 h | Only the final, authorized single-channel step |
| 4 | [SceneStation / house-light worksheet](SCENESTATION_WORKSHEET.md) | Sanctuary, booth | 1–2 h | Observation only. Anything disruptive needs a qualified person and a scheduled window. |
| 5 | [Sunday readiness](SUNDAY_READINESS.md) | Booth | 30 min | No |

Background: [WINDOWS_DEPLOYMENT.md](WINDOWS_DEPLOYMENT.md) explains how the pieces fit on one PC and what happens when each one fails.

## The ground rules

1. **Eos stays in charge.** Sanctuary Light is a remote control for Eos. Anyone at Eos can override it at any time, and closing or crashing Sanctuary Light never turns lights off.
2. **Nothing reaches Eos until you choose it.** The app always starts in **SIM** (Offline Simulation), which sends nothing to Eos. **MONITOR** only listens. **LIVE** needs the operator PIN plus a confirmation, and is never switched on automatically, even after a restart.
3. **Sanctuary Light never sends DMX itself.** The Gadget II, the wireless DMX and SceneStation keep getting exactly what Eos sends them.
4. **Don't close Eos.** On the shared PC, closing Eos stops its DMX output. Volunteers use the Sanctuary Light window and leave Eos running.
5. **No guessing about the building.** If you're unsure how something is wired (SceneStation, wireless DMX, gateways, relays), write "unknown" and ask a qualified person. Never unplug or rewire live DMX during the audit.

## Words used in these guides

| Word | Meaning |
|---|---|
| **Eos / ETCnomad** | ETC's lighting software. On our PC it runs as **ETCnomad**, unlocked by the USB license key. (The same software runs on ETC consoles like the Ion.) |
| **SIM / Offline Simulation** | Practice mode. The stage picture changes; Eos and the lights don't. |
| **MONITOR** | Connected to Eos, read-only. Shows Eos's current cue; can't change anything. |
| **LIVE** | Sanctuary Light sends commands to Eos, which changes real lights. |
| **Channel** | Eos's channel number (what you type in Eos). **Not** the DMX address. |
| **Gadget II** | ETC's USB-to-DMX box. Eos sends DMX out through it. |
| **Wireless DMX** | The transmitter and receivers that carry DMX to fixtures without cables. |
| **SceneStation** | The wall button stations that run the room when the lighting system is off. Sanctuary Light does **not** control them. |
| **Loopback (127.0.0.1)** | The PC talking to itself. Used when Sanctuary Light and Eos run on the same PC. |
| **Terminal** | Windows' command window (Start → type "Terminal"). You'll use it only during installation and troubleshooting. Volunteers never need it. |

## Where things live on the Windows PC

| What | Where |
|---|---|
| The app's program files | `C:\SanctuaryLight` |
| Settings, patch, looks, PINs, backups | `%LOCALAPPDATA%\Sanctuary Light` (paste into File Explorer's address bar) |
| Log file (for troubleshooting) | `%LOCALAPPDATA%\Sanctuary Light\logs\server.log` |
| The icon volunteers click | **Sanctuary Light** on the desktop and in the Start menu |
| Health check (changes nothing) | `C:\SanctuaryLight\deploy\windows\check-windows.ps1` |
