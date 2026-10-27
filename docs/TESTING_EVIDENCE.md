# Testing evidence: simulated vs. real

Sanctuary Light is tested a lot. **Almost all of that testing is against simulated data.** This page keeps the two apart, so nobody mistakes "the tests pass" for "it works with our Eos".

## What has been tested, and against what

| Area | Tested against | Where | Says anything about our real system? |
|---|---|---|---|
| CSV and USITT ASCII parsing | **Sample files written to the published formats** (`server/test/fixtures/eos-import`) | Automated tests (Windows, macOS, Linux CI) | **No.** No genuine export from our Eos has been imported yet. |
| Import plan: merge/replace, protections, no invented data | Sample files | Automated tests | No |
| OSC commands, Monitor read-only gate, group verification | **FAKE console** (`server/tools/fake-eos.ts`) | Automated tests | No |
| Show Verification: patch/cue/group comparison, incomplete reads, change warnings | FAKE console serving the sample show | Automated tests and browser test | No |
| Volunteer approval enforcement (looks, cues, submasters, GO/BACK, every command kind) | In-process controller | Automated tests, plus a browser check of GO/BACK approval | It tests Sanctuary Light's rule, not Eos |
| Verification can't report success from incomplete, old or outdated data | Pure functions | Automated tests | No |
| Whole Setup workflow in a browser | FAKE console and sample CSV, Chromium | Browser test (screenshots in `docs/screenshots/setup-*.png`) | No |
| Windows install, supervisor, crash recovery | GitHub's Windows Server runner | CI smoke test | Partly: same Windows family, not the sanctuary PC |
| Design workspace, Look Designer, look library, simulated crossfades, Volunteer Mode | Sample setup, Chromium at 1920×1080, 1366×768, 1024×768 and 768×1024 | Browser tests (screenshots in `docs/screenshots/phase4a/`), automated tests (`phase4a.test.ts`) | No |
| New inspector drives Eos as before: SIM preview, Monitor blocked, Live sends `Chan 1 At Full` | FAKE console | Browser test | No |
| Apply to Eos: exact commands, skipped/omitted channels, Monitor and SIM send nothing, refusals (volunteer, unverified, show changed, unknown channel, stale), interruption, partial failure, overlap | FAKE console | Automated tests (`phase4b.test.ts`) and browser test | **No** |
| Record to Eos: preconditions, never overwrite, read-back confirmation | FAKE console (nobody presses Record on it) | Automated tests and browser test | **No** |
| Real install → uninstall; an unrelated program keeps running; settings kept | GitHub's Windows Server runner | CI | Partly: not the sanctuary PC, no Eos or USB key present, and the start-at-sign-in task can't be observed without an interactive sign-in |
| Test suite can't reach Eos ports (3032, 3036, 3037, 8000, 8001) | Guard in every test run, plus its own test | Automated tests | It protects the real PC during install; it says nothing about Eos |
| First launch → import → import report → same-PC Monitor connection → verification | FAKE Eos 3.3 on 127.0.0.1, sample CSV, Chromium | Browser test (screenshots `docs/screenshots/first-launch-welcome.png`, `setup-import-report.png`, `setup-connect-same-pc.png`, `setup-verify-same-pc.png`) | No |

The FAKE console names its show "FAKE SHOW (not a real console)". Sanctuary Light recognises that name: verifications against it are marked **simulated** and never complete the First Real Connection workflow.

## Real-system evidence (fill in at church)

Nothing below has been confirmed yet. Add a row only with evidence from the sanctuary: a screenshot, an export file kept in the shared folder, or a note of who saw it.

| Date | What was tested | Eos version / show | Result | Evidence | By |
|---|---|---|---|---|---|
| | Installer on the sanctuary PC with Eos open and the USB key in: Eos kept running, key still recognised | | | | |
| | Genuine CSV export imported (Issues tab and import report reviewed) | | | | |
| | Monitor connection on the sanctuary PC (127.0.0.1) | | | | |
| | Show Verification against the real console | | | | |
| | Groups verified against the real console | | | | |
| | Supervised single-channel live test | | | | |
| | **Live look test:** a designed look applied to one fixture through Eos (Setup → Supervised testing) | | | | |
| | Fade sent as Eos manual time (`At … Time …`) | | | | |
| | Record to Eos (assisted): cue recorded on Eos and confirmed by read-back | | | | |
| | Gadget II / wireless DMX / SceneStation behaviour when Eos stops | | | | |

Until these rows are filled in, **real console compatibility is unconfirmed.**
