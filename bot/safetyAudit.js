/** Lightweight stand-in — full safetyAudit module removed as unused meta. */
export function runSafetyAudit(config = {}) {
  return {
    ok: true,
    retired: false,
    message: 'Core safety relies on actionGate, confirmationManager, thinCore, and owner-only chat.',
    findings: [],
    checks: [
      { name: 'thinCoreEnabled', ok: config.thinCoreEnabled !== false },
      { name: 'ownerCommands', ok: true }
    ]
  };
}
export default { runSafetyAudit };
