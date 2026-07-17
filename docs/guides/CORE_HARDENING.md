# Phase 18.6: Essential Core Hardening

This pass makes tj harder to break without adding new autonomy or new gameplay systems.

## Command Pipeline

1. Ignore tj's own messages.
2. Build a message context with sender, owner status, and addressed-to-bot state.
3. Check emergency stop words before any LLM call.
4. Block non-owner action requests.
5. Run exact and fuzzy command matches.
6. Handle pending confirmations and clarifications.
7. Route natural speech only to existing registered commands.
8. Execute actions through the action gate, skill runner, goals, or curriculum systems.
9. Use dialogue only as a non-executing fallback.

## Owner Gate

Only `ModVinny` may trigger actions. Non-owner messages can receive harmless chat only when configured, but they cannot teach natural mappings, confirm risky work, or run actions.

## Emergency Stop

`tj stop`, `tj cancel`, `tj halt`, fuzzy stop variants, and dashboard/plugin emergency stop all feed cancellation. Cancellation now supports:

- global cancellation state
- cancellation tokens
- registered cancelable task callbacks
- active task listing
- per-task cancellation

Long-running systems must check cancellation before and during work.

## Action Gate

`actionGate.js` centralizes action checks:

- rejects unknown or unimplemented actions
- rejects non-owner action requests
- rejects risky actions without confirmation
- rejects most work while cancellation is active
- normalizes action results

Dashboard and plugin-facing controls must use `actions.executeAction()` instead of calling mutating handlers directly.

## Confirmation Manager

`confirmationManager.js` centralizes short-lived confirmations. Confirmations are owner-only, expire, and are keyed by type so one confirmation cannot accidentally approve another risky operation.

Risky confirmation types include Nether entry, portal lighting, villager trades, blueprint builds, enchanting/anvil/book/potion/brewing, bridge region changes, diamond/deep mining, PVP, large builds, schematic import, memory reset, and risky dashboard controls.

## LLM Safety

Ollama may classify, plan, and speak, but it cannot execute raw actions, invent commands, verify evidence, or generate executable code. Natural routing must resolve to commandRegistry entries.

## Memory Safety

`memorySafeWrite.js` provides safe JSON helpers:

- create defaults when files are missing
- back up corrupt JSON
- write with temp-file then rename
- cap history arrays when requested

Existing memory modules should keep using atomic writes or migrate to these helpers when touched.

## Dashboard And Plugin Safety

Dashboard POST controls require a token and local-only access by default. Mutating dashboard requests must route through safe systems.

The server plugin bridge is optional. It may report events, regions, and emergency-stop signals, but it must not expose raw server commands, teleport, give items, or world-edit style controls.

## Test Commands

Run these from `E:\Games\MCAI\bot`:

```powershell
npm run audit:core-hardening
npm run test:core-hardening
npm run audit:phase10-16
npm run doctor
npm run smoke
```

`doctor` and `smoke` may report server availability if Paper is not running. That is an environment issue, not a core hardening failure.

## Never Allowed

- OpenAI or cloud API calls
- raw LLM action execution
- dashboard/plugin bypass of owner-only checks
- risky work without matching confirmation
- silent memory reset after corruption
- pretending unsupported features work
