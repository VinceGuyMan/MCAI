# Live Core Test Checklist

Purpose: repeatable in-game test for tj's competent core. Do this after starting the local Paper server and tj.

## A. Startup

Run from `E:\Games\MCAI\bot`:

```powershell
npm run doctor
npm run smoke
npm test
```

Expected:

- Doctor and smoke should pass server reachability after the server is running.
- Unit tests should pass.
- No OpenAI/cloud API checks should appear.

Start runtime:

```powershell
cd E:\Games\MCAI
.\Start-MCAI.cmd
```

Join Minecraft 1.21.11 as `ModVinny`.

## B. Core Commands

Run:

```text
tj status
tj come here
tj follow me
```

Walk 20-30 blocks.

Expected:

- tj confirms following.
- tj moves to stay near ModVinny.
- No `GoalChanged` chat error.

Run:

```text
tj stay
tj stop
```

Expected:

- Movement stops.
- Follow state clears.
- No stale chatter after stop.

## C. Natural Commands

Run:

```text
tj we need food
tj get wood
tj find coal
tj get iron
tj lets get ready for mining
tj prepare for night
tj return home
tj store items
tj recover
tj what should we do next?
```

Expected:

- Natural commands route to competent core or safe existing commands.
- No raw LLM action execution.
- No risky action starts without confirmation.
- Failures are short and explain what is missing.

## D. Stop Test

Start one active macro:

```text
tj get wood
```

During movement/digging, run:

```text
tj stop
```

Expected:

- tj stops immediately.
- No hanging pathfinder goal.
- No stale confirmation remains active.
- No delayed planner/dialogue message appears after stop.

## E. Evidence To Save On Failure

If any command fails, preserve:

- `logs/latest.log`
- `logs/mcai.log`
- `session-log.jsonl`
- the exact chat command used
- what tj did physically in-game

Do not clear memory before saving logs.
