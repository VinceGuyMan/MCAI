# actions/ — split action runtime

| File | Role |
|------|------|
| `../actions.js` | Stable public entry (re-exports) |
| `shared.js` | Count helpers, evidence maps |
| `lazyTier2.js` | Dynamic import of `systems/*` when flags allow |
| `createActions.js` | Main action runtime (was monolithic actions.js) |
| `domains/` | Future extractions of handler groups |

Tier-2 physical modules live in `../systems/<domain>/` with shims at the old `bot/*.js` paths.
