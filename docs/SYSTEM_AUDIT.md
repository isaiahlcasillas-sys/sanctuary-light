# Sanctuary lighting system audit (questionnaire and checklist)

Purpose: find out how Eos (ETCnomad on the sanctuary Windows PC, and the Ion if still used), SceneStation, ETC Gadget II, the wireless DMX, ENTTEC ODE Mk3, Pathport and the DMX lines are **actually** connected, and what happens when each part fails. Do it outside services. Record the answers in *Settings → Architectural audit* (they appear on the **Architectural Status** page) and keep photos in a shared folder.

> Rule: write down what you **see and test**, not what someone remembers. Mark anything you couldn't verify as *unknown*.

People: one person at the Ion, one walking the room and booth, one recording. Tools: flashlight, phone camera, labels, a laptop for each device's web or setup page, the SceneStation IR remote (if any), and ideally a DMX tester.

## A. Inventory

For every device, record make, model, serial, firmware, location, IP address (if any), power source and a photo of its labels and connections.

| # | Device | Model / serial | Firmware | Location | IP | Photo |
|---|---|---|---|---|---|---|
| A0 | Sanctuary Windows 11 PC running ETCnomad (and its USB license key) | | Windows version; Eos version (Browser → Help → About) | | | |
| A1 | ETC Ion, if still used (Classic, Win XP or Win 7?) | | Eos version | | | |
| A2 | ETC Gadget II | | | Sanctuary PC, which USB port? Which DMX port feeds what? | — | |
| A3 | ENTTEC ODE Mk3 | | | | | |
| A4 | Pathway Pathport (each unit) | | | | | |
| A5 | Network switch(es) on the lighting network | | | | — | |
| A6 | SceneStation (each station) | SS-105/205/305? | LED color code (manual App. C) | | — | |
| A7 | Dimmer racks / relay panels | | | | | |
| A8 | Wireless DMX transmitter and each receiver | | | | — | |
| A9 | Any other DMX source (splitters, mergers) | | | | | |

## B. Signal path (draw it)

1. Trace from the Ion: which outputs are used? (Ion DMX ports, network sACN/Net3, or the Gadget II?)
2. For each **DMX line**, name it (e.g. "Line A – stage pipe"), then record:
   * source: which node and port, and which universe;
   * every device on it, in order (including SceneStations, splitters, dimmers, fixtures);
   * whether it's terminated at the far end.
3. Which universes does the Ion output? Do they match the patch? (Note: Eos channel numbers ≠ DMX addresses.)
4. Is any line driven by **two sources**? (A SceneStation set to "DMX Output Only" on an Ion line counts. This is a hazard.)
5. Is the lighting network isolated from the church office network?

## C. Each SceneStation

| Question | How to check |
|---|---|
| Model and firmware | Power-up LED colors (all green = wireless SS-205/305), or SceneStation Studio's list |
| Wired to DMX, or wireless remote only? | Look behind the plate: is a DMX cable connected? |
| If wired: which line, and is it **in-line** with the Ion's output? | Trace the cable (section B) |
| DIP switch 4 "DMX Output Only" | Back of the station (power off first, if the electrician allows) |
| "When DMX Input is Detected" settings (deactivate preset? lock buttons?) | SceneStation Studio → station → DMX Options |
| "When DMX Output is Restored" action | Same tab: Hold Last Look / Snap / Fade to Current / Fade to Black / Activate Preset x |
| Power-On Preset | Studio (default "Restore Previous") |
| What each button does, and its label | Press each one **with the Ion off** (section E) |
| Who has the Studio software and USB RF adaptor? | Ask; record where it's kept |

## D. Each node or interface (Pathport, ODE Mk3, Gadget II)

| Question | How to check |
|---|---|
| Which universes and ports does it output, and what feeds it (sACN, Art-Net, USB)? | Device web page / Pathscape / ENTTEC web UI |
| **Loss-of-data behaviour**: when the Ion stops sending, does the output **hold the last look, stop outputting, or fade?** After how long? | Device settings, then confirm with the test in section E |
| Does it merge or prioritise multiple sources (sACN priority, HTP)? | Device settings |
| Gadget II: is it used at all? With which computer and Eos/ETCnomad license? | Ask; check the booth computers |

## E. Failure tests (with a responsible person in the room; not during an event)

Do these in order and record exactly what the lights and wall buttons did.

| # | Test | Record |
|---|---|---|
| E1 | Ion running a normal cue: press each SceneStation button | Did any lights change? Did the station LEDs show "locked"? |
| E2 | On the Ion, release to a dark state, then press a wall button | Same questions |
| E3 | **Close Eos on the sanctuary PC** (or unplug the Ion's network/DMX output, if the Ion is used) | Did lights hold, fade or go dark? Did any SceneStation take over? After how many seconds? What did it output? |
| E4 | With the Ion still disconnected, press each wall button | Do they work now? |
| E5 | Reconnect the Ion | Did the Ion take back control smoothly? Any flash or jump? |
| E6 | End Sanctuary Light only (Task Manager → `node.exe`) while in Live mode. Don't shut the PC down: that also stops Eos (E3). | **Expected: nothing changes.** Eos keeps its state. |
| E7 | Power-cycle one SceneStation | Which preset came up? Did it go passive while the Ion was outputting? |
| E8 | Simulated power cut (building procedure permitting) | Order of recovery: dimmers, nodes, wireless DMX, sanctuary PC + Eos, SceneStation, Sanctuary Light |

## F. Answers to carry into Sanctuary Light

* *Settings → Architectural audit*: one record per station (role, line, loss action, button lock, buttons, verified by), and each node's loss behaviour.
* *Settings → Patch*: import the real Ion patch. Mark relay and utility channels **Protected**. Keep SceneStation-only circuits **out** of the patch unless the Ion really controls them.
* *Settings → Groups*: Eos group numbers, then **Verify against console**.
* Write anything surprising in the Setup Wizard's commissioning notes.

## G. Decisions this audit enables

1. Can the Ion (and so Sanctuary Light) control the house lights during services, or do they stay SceneStation-only?
2. Is any wiring change needed (e.g. a station on the wrong line, or "Output Only" set)?
3. Is an IR or other integration worth pursuing (`SCENESTATION.md`, option B), or should the systems stay separate?
4. What should volunteers be told? Update the guidance text on the Architectural Status page.
