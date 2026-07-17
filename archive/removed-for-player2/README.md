# Removed for living Player 2 focus

These systems were **not** co-op Minecraft skills. They were meta “OS” layers (skill curricula, milestone planners, orphan audit modules) that fought the goal of a simple living companion.

## Removed

| Area | Why |
|------|-----|
| **Curriculum engine** | “Practice skill tracks” for the bot — not player-2 behavior |
| **Progression / milestones / vanilla advancement bridge** | Advancement planner OS — not needed for companion play |
| **testArena** | Internal test checklist module (replaced by short smoke plans) |
| **Orphans** | `moodState`, `playerDialogueProfile`, `coreInvariants`, `safetyAudit` — zero live imports |
| **Docs** | CURRICULUM / PROGRESSION / EVIDENCE guides |
| **Memory** | `curriculum-memory.json`, `progression-memory.json` |

## Kept (parked, may still matter later)

Combat bodyguard, nether prep, villagers, blueprints, gear/enchant/brew, farming, exploration — these can become real co-op skills without the curriculum/progression OS.

## Live behavior

Chat commands that used to hit curriculum/progression now answer with a short **retired** message pointing at companion play.

## Second pass (command surface)

Also stripped from the live tree:

- **~30+ commandRegistry entries** (curriculum / progression / milestones)
- **chat.js** handlers and parsers for those phrases
- **commandParser** aliases / command lists
- **createActions** wiring to retired action domains
- **shared.js** evidence maps for those actions
- Natural map: “what should we do next” → `tj help` (not milestones)

Tiny root stubs remain only so the dashboard can still import without crashing.
