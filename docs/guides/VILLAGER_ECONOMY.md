# Villager trading and economy

The parked villager domain contains scanning, village memory, trade inspection, trade scoring, emerald budgeting, and confirmation-gated trade execution.

## Safety Model

- Only the configured owner can request villager actions.
- Trade execution requires confirmation.
- tj does not attack villagers, baby villagers, named villagers, or iron golems.
- tj does not loot villages by default.
- tj does not transport, breed, cure, or build trading halls yet.
- The LLM may explain trade choices, but it cannot choose or execute trades.

## What Works

- Scan nearby villagers and infer visible professions when possible.
- Remember villages, villagers, and valuable villager positions.
- Inspect trades through Mineflayer `openVillager`/`trade` APIs when a villager is nearby.
- Score trades for useful books, gear, food, emerald earning, and risky costs.
- Track emerald reserve and trade history in `villager-memory.json`.
- Connect villager evidence to skills and dashboard summaries.

## Known Caveats

- Villager profession data depends on what Mineflayer exposes for Minecraft `1.21.11`.
- Enchanted book details may be unclear if NBT is not exposed cleanly; tj marks unknown books cautiously.
- Trade execution depends on the installed Mineflayer villager window API working with the local Paper server.
- Village detection is evidence-based from nearby villagers, beds, bells, job sites, and golems. It does not use cheats like `/locate`.

## Commands

```text
tj villager status
tj scan villagers
tj village status
tj known villages
tj known villagers
tj trading status
tj inspect trades
tj best trades
tj economy status
tj suggest trades
tj buy trade 1
tj confirm trade
tj find librarian
tj find mending trade
tj village safety
tj protect villagers
```

## Evidence

Villager economy evidence includes:

- `village_found`
- `villager_seen`
- `villager_profession_recorded`
- `villager_trade_inspected`
- `trade_options_reported`
- `emerald_count_reported`
- `trade_completed`
- `valuable_trade_found`
- `librarian_found`
- `mending_trade_found`
- `villager_memory_updated`
- `villager_protected_reported`

Trade completion needs deterministic action results and economy/history records. Ollama output never counts as evidence.

## Validation

```powershell
Set-Location .\bot
npm run villager:audit
npm run test:villagers
```
