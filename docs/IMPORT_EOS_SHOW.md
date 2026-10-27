# Import your Eos show

*Turn the show that's already in Eos into your Sanctuary Light setup, without retyping anything. About 10 minutes, plus arranging the stage.*

**Open Sanctuary Light → Import Eos Show → select the file → preview everything → Import → start arranging your sanctuary.**

## It's safe

Importing is an **offline file import**. It only reads a file you exported, and it only changes **Sanctuary Light's own setup**. It does **not**:

- send anything to Eos (no OSC, not even a read-only query),
- change any light or level,
- change or replace the show that is loaded in Eos,
- touch the Gadget II, the wireless DMX or SceneStation,
- switch Sanctuary Light into Live mode, or change its mode at all.

Your current Sanctuary Light setup is **backed up automatically** first, and **Undo import** puts it back with one click. While **Live** is armed, importing is refused. Switch to SIM or MONITOR first, so nothing you're using changes during operation.

## 1. Export the show from Eos (2 minutes)

Do this from the show that is **already loaded** in Eos. Exporting only writes a new file; it doesn't change the show.

**CSV (recommended: includes fixture types and the parameters each light uses)**
1. In Eos, open the **Browser** and choose **File → Export → CSV**.
2. Leave every show aspect selected (Patch, Groups, Cues, Palettes, Presets, Subs).
3. If there is an **Encoding Format** option, choose **UTF-8**.
4. Choose where to save it. On the sanctuary PC, a folder such as *Documents* is fine. Otherwise use a USB stick. Type a name and press **Enter / {OK}**.

**USITT ASCII (works too, with less detail)**
1. **Browser → File → Export → USITT ASCII**.
2. Turn **{Manufctr Data}** on, **{Standard Delimiter}** on, **{Hexadecimal Levels}** off.
3. Save. The file ends in `.asc`.

> ⚠️ **Don't use File → Open** on the sanctuary PC to open a different show: that replaces the active show. If you only have an `.esf` file of another show, open it with Eos on another computer (the free offline editor) and export from there.

## 2. Import it

1. Sign in with the **operator PIN**.
2. Click **Import Eos Show**. It's in the top bar, on the sample-fixtures banner above the stage, in the **Eos Setup Wizard**, and in **Settings → Patch**.
3. **Drop the file** on the window, or click to browse.
4. Look over the **preview**:
   - **Counts:** fixtures, groups, cue lists and cues, presets and palettes, submasters, and *Needs attention*.
   - **Tabs:**
     - **Fixtures:** each channel's label, Eos fixture type, DMX address, and the controls Sanctuary Light will offer.
     - **Groups:** each group's channels. Any channel not in the patch is flagged.
     - **Cues:** every cue list, with numbers, labels, and timing exactly as Eos exported it.
     - **Presets & palettes**, and **Submasters**.
     - **Issues:** conflicts with your current setup, problems in the file (with line numbers), and everything that was *read but not interpreted*.
5. Choose:
   - **What to import:** fixtures and patch, groups, cue lists and timing, submasters, presets and palettes, and looks from a cue list.
   - **Replace** for the **first** import of your real show (so nothing from the built-in samples is mixed in), then **Merge** for later imports.
   - When merging and both sides differ: **Use what's in Eos** or **Keep my Sanctuary Light changes**.
6. Press **Import**. The done screen shows what changed and the name of the backup.
7. Press **Start arranging my sanctuary** (next section), or first read the import report below.

### Read the import report

**Setup → Import my Eos show** shows exactly what the import gave Sanctuary Light, in four lists:

| List | What's in it |
|---|---|
| **Imported from the file** | Channels and labels, DMX addresses, fixture types, controls taken from parameters the show uses, groups, cue lists (numbers, labels, timing text), submaster labels, preset and palette names, each with a count. |
| **Incomplete or not confirmed** | Channels with no fixture type or no DMX address, channels whose controls couldn't be confirmed (intensity only), groups that include unpatched channels, channels in no group, cues without labels. |
| **Needs setting up here** | Placing fixtures on the stage plan, checking categories (especially house lights), confirming relays and utility channels, choosing volunteer groups, making and approving worship looks, comparing with the running show. |
| **Never imported** | Cue, preset and submaster **contents** (levels, colors), effects, macros, magic sheets, where lights hang, and anything about SceneStation, the Gadget II or wireless DMX. |

Nothing in the report is guessed: a count of 0 means the file didn't contain it. The report describes the **file**. Whether the file matches what Eos has loaded right now is a separate check: **Setup → Verify with Eos** (Monitor mode, read-only).

Tick **"This file was exported from our sanctuary's Eos"** only for a genuine export of today's show. Sample and test files are fine for practice but aren't evidence.

## 3. Arrange your sanctuary

An Eos export doesn't say *where* lights hang, so imported fixtures wait in a **Not yet placed** area below the stage plan and in the list on the Arrange screen. Drag each one onto the stage where it really hangs, then press **Save arrangement** ([SANCTUARY_SETUP.md](SANCTUARY_SETUP.md)).
- **Keep stage positions I've already arranged** (import option) keeps positions for matching channel numbers. It's on when your setup came from an earlier Eos import, and off for a fresh install, so real fixtures never inherit the positions of sample fixtures.
- **Replace** never borrows labels, types, addresses or positions from the setup it replaces. Only protections are kept.

## What gets imported, and how

| From Eos | Becomes in Sanctuary Light | Notes |
|---|---|---|
| Channels, labels | Fixtures (by **channel number**) | A missing label never replaces a label you already have |
| DMX addresses | Universe/address on each fixture | Informational: Eos's patch stays in charge. Multi-part channels and two-fers keep every address. |
| Fixture types (CSV) | One fixture profile per Eos type | Controls are chosen only from **evidence**: the parameters the show actually uses on that type (Red/Green/Blue → color, Pan/Tilt, Zoom, Edge, White, Amber, UV, CTC). A type the export says nothing more about gets intensity only. An Eos "Dimmer" is intensity. |
| Relays / non-dims | Protected fixtures | Types or labels like *Relay*, *Non-Dim*, *Contactor* are protected automatically |
| Groups | Groups with their Eos group number | Start **unverified**. Until you verify them in MONITOR, Live sends the channel list, never "Group N". |
| Cue lists, cue numbers, labels, timing | Cue lists (labels and timing for reference) | Timing is shown exactly as exported (Time, Down, Focus/Color/Beam, delays, Follow, Link, Mark/Block/Assert) |
| Labelled cues in one list you choose | **Looks that fire the real Eos cue** | No stage preview is invented. Each one needs an operator's **review and approval** (Setup → Worship looks) before Volunteer Mode can show it. Re-importing doesn't duplicate them. |
| Submasters | Submasters | A sub that controls a protected channel is protected too. Every imported sub needs an operator's approval before volunteers can use it. |
| Presets, intensity/focus/color/beam palettes | Reference list | They stay in Eos and keep working there. Looks can trigger presets by number. |

**Tracked cues.** Eos stores each cue as only the *changes* from the cue before it. A cue's channel data on its own is therefore not a complete look, and Sanctuary Light never pretends it is. It doesn't rebuild scenes from partial cue data, and it doesn't invent colours or levels. Imported looks simply ask Eos to run the real cue.

**Not imported** (it all keeps working in Eos): effects, macros, snapshots, magic sheets, pixel maps, curves, show control, cue-part timing, and channel levels inside cues. The *Issues* tab lists everything that was read but not used.

## Merge, Replace and conflicts

- **Merge** (recommended) adds what's new and updates what exists. A *conflict* is a channel, group, cue list or sub that exists on both sides with different data. You choose whether Eos or your Sanctuary Light changes win. Local groups without an Eos group number are kept.
- **Replace** makes the chosen parts match the export exactly. Fixtures, groups, cue lists and subs that aren't in the export are removed. You're warned first, and specifically if a **protected** channel would be removed.
- Either way, these are **never** changed: your stage positions, existing protections, connection settings, PINs, commissioning record, Sunday-readiness items and the SceneStation audit.
- **Undo:** on the done screen, or **Settings → Backup → Undo last Eos import**. Every import's backup is kept as `pre-import-…json` in `%LOCALAPPDATA%\Sanctuary Light\backups`.

## Native Eos show files (.esf, .esf2, .esf3d)

Sanctuary Light recognises these, but doesn't read them. ETC doesn't publish the format, and guessing at it could quietly produce wrong data. When you drop one, the window explains how to export a CSV instead (step 1 above).

## After importing: checklist

- ☐ **Issues** tab reviewed (anything not patched, duplicates, unreadable lines)
- ☐ Relay and utility channels show **protected** (Settings → Patch)
- ☐ Fixtures arranged on the stage and **Save layout** pressed
- ☐ Groups **verified** against Eos in MONITOR mode (Setup Wizard → Monitor test → Verify groups)
- ☐ Chose which imported looks volunteers see (Settings → Looks)
- ☐ Sample/demo fixtures removed if you merged (Sunday readiness lists them)

## Troubleshooting

| What you see | What to do |
|---|---|
| Labels with odd characters (Ã©, �) | Export again with **Encoding Format: UTF-8** |
| "names target types only by number" | Your Eos version wrote CSV without the *_AS_TEXT* columns. Try a newer export, or USITT ASCII. |
| Fixtures but no fixture types | That's normal for USITT ASCII. Use the CSV export for types and parameters. |
| Only intensity offered for a colour fixture | The show never records its colour parameters, so the export has no evidence of them. Choose a profile manually in Settings → Patch. |
| "A quoted value is never closed" | The file was cut short (USB removed early?). Export again. |
| Import button disabled | Live is armed (switch to SIM/MONITOR), nothing is selected, or the file had no usable data |

## For the technically curious

- **CSV:** ETC doesn't publish a column reference for the CSV export. Sanctuary Light recognises each `START_…` / `END_…` block **by its column names**, not by position or block name:
  - **Target blocks:** `TARGET_TYPE_AS_TEXT`, `TARGET_ID`, `LABEL`, and timing columns like `TIME_DATA`, `UP_DELAY`, `DOWN_TIME` … `FOLLOW`, `LINK`.
  - **Level blocks:** `CHANNEL` plus `PARAMETER_TYPE_AS_TEXT`.
  - **Patch blocks:** `CHANNEL` plus `ADDRESS`, `FIXTURE_TYPE`, `LABEL` and similar.
  - **Not used:** the numeric `TARGET_TYPE` code isn't documented, so it isn't used.
  - A plain patch spreadsheet with a `channel` column also works.
- **USITT ASCII:**
  - **Standard records:** Ident, Manufacturer, Console, Patch (`1<1@FL` or commas-only), Cue (Eos writes the cue list in the "page" field), Part, Text, Up, Down, Followon, Link, Chan, Group, Sub, EndData.
  - **ETC extensions:** `$$Format`, `$$UText` (UTF-8 labels; ETC requires a Text record too) and `$ChanLabel`.
  - **Other manufacturer keywords** are counted and listed, not guessed at.
- **Encodings:** UTF-8 (with or without BOM), UTF-16 LE/BE (with or without BOM) and Windows-1252 / Latin-1.
- **Test files:** the automated tests use files written to these formats (`server/test/fixtures/eos-import`), not exports from our console. When you import the real show, read the **Issues** tab first. If something in it looks wrong, keep the export file and report it; the parsers can then be adjusted against the real data.
