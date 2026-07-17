# Live Reliability Report

Date/time: 2026-05-13 08:36:22 -04:00

## Executive Summary

This pass inspected the latest live Minecraft field logs and patched only failures tied to that run. The biggest live problem was movement/pathfinder interruption: `tj come here`, `tj follow me`, and the food routine were fighting pathfinder goals and surfacing `The goal was changed before it could be completed!` in chat.

Ollama and model storage now check healthy, but the Minecraft server was not reachable during this retest pass, so the 15 core live commands still need an in-game retest.

## Logs Inspected

- `session-log.jsonl`
- `logs/latest.log`
- `logs/mcai.log`
- `.runtime/ollama.log`
- `.runtime/ollama.err.log`

## Test Commands Seen In Latest Live Log

- `tj come here`
- `tj status`
- `tj we need food`
- `tj follow me`
- `tj stop`
- `tj follow me]`
- `tj recover`

## Top 10 Real Field Issues

1. `tj come here` produced `I hit a chat error: The goal was changed before it could be completed!`.
2. `tj follow me` did not produce a clear follow confirmation and did not hold a durable follow state.
3. Brain safety recovery could overwrite active follow/come movement goals.
4. `tj we need food` could trigger food pathing and then surface pathfinder interruption errors.
5. Food return-to-owner used raw `pathfinder.goto()` without treating `GoalChanged` as a normal interruption.
6. Drop collection and return-after-collect could also throw pathfinder interruptions.
7. A stale LLM/dialogue response could land after `tj stop`.
8. Ambient banter could speak within seconds of an owner command, making tj feel like it ignored the task.
9. Food core macro evidence could look like only `dialogue_reply_sent`, which is weak for field debugging.
10. Doctor/smoke currently fail live-server reachability on `127.0.0.1:25565`.

## Patch Applied

- Hardened food return-to-owner and drop collection pathing so expected path interruptions return clean results instead of chat errors.
- Hardened inventory drop collection and return-after-collect the same way.
- Added food action evidence for `get_food`, `find_food`, `eat_if_hungry`, cooking, hunting, fishing, and plant gathering.
- Updated `getFood()` to return standard evidence and useful data.
- Suppressed stale generated dialogue if `tj stop` occurred after the response began.
- Suppressed ambient banter shortly after owner activity, after manual stop, and during active movement/follow state.
- Added regression tests for interrupted food return and stale dialogue-after-stop suppression.

## Retest Results

Passed:

- `node --check bot\food.js`
- `node --check bot\inventory.js`
- `node --check bot\dialogue.js`
- `node --check bot\chat.js`
- `node --check bot\ambientDialogue.js`
- `node --check bot\actions.js`
- `node --test --test-concurrency=1 test/runtime-bugs.test.js` - 26 passed
- `npm run test:competent-core` - 8 passed
- `npm run test:natural-router` - 8 passed
- `npm run competent:audit` - passed
- `npm test` - 202 passed

Failed due to environment:

- `npm run doctor` - failed only on `server reachable - 127.0.0.1:25565`
- `npm run smoke` - failed only on `Minecraft server reachable - 127.0.0.1:25565`

Healthy checks from doctor/smoke:

- Ollama reachable.
- `OLLAMA_MODELS` store exists at `E:\Ollama Models`.
- `qwen3:14b`, `mistral-nemo:12b`, `qwen2.5-coder:14b`, and `phi4-mini:latest` are available.
- No OpenAI/cloud API required.

## Remaining Issues

- The 15 core commands still need a live Minecraft retest because the server was unreachable during this pass.
- `tj we need food` should be rechecked around animals/crops because unit tests cannot prove real-world pathing quality.
- `tj follow me` should be retested while ModVinny walks 20-30 blocks, then with `tj stay`.
- `tj stop` should be tested during an active food/wood/mining macro.
- The server log's `[spark]` messages are Paper's bundled profiler, not an MCAI model/runtime issue.

## Next Test Recommendation

Start the Paper server and tj, join as ModVinny, then run `LIVE_CORE_TEST.md` exactly. If any command fails, save `logs/latest.log` and `session-log.jsonl` immediately after the run so the next patch pass can target the new real failure.
