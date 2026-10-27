# On-site information checklist

*Gather the facts Sanctuary Light needs about our real system. **Read and photograph only**: nothing here changes the Ion, the gateways, the wiring or any lights.*

Bring: a phone camera, a notebook (or print this page), a USB drive, and the booth Mac. Take a photo of every screen and label you record. Save the photos in a shared folder named with today's date.

## 1. ETC Ion: software and identity

| ☐ | Item | How to find it | Record |
|---|---|---|---|
| ☐ | Eos software version | On the Ion: **Browser → Help → About** (some versions: the About tab). Write it exactly, e.g. `2.9.3` or `3.2.12`. | |
| ☐ | Ion model | Ion Classic, Ion Xe, Ion Xe 20? Check the label on the back. | |
| ☐ | Windows version (Ion Classic only) | Shown at start-up, or ask ETC/your dealer. **Ion Classic on Windows XP can't run Eos 3.x.** | |
| ☐ | Show file name | Top of the Ion's main display | |
| ☐ | When the show file was last backed up, and where | Ask the lighting lead. **Back it up to USB today** before any testing (File → Save As to USB). | |

## 2. Ion network settings

Find these in the Ion's network settings. On Eos 2.x–3.2 they're in the **ECU / Shell → Settings → Network**. On Eos 3.3+, **Setup → Device Settings → Network**. Look only; don't change anything.

| ☐ | Item | Record |
|---|---|---|
| ☐ | IP address of the Ion's network port used for the lighting network | |
| ☐ | Subnet mask | |
| ☐ | Fixed (static) or automatic (DHCP)? | |
| ☐ | Interface protocols turned on (sACN, Net3, Art-Net, "UDP Strings & OSC", "OSC TCP", "Third Party OSC") | |
| ☐ | Setup → System → Show Control → OSC: are **OSC RX** and **OSC TX** on? Any OSC ports listed? | |

## 3. The booth Mac's network

| ☐ | Item | How | Record |
|---|---|---|---|
| ☐ | Is the Mac plugged into the **same switch/network** as the Ion? | Follow the cable | |
| ☐ | Mac IP address and subnet | *System Settings → Network → Ethernet → Details → TCP/IP* | |
| ☐ | Same subnet as the Ion? | First three numbers usually match (e.g. 10.101.100.x), depending on the subnet mask | |
| ☐ | Is this network separate from office and guest Wi-Fi? | Ask whoever manages church IT | |

## 4. The Ion patch (the list of channels)

Choose **one** of these ways to get a copy:

| ☐ | Method | Notes |
|---|---|---|
| ☐ | **Export from the Ion** to USB, if your Eos version offers it (*File → Export → CSV* or *USITT ASCII*) | Bring the file to the Mac. Import it in *Settings → Patch → Import*. Check the preview before applying. |
| ☐ | **Read it over the network** with Sanctuary Light (Eos 2.x and later) | Only in **MONITOR** mode on test day: *Settings → Connection → Read patch & cues*. Read-only. |
| ☐ | **Photograph the Patch display** page by page | Slowest, but always works |

Then record, for the whole patch:

| ☐ | Item | Record |
|---|---|---|
| ☐ | Total number of channels | |
| ☐ | Which channels are **relays, contactors or utility power** (these must be marked *Protected*) | |
| ☐ | Which channels are house lights / pendants | |
| ☐ | Which channels are front light, stage color, scenic | |
| ☐ | Which channels might be controlled by SceneStation as well as (or instead of) the Ion | |
| ☐ | Ion **groups** used for house, front, stage (group number and name) | |
| ☐ | Ion **cue lists** in use, and the cue numbers used for a normal Sunday | |
| ☐ | **Submasters** in use (number and what they do) | |

## 5. Fixtures

For each **type** of fixture (not each unit), photograph the label and record:

| ☐ | Fixture type | Make / model (from the label) | Mode / channel count (set on the fixture) | Eos fixture type it's patched as (Patch display) | Channels |
|---|---|---|---|---|---|
| ☐ | Stage PARs (Monoprice/Stagelight?) | | | | |
| ☐ | Chauvet COLORband H9 USB | | | | |
| ☐ | WonderBars | | | | |
| ☐ | ETC Source 4WRD | | | | |
| ☐ | Fuze pendants | | | | |
| ☐ | Chorus Line | | | | |
| ☐ | Others | | | | |

## 6. Gateways and DMX

| ☐ | Device | Model / serial | IP address | Which DMX universes or ports it outputs | Where its DMX cables go |
|---|---|---|---|---|---|
| ☐ | Pathway Pathport (each unit) | | | | |
| ☐ | ENTTEC ODE Mk3 | | | | |
| ☐ | ETC Gadget II (which computer is it plugged into? Is it used?) | | — | | |
| ☐ | Dimmer racks / relay panels | | | | |

## 7. SceneStation

**Don't open wall plates or change switches.** For each station:

| ☐ | Item | Record |
|---|---|---|
| ☐ | Location (e.g. "east entry, left of door") | |
| ☐ | Button labels (photo) | |
| ☐ | LED colors at power-up, if known: all green = wireless model (SS-205/305); all red = older non-wireless SS-105 | |
| ☐ | Does anyone have the **SceneStation Studio** software and its **USB RF adaptor**? Where are they kept? | |
| ☐ | Who installed it (contractor name, drawings, invoices)? | |

Detailed SceneStation behavior is in the [SceneStation worksheet](SCENESTATION_WORKSHEET.md).

## Checkpoint

☐ Ion show file backed up to USB today
☐ Eos version and Ion IP recorded
☐ Patch copy obtained (file, network read, or photos)
☐ Relay and utility channels identified
☐ Mac is on the same network as the Ion

Then continue with [First-day testing](FIRST_DAY_TESTING.md).
