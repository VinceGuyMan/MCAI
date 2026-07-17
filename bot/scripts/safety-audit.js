import { runSafetyAudit } from '../safetyAudit.js';

const result = runSafetyAudit();
for (const check of result.checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.section}:${check.name}${check.details ? ` - ${check.details}` : ''}`);
}

if (!result.ok) process.exitCode = 1;
