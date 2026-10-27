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

The FAKE console names its show "FAKE SHOW (not a real console)". Sanctuary Light recognises that name: verifications against it are marked **simulated** and never complete the First Real Connection workflow.

## Real-system evidence (fill in at church)

Nothing below has been confirmed yet. Add a row only with evidence from the sanctuary: a screenshot, an export file kept in the shared folder, or a note of who saw it.

| Date | What was tested | Eos version / show | Result | Evidence | By |
|---|---|---|---|---|---|
| | Genuine CSV export imported (Issues tab reviewed) | | | | |
| | Monitor connection on the sanctuary PC (127.0.0.1) | | | | |
| | Show Verification against the real console | | | | |
| | Groups verified against the real console | | | | |
| | Supervised single-channel live test | | | | |
| | Gadget II / wireless DMX / SceneStation behaviour when Eos stops | | | | |

Until these rows are filled in, **real console compatibility is unconfirmed.**
