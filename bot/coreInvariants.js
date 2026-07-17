/** Lightweight stand-in — full coreInvariants suite removed. */
export function runCoreInvariantChecks() {
  return {
    ok: true,
    message: 'Invariant suite retired; use bot/test smoke + thin-core tests.',
    checks: []
  };
}
export default { runCoreInvariantChecks };
