# SceneStation and house-light worksheet

*Purpose: understand how the wall stations, the Ion and the DMX gateways share the house lights, and what happens when something stops. Background: [SCENESTATION.md](SCENESTATION.md).*

> **Safety and scope**
> * **Parts A–C are observation only.** Look, photograph, press wall buttons, read settings screens. No unplugging, no rewiring, no changing switches or settings.
> * **Part D lists failure tests that *are* disruptive** (they interrupt lighting control). Run them only:
>   * in a scheduled window with no service, event, rehearsal or building activity;
>   * with permission from whoever is responsible for the building;
>   * with a qualified lighting or electrical technician present, or the installer, for anything involving DMX cables, gateways, dimmer racks or wall-plate hardware.
> * **Never disconnect or rewire live DMX or power yourself** as part of this audit. Write down what you'd like tested and schedule it.
> * Sanctuary Light does **not** control SceneStation. Nothing in this worksheet involves the app sending anything.

Record the results in **Sanctuary Light → Settings → Architectural audit**. They appear on the **Architectural** page and in its "What happens if…" table.

## A. House-light behavior today (observation)

| ☐ | Question | Answer |
|---|---|---|
| ☐ | Which lights do people mean by "house lights"? (pendants, side pendants, cove, aisle…) | |
| ☐ | On a normal weekday, with the Ion off, how are house lights turned on? (wall station, switch, timer) | |
| ☐ | On Sunday, who controls the house lights during the service: the Ion operator, a wall station, or both? | |
| ☐ | Have wall buttons ever seemed to "do nothing" during services? | |
| ☐ | Have lights ever changed unexpectedly when someone pressed a wall button during a service? | |
| ☐ | Which house-light circuits appear in the Ion patch (channel numbers)? | |

## B. Each SceneStation (observation; copy this block per station)

| ☐ | Item | How (no tools, no opening plates) | Answer |
|---|---|---|---|
| ☐ | Location | | |
| ☐ | Button labels and what each does **with the Ion off** | Press each button with the Ion off or released (normal weekday state) | |
| ☐ | What each button does **while the Ion is running a cue** | Press during a quiet Ion cue, not in a service. Note whether the lights change and whether the LEDs change color (a "locked" indication). | |
| ☐ | Model and firmware | From SceneStation Studio's station list, or power-up LED colors (all green = wireless SS-205/305) | |
| ☐ | Wired to DMX, or a wireless remote of another station? | From installation drawings or the installer. **Don't open the plate.** | |
| ☐ | "When DMX Input is Detected" settings (deactivate preset? lock buttons?) | SceneStation Studio → station → DMX Options. Read only; don't save changes. | |
| ☐ | "When DMX Output is Restored": Hold Last Look / Snap to Current / Fade to Current / Fade to Black / Activate Preset x | Same tab | |
| ☐ | Power-On Preset (default "Restore Previous") | Studio | |
| ☐ | DIP switch 4 "DMX Output Only" | Only from installer records or a qualified tech. **Don't remove the station yourself.** | |

## C. Console priority and gateways (observation)

| ☐ | Question | How | Answer |
|---|---|---|---|
| ☐ | Which gateway (Pathport / ODE Mk3) feeds the DMX line that each SceneStation is on? | Drawings, labels, installer | |
| ☐ | Does any DMX line have **two sources**? (e.g. a station set to "DMX Output Only" on an Ion line) | Drawings or the installer. **If yes: a hazard. Flag it; don't fix it yourself.** | |
| ☐ | Pathport: loss-of-data / hold setting for each port | Pathscape or the Pathport web page (read only) | |
| ☐ | ODE Mk3: loss-of-data / hold setting | ENTTEC web interface (read only) | |
| ☐ | Gadget II: is it in use? Which computer and universes? | Ask, and look | |
| ☐ | sACN priority settings on any gateway (if used) | Device settings (read only) | |

**Why the gateway setting matters:** a SceneStation takes over only when DMX **disappears** from its line. If the gateway **holds the last look** when the Ion stops, the wall station never notices, so the lights freeze and the wall buttons may do nothing. If the gateway **stops outputting**, the station takes over with its "Output Restored" action.

## D. Fallback scenarios (scheduled, with a qualified person; see the safety box)

For each test, write down **what the lights did**, **what the wall stations did**, and **how long it took**.

| ☐ | Scenario | How (by or with the qualified person) | Result |
|---|---|---|---|
| ☐ | D1. **Sanctuary Light Mac fails** | Quit Sanctuary Light, or shut the Mac down, while it's in LIVE. *Not disruptive; you can do this yourself outside services.* | Expected: **nothing changes.** |
| ☐ | D2. **Ion show closed or Ion shut down** | Console person closes the show or shuts down normally | |
| ☐ | D3. **Ion network output lost** | Qualified person disconnects the Ion's lighting-network cable, or disables output, then restores it | |
| ☐ | D4. **One DMX line loses signal** | Qualified person only | |
| ☐ | D5. **Wall button pressed during an Ion cue** | You can do this (non-disruptive), outside services | |
| ☐ | D6. **Power restored after an outage** | Only as part of a planned building power test | Order things came back; which preset the stations chose |

## E. Conclusions (fill in after A–D)

| Question | Answer |
|---|---|
| During services, which system really controls the house lights? | |
| If the Ion fails during a service, what will the congregation see? | |
| Is any wiring or setting a hazard (two sources on one line)? Who will fix it? | |
| What should volunteers be told? (Copy into *Settings → Architectural audit → Guidance*) | |
| Is an integration worth exploring later (see SCENESTATION.md options B/C)? | |

Then tick **Audit completed** in *Settings → Architectural audit*.
