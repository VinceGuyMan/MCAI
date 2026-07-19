# Skills and evidence

MCAI's skill layer describes what the companion can attempt, what is safe to run, and what evidence counts as success. It does not allow an LLM to execute arbitrary code or bypass the normal action gates.

## How a skill is defined

Each entry in `bot/skillRegistry.js` includes:

- a stable name and category;
- a human-readable description;
- whether the skill is implemented;
- a risk level;
- whether owner confirmation is required;
- preconditions and inputs;
- expected success evidence;
- cooldown and runtime limits;
- the deterministic action it calls.

The registry may contain parked or unimplemented entries so MCAI can report limitations honestly. Registration is not proof that a skill works or is enabled.

## Supported companion skills

The current product prioritizes a small surface-survival set:

- status and inventory summaries;
- come, follow, stay, and cancellation;
- food status and basic food handling;
- gathering wood and mining capped amounts of stone, coal, and surface iron;
- crafting basic tool sets;
- smelting charcoal and iron;
- returning to the owner or a known safe place when the relevant action is available.

Exact availability depends on the configured safety profile, required Mineflayer plugins, inventory, loaded chunks, and live world conditions. Ask the bot for current registry status rather than assuming every source file represents a supported feature.

Useful in-game queries from the configured owner account:

```text
tj skills
tj skill status
tj skill runner status
tj active skill
tj skill stats
tj recent skills
tj evidence status
tj stop
```

## Execution path

```text
owner chat or local dashboard
→ command routing
→ owner/risk checks
→ skill validation
→ deterministic action
→ result normalization
→ evidence and history
```

`bot/skillRunner.js` executes only known, implemented, allowed skills. It checks the configured owner, preconditions, risk, confirmation, cooldown, cancellation state, and runtime limit before recording a result.

Low-risk status skills can be run from the dashboard. Movement, collection, mining, building, resource spending, combat, portal, villager, and similar actions remain subject to their normal safety gates even when a corresponding skill exists.

## Evidence

Evidence is MCAI's way to distinguish an attempted action from a verified result. Examples include:

- a status report was produced;
- inventory increased by the expected material;
- a path goal was set or cleared;
- a smelt completed or returned a specific honest failure reason;
- the bot returned safely after a resource task.

Evidence records can include status, confidence, source, timestamp, duration, and a short detail. `bot/progressEvidence.js` defines known evidence names, and `bot/skillMemory.js` stores bounded skill history and aggregate success/failure information.

Evidence should never be fabricated to make a feature look complete. A partial result, blocked precondition, cancellation, timeout, or unsupported operation must be recorded as such.

Useful evidence commands:

```text
tj skill evidence status
tj evidence summary
tj evidence definitions
tj evidence audit
tj verify skill status
```

`verify skill` is limited to safe runner-enabled skills; it is not a general action executor.

## Risk and confirmation

- **Low risk:** informational or easily reversible operations may run without an extra prompt.
- **Medium risk:** operations that move, spend, dig, place, trade, or alter persistent state may require confirmation depending on their action gate.
- **High risk:** dangerous travel, combat, portals, destructive building, and similar actions remain blocked or explicitly confirmation-gated.

Only `ownerUsername` from the private configuration may approve or run owner-only work. Dialogue, natural-language routing, dashboard requests, and optional LLM output cannot override that identity check.

`tj stop` and the dashboard STOP control are intended to cancel the active skill and its underlying task. Long-running action implementations must observe the shared cancellation state and return an honest cancelled result.

## Parked and removed systems

The supported companion build keeps broad advanced autonomy, villagers, Nether exploration, blueprint execution, experimental combat, and most gear mutation off by default. Their status helpers may still be registered for inspection.

The former curriculum and progression operating systems were removed from the live Player-2 tree. Compatibility stubs may still return a retired status so old commands and dashboard reads fail calmly. Do not use old curriculum/progression commands or the archived audit scripts as current setup guidance.

Historical designs live under `archive/removed-for-player2/`. They are not loaded as product features.

## Developer checks

From the repository root:

```powershell
Set-Location .\bot
npm run skill:audit
npm run test:skills
npm run test:evidence
npm run test
```

Before marking a new skill implemented:

1. Wire it to a deterministic action.
2. Define realistic preconditions and evidence.
3. Set an appropriate risk and confirmation policy.
4. Verify cancellation and runtime limits.
5. Add isolated unit tests.
6. Perform an in-game test when the skill touches the world.
7. Update current documentation with limitations and failure modes.

## Adding a skill

Prefer extending a reliable existing domain over adding another broad feature family. New skills should be small, measurable, and honest about loaded-chunk, inventory, pathing, and Mineflayer limitations. They must not expose shell commands, arbitrary JavaScript, raw LLM-generated actions, or a way around owner confirmation.
