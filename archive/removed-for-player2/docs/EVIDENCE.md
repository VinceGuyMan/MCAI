# Evidence Tracking

Phase 10, Milestone 3 adds a deterministic proof layer for tj's skill runner. Evidence is used to decide whether a skill succeeded, failed, partially succeeded, or only produced a report.

Ollama does not create or verify evidence. Dialogue can explain evidence later, but it cannot mark a skill complete.

## Evidence Record

```json
{
  "name": "status_reported",
  "status": "verified",
  "category": "status",
  "source": "action_result",
  "confidence": "high",
  "details": {
    "message": "Status action returned data."
  },
  "createdAt": 0
}
```

## Statuses

- `verified`: confirmed from action result or snapshot.
- `reported`: action succeeded, but no deeper world-state proof exists.
- `partial`: some proof exists, but not enough for full success.
- `failed`: required proof is missing or contradicted.
- `unknown`: verifier cannot tell.
- `skipped`: evidence is future or not applicable.

## Confidence

- `high`: direct action result, runner state, or clear snapshot.
- `medium`: inferred from a safe local snapshot.
- `low`: normalized or weak evidence.

## Snapshots

`bot/progressEvidence.js` captures lightweight before/after snapshots:

- position and dimension
- health and food
- inventory item counts and free slots
- home existence and distance
- current task name
- farm/storage counts from memory
- active goal id

Snapshots are not written to disk by default and do not include secrets, config keys, local paths, or huge logs.

## Starter Evidence

Milestone 3 verifies evidence for safe status/reporting skills:

- `status_reported`
- `inventory_reported`
- `inventory_snapshot_captured`
- `home_status_reported`
- `mining_status_reported`
- `farming_status_reported`
- `nether_checklist_reported`
- `skills_status_reported`
- optional status skills such as `food_status_reported`, `armor_status_reported`, `storage_status_reported`, `map_status_reported`, `goals_status_reported`, and `combat_status_reported`

For these skills, evidence usually means the deterministic action returned an evidence-friendly result. This is intentionally modest proof, not magic world understanding.

## Future Evidence

Future evidence definitions exist for action-heavy skills but are marked as future verification. Examples:

- `item_count_increased`
- `position_changed`
- `returned_home`
- `block_mined`
- `block_placed`
- `entity_defeated`
- `crop_harvested`
- `chest_deposited_items`
- `portal_remembered`
- `waypoint_created`

These are not enabled for risky/action-heavy runner execution yet.

## Skill Runner Flow

```text
chat.js / commandRegistry.js
-> skillRunner.js
-> skillValidator.js
-> actions.js
-> deterministic modules
-> progressEvidence.js
-> skillMemory.js
```

The runner captures a before snapshot, calls `actions.executeAction`, captures an after snapshot, verifies evidence, then records the result in `skill-memory.json`.

## Skill Memory

`skill-memory.json` stores:

- success, partial, and failure counts
- last evidence records
- evidence summaries
- recent runs
- common failure reasons
- aggregate evidence stats

Recent runs are capped so the file does not grow endlessly.

## Commands

```text
tj evidence status
tj evidence audit
tj evidence definitions
tj recent evidence
tj skill evidence status
tj verify skill status
tj verify skill nether checklist
```

## Tests

From `bot/`:

```powershell
npm run evidence:audit
npm run test:evidence
```

## Caveats

Most Milestone 3 runnable skills are status/reporting skills. Evidence for mining, building, farming creation, storage movement, combat, portal entry, and exploration travel will need stronger physical proofs in later milestones.
