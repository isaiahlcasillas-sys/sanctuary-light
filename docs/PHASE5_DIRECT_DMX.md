# Phase 5: optional direct DMX engine (not implemented)

Goal: let Sanctuary Light output sACN (E1.31) or Art-Net itself, through the **ENTTEC ODE Mk3**, so the church could eventually retire the Ion.

`server/src/engine/directDmxEngine.ts` is a stub. **Its `start()` always throws**, and the DMX mode button is disabled. These questions must be answered before it is built:

1. **Output ownership per universe.** Two sources on one universe will fight. Decide which universes the ODE would carry, and how the Ion is removed from them: physically, by disabling that universe on the Ion, or through Pathport routing.
2. **sACN priority.** If both sources must exist during migration, use explicit per-universe priorities. Never assume merge behaviour on the Pathport, Gadget II or ODE.
3. **Architectural control.** SceneStation zones and anything on the Pathport architectural network must be excluded, or explicitly handed over, so this app can't override them.
4. **Fixture personalities.** The Ion's patch holds DMX footprints today. Direct output needs a fixture library (mode, footprint, parameter offsets) for every fixture. Profiles in this app currently store only Eos parameter *names*.
5. **Failure behaviour.** Decide what the DMX nodes do when this computer stops sending: hold last look, or fade. Configure the ODE's loss-of-data behaviour to match.
6. **No simultaneous modes.** The engine interface allows only one engine at a time. Switching engines must stop the old one first, and the Ion-OSC engine must never run while direct DMX is active.
