# Phase 4A design review: before and after

*For design feedback. Screenshots are from the browser test against the built-in sample setup in Offline Simulation (not our real show).*

## Audit of the previous interface

**What worked and was kept:**
- the dark theme, the always-visible mode banner (SIM / MONITOR / LIVE) and the safety badges;
- the overhead stage plan with simulated beams;
- colorful look buttons and the color wheel;
- every safety rule on the server (unchanged).

**What felt technical, cluttered, or unlike lighting software:**
- a crowded top bar (about 13 controls, two identical-looking switchers) that wrapped onto two rows on a tablet;
- a stage squeezed between panels, with tiny fixtures and no sign of which fixtures' controls were unknown;
- the control panel opened with Eos syntax ("CHAN 1 THRU 19 + 30 + 79 + 80") and a tall, mostly empty fader;
- looks could only be captured ("Save stage as look", group levels only): no editing, thumbnails, collections or fades, and every card said "Local look · preview only";
- on a tablet the fixture panel's text overlapped other panels;
- Volunteer Mode showed "GO = MASTER PLAYBACK", cue-list numbers and a paragraph about Eos console keys, and a disabled GO button still looked bright.

## Design workspace

| Before | After |
|---|---|
| ![](screenshots/phase4a/before-workspace-desktop.jpg) | ![](screenshots/phase4a/after-workspace-desktop.jpg) |
| ![](screenshots/phase4a/before-workspace-laptop.jpg) | ![](screenshots/phase4a/after-workspace-laptop.jpg) |
| ![](screenshots/phase4a/before-workspace-tablet.jpg) | ![](screenshots/phase4a/after-workspace-tablet.jpg) |

1920×1080, 1366×768 and 1024×768. Full stage view (**F**):

![](screenshots/phase4a/after-full-stage-desktop.jpg)

## Look editor

| Before: "Save stage as look" | After: the Look Designer |
|---|---|
| ![](screenshots/phase4a/before-look-editor-desktop.jpg) | ![](screenshots/phase4a/after-look-editor-desktop.jpg) |

Tablet: ![](screenshots/phase4a/after-look-editor-tablet.jpg)

A simulated 4-second crossfade, caught halfway:

![](screenshots/phase4a/after-crossfade-mid-desktop.jpg)

## Volunteer Mode

| Before | After |
|---|---|
| ![](screenshots/phase4a/before-volunteer-desktop.jpg) | ![](screenshots/phase4a/after-volunteer-desktop.jpg) |
| ![](screenshots/phase4a/before-volunteer-laptop.jpg) | ![](screenshots/phase4a/after-volunteer-laptop.jpg) |
| ![](screenshots/phase4a/before-volunteer-tablet.jpg) | ![](screenshots/phase4a/after-volunteer-tablet.jpg) |

Tablet portrait (768×1024): ![](screenshots/phase4a/after-volunteer-tablet-portrait.jpg)

GO/BACK appear as large buttons only when volunteers are authorised (an approved master cue list, and an Eos version where GO/BACK address the list). Otherwise a calm note says they aren't set up, with a "Why?" for the details.

## Open questions for feedback

- The Design view keeps the Eos channel numbers small, under the selection name. Should they be hidden entirely for non-technical operators?
- Look collections: are Worship, Sermon, Seasonal and Special Events the right defaults?
- Volunteer Mode shows "Room lights" from the groups and submasters marked for volunteers. Should house lights get their own, larger control?
- The stage colors are approximations. Once the real show is imported and arranged, which fixtures look most wrong?
