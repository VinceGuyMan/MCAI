const TEST_PLANS = {
  natural_commands: [
    'Say: tj we need food. Expected: routes to get food or starts food helper.',
    'Say: tj make us safer. Expected: asks whether to light home, build shelter, or protect you.',
    'Answer: light home. Expected: runs light home and remembers the mapping.',
    'Say: tj find mending. Expected: routes to villager trade search/status, not raw trading.'
  ],
  core_helper: [
    'Run: tj status.',
    'Run: tj inventory.',
    'Run: tj get wood 8.',
    'Run: tj make pickaxe. Expected: craft or list missing materials and offer a scavenge option.',
    'Run: tj stop. Expected: cancels all active work.'
  ],
  survival_basics: [
    'Run: tj food status.',
    'Run: tj get food.',
    'Run: tj craft torches. If coal is missing, tj should explain and suggest mining coal.',
    'Run: tj prepare for night.'
  ]
};

function planFor(name = 'all') {
  const key = String(name || 'all').replace(/\s+/g, '_');
  if (key === 'all' || key === 'test_plan') {
    return Object.entries(TEST_PLANS).flatMap(([section, steps]) => [`[${section}]`, ...steps]);
  }
  return TEST_PLANS[key] || [];
}

export function getTestPlan(name = 'all') {
  const steps = planFor(name);
  if (!steps.length) return { ok: false, reason: `Unknown test plan: ${name}`, steps: [] };
  return { ok: true, name, steps };
}

export function getNaturalCommandTestPlan() {
  return getTestPlan('natural_commands');
}

export function getCoreHelperTestPlan() {
  return getTestPlan('core_helper');
}

export function getSurvivalBasicsTestPlan() {
  return getTestPlan('survival_basics');
}

export function getTestReport() {
  return {
    ok: true,
    message: 'Manual test plans are ready. Run them in Minecraft and use competency reports to see what remains shaky.',
    plans: Object.keys(TEST_PLANS),
    totalSteps: Object.values(TEST_PLANS).reduce((sum, steps) => sum + steps.length, 0)
  };
}

