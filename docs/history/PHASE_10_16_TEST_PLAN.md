# Phase 10-16 Manual Test Plan

This plan verifies the existing Phase 10-16 systems on the local Paper server. It is intentionally manual for gameplay behavior and emergency-stop timing; automated tests cover pure logic only.

## Startup

1. Start Ollama locally.
2. Confirm local Ollama role models are available: `qwen3:14b`, `mistral-nemo:12b`, `qwen2.5-coder:14b`, and fallback `phi4-mini:latest`.
3. Start the local Paper server.
4. Start tj from `E:\Games\MCAI\bot`:

   ```powershell
   npm start
   ```

5. Join Minecraft 1.21.11 as ModVinny.
6. Confirm tj joins as `tj`.
7. Run:

   ```text
   tj status
   ```

Expected:

- tj responds only to ModVinny.
- Health/food/position are reported.
- No OpenAI/cloud calls are required.

## Phase 10: Skills, Evidence, Curriculum

Run:

```text
tj skills
tj skill audit
tj run skill status
tj evidence status
tj recent evidence
tj suggest next skill
tj approve survival basics
tj run approved curriculum step
tj curriculum progress
tj stop
```

Expected:

- Skill/evidence commands respond.
- `tj run skill status` records evidence.
- Suggestions do not execute automatically.
- Approved curriculum runs one low-risk step at a time.
- `tj stop` cancels active skill/curriculum work.

## Phase 11: Dashboard

1. Open:

   ```text
   http://127.0.0.1:8787
   ```

2. Verify status panels:

- bot status
- owner status
- safety
- task
- active skill
- active curriculum
- active goal
- inventory
- evidence
- logs

3. Try a POST control without token.
4. Try the STOP button with the configured local token.

Expected:

- Dashboard is local-only.
- POST control requires token.
- Secrets/tokens are not visible in JSON output.
- STOP triggers cancellation.
- Dashboard failure does not stop the bot.

## Phase 12: Progression

Run:

```text
tj progression status
tj next milestone
tj milestones
tj completed milestones
tj blocked milestones
tj explain milestone mining_readiness
tj path safe survival
tj path nether prep
tj achievements
```

Expected:

- Progression reports custom milestone state.
- Next milestone suggestions prefer safe/implemented work.
- Nether/End/boss progression remains blocked unless prerequisites and confirmations exist.
- Vanilla advancement bridge reports best-effort/optional status.

## Phase 13: Gear Upgrades

Run:

```text
tj gear status
tj enchanting status
tj enchant options
tj anvil status
tj potion status
tj brewing status
tj nether gear readiness
```

Optional local setup:

```text
/give tj lapis_lazuli 16
/give tj iron_pickaxe 1
/give tj iron_sword 1
```

Mutation checks:

```text
tj enchant held item
tj confirm enchant
tj repair pickaxe
tj confirm anvil
tj potion status
tj brewing status
tj stop
```

Expected:

- Status commands work without consuming resources.
- Mutating enchant/anvil/potion/brewing paths require confirmation.
- Brewing reports unsupported/scaffolded if reliable API support is unavailable.
- Diamond/netherite/rare book use requires stronger confirmation.
- `tj stop` cancels active gear work.

## Phase 14: Villagers And Economy

Near villagers, run:

```text
tj villager status
tj scan villagers
tj nearby villagers
tj trading status
tj economy status
tj inspect trades
tj best trades
tj find librarian
tj find mending trade
tj trade history
```

Trade mutation check:

```text
tj buy trade 1
tj confirm trade
tj stop
```

Expected:

- Villager scanning handles no-villager and nearby-villager cases.
- Trade inspection works if Mineflayer API supports it, or fails honestly.
- Trade execution requires confirmation.
- Emerald reserve is enforced.
- Villagers and iron golems are protected.
- `tj stop` cancels trading/villager work.

## Phase 15: Blueprints

Run:

```text
tj blueprints
tj blueprint status
tj schematic status
tj preview small shelter
tj materials for small shelter
tj plan build small shelter
```

Small build check:

```text
tj build starter workstation
tj confirm build
tj blueprint progress
tj pause build
tj resume build
tj continue build
tj stop
```

Expected:

- Built-in blueprints list and preview.
- Material estimates report missing items.
- Build execution requires confirmation.
- Builds are capped and cancellable.
- Dangerous blocks and oversized builds are refused.
- Schematic import remains disabled unless explicitly enabled and supported.

## Phase 16: Server Plugin Bridge

Without plugin installed, run:

```text
tj bridge status
tj bridge health
tj recent server events
tj protected regions
```

Expected:

- tj reports the bridge as unavailable or not connected.
- Bot continues working normally.

With plugin installed:

```text
tj bridge status
tj server status
tj recent server events
tj recent deaths
tj recent advancements
tj bridge regions
tj register home region
tj protected regions
tj bridge emergency stop
```

Expected:

- Bridge status reports connected.
- Recent server events are summarized.
- Home region registration requires confirmation/tokened bridge access.
- Emergency stop triggers local cancellation.
- No raw server command, teleport, give, or WorldEdit control exists.

## Emergency Stop Regression

For each long-running operation that is safe to start locally:

1. Start the operation.
2. Immediately run:

   ```text
   tj stop
   ```

3. Verify movement/action stops and state reports cancelled/paused.

Cover at least:

- active skill
- active curriculum step
- gear mutation attempt
- villager trade inspection/execution attempt
- blueprint build
- dashboard stop button
- bridge emergency stop if plugin is installed

Expected:

- tj stops promptly.
- Memory/evidence records cancellation or pause.
- No task continues in the background.

## Automated Regression Commands

From `E:\Games\MCAI\bot`:

```powershell
npm run test:phase10-16
npm run audit:phase10-16
npm run check
```

Expected:

- All commands exit `0`.
- Any missing optional bridge/plugin runtime is reported honestly and does not crash tj.
