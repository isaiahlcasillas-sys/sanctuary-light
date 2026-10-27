# First-day testing: Simulation → Monitor → authorized Live test

*Do this on a weekday, **outside worship hours and outside any event or rehearsal**. Plan about 2 hours.*

**People:**
- **Operator:** at the Mac.
- **Console person:** at the Ion, can override anything.
- **Room observer:** in the sanctuary, can see the lights. Optional for parts 1–2, required for part 3.

**Before you start:**
☐ [Installation](INSTALL_MAC.md) is complete and `check-mac.sh` shows no ❌ except the power-cut items, if you've chosen not to change those.
☐ [On-site checklist](ONSITE_CHECKLIST.md) is complete.
☐ The **Ion show file was backed up to USB today**.
☐ Everyone knows the stop rule below.

> **Stop rule.** If anything unexpected happens to the real lights, the console person takes over at the Ion as normal, and the operator clicks **SIM** in Sanctuary Light. Switching to SIM never sends anything to the Ion. Write down what happened before trying again.

---

## Part 1: Offline Simulation (SIM), about 30 min. No connection to the Ion.

The top banner must read **OFFLINE SIMULATION** the whole time.

| # | Do this | You should see |
|---|---|---|
| S1 | Open Sanctuary Light, sign in with the operator PIN | Blue OFFLINE SIMULATION banner; connection pill says "Offline" |
| S2 | **Settings → Patch → Import** your patch file (from the on-site checklist). Read the preview and warnings, then **Merge** or **Replace** | Your real channel numbers and labels |
| S3 | In the Patch table, tick **Protect** for every relay and utility channel. **Delete the two "DEMO Mover" rows.** | Protected channels show red outlines on the stage |
| S4 | **Settings → Groups**: set the channel lists to match the Ion's house, front and stage groups. Enter the Eos group numbers. | Groups show **unverified** for now. That's expected; nothing is connected. |
| S5 | **Worship** mode: click group chips, move faders, try colors | The stage picture changes. The toast says **"preview only (offline). Nothing was sent to the Ion."** |
| S6 | Click a relay channel and press **Full** | **Blocked**: "Protected channel(s)…" |
| S7 | **Volunteer** mode: press looks and GO/BACK | Preview only; each look is labelled **Local look · preview only** unless mapped to an Ion cue |
| S8 | **Architectural** mode | Explains SceneStation and shows "Not yet done" for the audit |
| S9 | Look at the Ion | **Nothing on the Ion changed.** (It can't: SIM sends no network traffic.) |

✅ **Checkpoint 1:** the patch is loaded, relays are protected, and the Ion was untouched.

## Part 2: MONITOR (read-only), about 45 min

MONITOR connects to the Ion but **can only listen**. Lighting commands are blocked twice: by the app's controller, and again by the network layer itself.

| # | Do this | You should see |
|---|---|---|
| M1 | Click **Ion setup** (top bar) and work through **Before you start → Eos version → Network**. Enter the version **exactly** as shown on the Ion, and the Ion's IP. Tick each console step only once you've confirmed it on the Ion. | The wizard picks the right port for your version (TCP 3032 for Eos 2.x–3.0; TCP 3037 for 3.1+) |
| M2 | Wizard **Monitor test → Connect in Monitor mode**, then **Run connection test** | Teal **ION MONITOR (READ-ONLY)** banner; "Console replied in … ms"; the console's reported Eos version |
| M3 | *If there's no reply:* check that the Ion IP is correct, the Mac and Ion are on the same network (the wizard's Network step shows this), and that OSC RX/TX are on in the Ion's Show Control settings. For Eos 2.x, also check that the OSC TCP format matches (default OSC 1.0). | Re-run the test after each fix. **Live mode also needs these replies**: if the Ion never answers, Sanctuary Light refuses to send commands rather than control it blind. |
| M4 | Console person: press **GO** on a harmless cue on the Ion | Sanctuary Light's **Current cue** card updates, with a green **CONSOLE** badge |
| M5 | **Recovery test:** unplug the Mac's network cable for about 20 seconds, then plug it back in | Yellow "Not connected / STALE" banner while unplugged, then back to MONITOR by itself. The log says "Console connection recovered automatically". |
| M6 | Wizard: **Verify Eos groups** (or *Settings → Groups → Verify against console*) | Each group reads **verified**, **mismatch** or **protected**. Mismatch means the app's list differs from the Ion's group; the app will use its own channel list instead. |
| M7 | Try a fader or look in Worship mode | **Blocked**: "Monitor mode is read-only". The Ion is unchanged. |
| M8 | *Optional:* **Settings → Connection → Read patch & cues** | Ion patch and cue list numbers appear in *Settings → Patch → Console sync results* for review. Nothing is applied until you choose to. |

✅ **Checkpoint 2:** connection test passed, cue feedback works, recovery worked, groups checked, and the Ion was untouched.

## Part 3: One authorized live test, about 15 min

**Only with all three people present, outside worship, nobody on a ladder or lift.** This sends **one** command to **one** channel.

| # | Do this | You should see |
|---|---|---|
| L1 | Choose a harmless, visible, **non-protected** channel (e.g. one front light). The console person notes its current level on the Ion. | |
| L2 | Wizard **Live test**: pick that channel and a level (e.g. 50%), tick the three acknowledgements, and **type the channel number** | Buttons unlock only after all of this |
| L3 | Press **1. Arm Live Control** | Red **LIVE** banner |
| L4 | Press **2. Send Chan N At 50** | The room observer sees that one light change. On the Ion, the channel shows the new level. |
| L5 | Answer **"Did channel N come on?" → Yes / No** | Recorded in the commissioning record |
| L6 | Press **3. Release (Sneak)** | The channel returns to what the current Ion cue says |
| L7 | Press **4. Back to Monitor**, then click **SIM** | MONITOR, then OFFLINE SIMULATION. **The light doesn't change** when you leave Live. |
| L8 | Wizard **Summary**: write notes (anything surprising) | |

**If the light did *not* come on:** stay calm and don't retry repeatedly. Check the Ion's command line and the *Settings → Traffic Log*, write down what you see, and set an **OSC user** number (*Settings → Connection*) if the Ion's command line shows Sanctuary Light's text.

✅ **Checkpoint 3:** one channel changed exactly as expected and was released, and leaving Live changed nothing.

## What not to do yet

* Don't use Live mode during a service. First complete [Sunday readiness](SUNDAY_READINESS.md), then run one service in **MONITOR** only ("shadow Sunday").
* Don't test GO/BACK, submasters or relays live until the remaining checks in [COMMISSIONING.md](COMMISSIONING.md) are scheduled, again outside worship.
* Don't record or change cues on the Ion from Sanctuary Light. It can't do this today.
