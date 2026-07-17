# Release Notes: 1.0.0-local

## Summary

`1.0.0-local` stabilizes the MCAI bot for local testing with Paper `1.21.11`, Mineflayer, and local Ollama models. Current role routing uses `qwen3:14b` for command routing/planning, `mistral-nemo:12b` for dialogue, `qwen2.5-coder:14b` for structured/code helper work, and `phi4-mini:latest` as fallback.

This is a feature freeze release. It focuses on correctness, safety, diagnostics, persistence, and documentation.

## Features Included

- Owner-only commands for `ModVinny`.
- Physical Mineflayer bot named `tj`.
- Emergency stop/cancel/halt/freeze.
- Core movement, status, help, inventory, food, armour, and crafting basics.
- General crafting through Mineflayer recipes where supported.
- Home/base/storage basics.
- Safe resource runs and basic mining helpers.
- Basic farming and animal pen helpers.
- Exploration/map memory and waypoint support.
- Defensive combat modes and threat scan.
- Long-term goal planning with capability validation.
- Nether preparation and guarded Nether entry with confirmations.
- Lifelike dialogue, typo tolerance, prompt-injection defense, and conversation memory.
- Command registry and capability audit.
- Config validation and structured logging.
- Atomic memory writes and malformed-file backups.
- Safety audit, smoke test, Ollama test, and unit tests.

## Known Limitations

- Fire resistance brewing is not implemented.
- Advanced build clearing and large structures are not implemented.
- Diamond mining, deep mining, caving, Nether exploration, Nether mining, fortress search, and bastion search are not 1.0 goals.
- Combat is defensive and cautious, not a perfect fighting AI.
- Animal luring and pathfinding can be terrain-sensitive.
- Java is not on PATH on the current test machine, but the server is reachable.

## Safety Defaults

- No OpenAI API.
- No cloud API.
- PVP disabled.
- Autonomous Nether entry disabled.
- Autonomous Nether exploration/mining disabled.
- Diamond use requires confirmation.
- Portal lighting requires confirmation.
- Nether entry requires confirmation.
- Non-owner commands are refused.
- Dialogue cannot execute raw actions.

## Testing Performed

- `npm run check`: passed.
- `npm test`: passed.
- `npm run audit:safety`: passed.
- `npm run smoke`: passed.
- `npm run doctor`: passed.
- `npm run test:ollama`: passed.

## Post-1.0 Backlog

See `BACKLOG.md`.
