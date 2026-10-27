# SceneStation research and integration options

**We don't yet know your exact SceneStation model, firmware, settings or wiring.** This page separates what Interactive Technologies documents from what depends on your installation. Use `SYSTEM_AUDIT.md` to find out the rest.

Primary source: *SceneStation User's Manual v3.0 (second edition)*, Interactive Technologies, Inc. (D0311), plus the *SceneStation 3 Getting Started* sheet (D0313B) and the wiring diagram D0316.

> **Closing or disconnecting Sanctuary Light does not hand the lights back to SceneStation.** Sanctuary Light is a remote control for Eos; it never sends DMX itself. Eos (with the Gadget II and wireless DMX after it) keeps transmitting DMX whether Sanctuary Light is open, closed, crashed or in SIM. Per the manual (below), a SceneStation stays passive while it detects DMX input, so it only takes over when DMX **stops** on its line, and that depends on Eos and the devices in between, not on Sanctuary Light. To give the room back to the wall stations, follow your building's normal procedure in Eos.

## Models

| Model | Notes (from manual and retail listings) |
|---|---|
| SS-105 | Stand-alone, **non-wireless**. Discontinued. All LEDs red at power-up. |
| SS-205 / SS-305 ("SceneStation 3") | Wireless models (2.4 GHz). All LEDs green at power-up. The SS-305 is the current architectural (in-wall, Decora) station. |
| SS-310 / SS-315 | Portable enclosure with 5-pin XLR. The station inside is the same as the architectural one. |

Common: 5 programmable buttons, 64 presets, one DMX-512 port (one universe), IR receiver, Class 2 power (11–28 VDC or 14–28 VAC). On the firmware-version display (button colors), firmware 3.x shows a purple first button.

## Documented behaviour (confirmed by the manual)

| Topic | What the manual says |
|---|---|
| **DMX port** | One **bi-directional** port, used for both input and output. |
| **Console present** | "If an Input signal is detected (from another console or controller), SceneStation will automatically go into 'passive' mode, which allows the upstream controller to be in full control." The station **always stops outputting** while it detects input. |
| **No merge** | There is no HTP or merge mode. It's either the console or the station. |
| **On input detected (options)** | Optionally *deactivate the current preset*, and optionally *lock the front-panel buttons* (with a chosen LED color). |
| **On input lost ("When DMX Output is Restored")** | One of: **Hold Last Look** (keep the console's last scene until a button is pressed), **Snap to Current Preset**, **Fade to Current Preset**, **Fade to Black**, **Activate Preset (x)**. |
| **DIP switch 4, "DMX Output Only"** | Disables input entirely: the station *always* outputs. "Normally, this switch should remain Off." |
| **Wireless** | Stations can trigger each other over 2.4 GHz. A wireless-only remote station needs only power. |
| **Power-on** | The *Power-On Preset* defaults to **Restore Previous** (the preset active before power was lost). |
| **Control and programming paths** | Front panel; IR (User's and Programmer's remotes, universal remotes; published IR codes including discrete codes for all 64 presets, "for automation systems such as Crestron, AMX, Vantage"); wireless from other stations; **SceneStation Studio** (Mac/Windows) via a **USB RF adaptor**, which includes a remote-control window. |
| **Network** | **No Ethernet or IP interface** is described. |

## What this means for the sanctuary

1. **If a SceneStation is in-line with the Ion's DMX** (its port on the same DMX line the Ion's node drives): during services it is silent and its wall buttons don't change the lights it shares with the Ion. It takes over only when **DMX disappears from that line**.
2. **Whether DMX disappears when the Ion stops depends on the node in between** (Pathport, ENTTEC ODE Mk3, Gadget II). If a node **holds its last look** when the Ion goes away, the SceneStation **never takes over**: lights freeze and wall buttons stay passive. If the node **stops outputting**, the station takes over with its configured restore action. This is the most important thing to test.
3. **A station set to "DMX Output Only" on a line the Ion also drives is a hazard**: two sources on one DMX line. The audit must rule this out.
4. Stations on lines the Ion doesn't feed (e.g. lobby or house circuits) work independently all the time. The Ion and Sanctuary Light can't affect them.
5. **Sanctuary Light can't see or control any of this.** The *Architectural Status* page explains it using the audit results. It never claims control.

## Integration options (none implemented)

| Option | What it would allow | Needs | Risk / notes |
|---|---|---|---|
| **A. Keep separate (current)** | Wall buttons for daily building use; Ion and Sanctuary Light for services | Nothing | Clear ownership. Volunteers need guidance (shown on the Architectural Status page). |
| **B. Trigger SceneStation presets by IR** | e.g. a "Building mode" button in Sanctuary Light that recalls a SceneStation preset | An IP-to-IR emitter (Global Caché or similar) aimed at or wired to each station's IR window; discrete preset IR codes enabled (DIP or Studio) | Feasible from documented codes, but **new hardware**, one-way (no feedback), line-of-sight or IR wiring. Must not fight the Ion. |
| **C. Hand house circuits to the Ion** | One control point for services | Rewiring or re-patching so the Ion controls those dimmers. The SceneStation stays in-line as backup. | Electrical/AV contractor work. Fully documented behaviour. |
| **D. Sanctuary Light direct DMX (Phase 5)** | Retire the Ion | sACN/Art-Net output, universe ownership plan | Out of scope now; see `PHASE5_DIRECT_DMX.md`. |
| E. Control via SceneStation Studio's USB RF adaptor | Remote button presses | Reverse-engineering an undocumented protocol | **Not recommended**: undocumented and unsupported. |

## Questions for Interactive Technologies support

Contact: support@interactive-online.com, 678-455-9019.

* How long without input DMX before a station decides input is lost?
* Does a station treat an sACN or Art-Net node that **holds** output as "input present"? (Expected: yes, because the node is still sending DMX.)
* Are the IR discrete preset codes supported on our firmware version?
