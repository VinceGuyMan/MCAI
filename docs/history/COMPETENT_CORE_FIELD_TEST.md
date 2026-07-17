# Competent Core Field Test

Phase 20 adds a small reliable helper lane for everyday survival work. These tests do not need creative planning; they check whether tj can route common requests into deterministic safe macros.

## Setup

1. Start Ollama and the local Paper server.
2. Start tj with `Start-MCAI.cmd`.
3. Join as `ModVinny`.
4. Run `tj core status`.

Expected: tj reports that competent core is on and no macro is active.

## A. Natural Food

Command:

```text
tj we need food
```

Expected:
- Routes to the `get_food` core macro.
- Checks food first.
- Eats if hungry and food is available.
- If food is missing, runs the existing food helper.
- Reports a short result or a useful blocker.

## B. Wood

Command:

```text
tj get wood
```

Expected:
- Routes to `gather_wood`.
- Gathers only a capped small amount.
- Stops when the target is reached or when a clear failure occurs.
- `tj stop` cancels it.

## C. Mining Prep

Command:

```text
tj lets get ready for mining
```

Expected:
- Routes to `prepare_for_mining`.
- Checks food, inventory, tools, and mining status.
- May craft basic tools if materials are available.
- Does not start mining unless separately asked.

## D. Coal

Command:

```text
tj find coal
```

Expected:
- Routes to `mine_coal`.
- Mines a small capped amount of visible/reachable coal through existing mining safety.
- Does not deep-mine automatically.

## E. Iron

Command:

```text
tj get iron
```

Expected:
- Routes to `mine_iron`.
- Requires existing mining safety/tool checks.
- Does not deep-mine or search caves broadly.

## F. Safety Ambiguity

Command:

```text
tj make us safe
```

Expected:
- tj asks a clarification question.
- It does not randomly build, fight, mine, or place blocks.

## G. Recovery

Command:

```text
tj recover
```

Expected:
- Stops current movement/task state.
- Reports status.
- Offers a simple next recovery option if there was a recent failure.

## H. Stop

Start any macro, then run:

```text
tj stop
```

Expected:
- Active core macro stops immediately.
- The next safe command is not blocked by stale cancellation.

## Reliable Core Commands

```text
tj core status
tj core macros
tj run core get food
tj run core gather wood
tj run core prepare mining
tj run core mine coal
tj recover
tj what can you reliably do?
```

## Still Advanced or Guarded

Blueprint building, villager trading, enchanting, Nether entry, large exploration, and combat remain guarded by their existing confirmation and safety systems. Competent Core does not make those systems more autonomous.
