# First-day testing: Simulation → Monitor → authorized Live test

*Do this on a weekday, **outside worship hours and outside any event or rehearsal**. Plan about 2 hours.*

**People:**
- **Operator:** at the Sanctuary Light window on the sanctuary PC.
- **Console person:** in Eos (on the same PC, or in Eos if that's where Eos runs), can override anything.
- **Room observer:** in the sanctuary, can see the lights. Optional for parts 1–2, required for part 3.

**Before you start:**
☐ [Installation](INSTALL_WINDOWS.md) is complete and `check-windows.ps1` shows no [FAIL] except items you've consciously decided on. (Mac: [INSTALL_MAC.md](INSTALL_MAC.md) / `check-mac.sh`.)
☐ [On-site checklist](ONSITE_CHECKLIST.md) is complete.
☐ The **Eos show file was backed up to USB today**.
☐ Everyone knows the stop rule below.

> **Stop rule.** If anything unexpected happens to the real lights, the console person takes over in Eos as normal, and the operator clicks **SIM** in Sanctuary Light. Switching to SIM never sends anything to Eos. Write down what happened before trying again.

---

## Part 1: Offline Simulation (SIM), about 30 min. No connection to Eos.

The top banner must read **OFFLINE SIMULATION** the whole time.

| # | Do this | You should see |
|---|---|---|
| S1 | Open Sanctuary Light, sign in with the operator PIN | Blue OFFLINE SIMULATION banner; connection pill says "Offline" |
| S2 | **Import Eos Show** (top bar) with the CSV you exported from Eos ([guide](IMPORT_EOS_SHOW.md)). Read the preview and its **Issues** tab, then **Import** | Your real channels, fixture types, groups, cue lists and labels. Nothing was sent to Eos. |
| S3 | In **Settings → Patch**, check that every relay and utility channel is **protected** (relays named in Eos are protected automatically). **Delete the two "DEMO Mover" rows** if you merged. | Protected channels show red outlines on the stage |
| S4 | **Settings → Groups**: check the imported groups. Each has its Eos group number. | Groups show **unverified** for now. That's expected; nothing is connected. |
| S5 | **Worship** mode: click group chips, move faders, try colors | The stage picture changes. The toast says **"preview only (offline). Nothing was sent to Eos."** |
| S6 | Click a relay channel and press **Full** | **Blocked**: "Protected channel(s)…" |
| S7 | **Volunteer** mode: press looks and GO/BACK | Preview only; each look is labelled **Local look · preview only** unless mapped to an Eos system cue |
| S8 | **Architectural** mode | Explains SceneStation and shows "Not yet done" for the audit |
| S9 | Look in Eos | **Nothing in Eos changed.** (It can't: SIM sends no network traffic.) |

✅ **Checkpoint 1:** the patch is loaded, relays are protected, and Eos was untouched.

## Part 2: MONITOR (read-only), about 45 min

MONITOR connects to Eos but **can only listen**. Lighting commands are blocked twice: by the app's controller, and again by the network layer itself.

| # | Do this | You should see |
|---|---|---|
| M1 | Click **Eos setup** (top bar) and work through **Before you start → Eos version → Network**. Enter the version **exactly** as shown in Eos. Under **Where does Eos run?** choose **On this computer** (`127.0.0.1`) for ETCnomad on this PC, or enter the console's IP. With the console person, make the wizard's console steps in Eos (turn on OSC for the port shown), and tick each one only once it's done. | The wizard picks the right port for your version (TCP 3032 for Eos 2.x–3.0; TCP 3037 for 3.1+) |
| M2 | Wizard **Monitor test → Connect in Monitor mode**, then **Run connection test** | Teal **EOS MONITOR (READ-ONLY)** banner; "Console replied in … ms"; the console's reported Eos version |
| M3 | *If there's no reply:* on the same PC, the status says "Eos is not answering on this computer": check that Eos is open and OSC is on for that port. With Eos older than 3.2, use the PC's own network address instead of 127.0.0.1 (the wizard offers it). On a separate console, check its IP and that both are on the same network (the wizard's Network step shows this). Check that OSC RX/TX are on in Eos's Show Control settings. For Eos 2.x, also check that the OSC TCP format matches (default OSC 1.0). | Re-run the test after each fix. **Live mode also needs these replies**: if Eos never answers, Sanctuary Light refuses to send commands rather than control it blind. |
| M4 | Console person: press **GO** on a harmless cue in Eos | Sanctuary Light's **Current cue** card updates, with a green **CONSOLE** badge |
| M5 | **Recovery test: skip it until the SceneStation audit is done.** Closing Eos stops its DMX output, and nobody knows yet what the Gadget II, wireless DMX and SceneStations do then. Don't close Eos, restart the PC or unplug any lighting cable for this test. Instead, observe it **during** the SceneStation audit (worksheet part D2, with the qualified person), with Sanctuary Light open in MONITOR. *Eos on a separate console:* you may unplug **this computer's own** network cable for about 20 s (never the console's, a node's or a DMX cable). | Yellow "Not connected / STALE" banner while Eos is unreachable, then back to MONITOR by itself. The log says "Console connection recovered automatically". |
| M6 | Wizard: **Verify Eos groups** (or *Settings → Groups → Verify against console*) | Each group reads **verified**, **mismatch** or **protected**. Mismatch means the app's list differs from Eos's group; the app will use its own channel list instead. |
| M7 | Try a fader or look in Worship mode | **Blocked**: "Monitor mode is read-only". Eos is unchanged. |
| M8 | *Optional:* **Settings → Connection → Read patch & cues** | Eos patch and cue list numbers appear in *Settings → Patch → Console sync results* for review. Nothing is applied until you choose to. |

✅ **Checkpoint 2:** connection test passed, cue feedback works, recovery worked, groups checked, and Eos was untouched.

## Part 3: One authorized live test, about 15 min

**Only with all three people present, outside worship, nobody on a ladder or lift.** This sends **one** command to **one** channel.

| # | Do this | You should see |
|---|---|---|
| L1 | Choose a harmless, visible, **non-protected** channel (e.g. one front light). The console person notes its current level in Eos. | |
| L2 | Wizard **Live test**: pick that channel and a level (e.g. 50%), tick the three acknowledgements, and **type the channel number** | Buttons unlock only after all of this |
| L3 | Press **1. Arm Live Control** | Red **LIVE** banner |
| L4 | Press **2. Send Chan N At 50** | The room observer sees that one light change. In Eos, the channel shows the new level. |
| L5 | Answer **"Did channel N come on?" → Yes / No** | Recorded in the commissioning record |
| L6 | Press **3. Release (Sneak)** | The channel returns to what the current Eos cue says |
| L7 | Press **4. Back to Monitor**, then click **SIM** | MONITOR, then OFFLINE SIMULATION. **The light doesn't change** when you leave Live. |
| L8 | Wizard **Summary**: write notes (anything surprising) | |

**If the light did *not* come on:** stay calm and don't retry repeatedly. Check Eos's command line and the *Settings → Traffic Log*, write down what you see, and set an **OSC user** number (*Settings → Connection*) if Eos's command line shows Sanctuary Light's text.

✅ **Checkpoint 3:** one channel changed exactly as expected and was released, and leaving Live changed nothing.

## What not to do yet

* Don't use Live mode during a service. First complete [Sunday readiness](SUNDAY_READINESS.md), then run one service in **MONITOR** only ("shadow Sunday").
* Don't test GO/BACK, submasters or relays live until the remaining checks in [COMMISSIONING.md](COMMISSIONING.md) are scheduled, again outside worship.
* Don't record or change cues in Eos from Sanctuary Light. It can't do this today.
