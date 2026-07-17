import { loadProgressionState, saveProgressionState } from './progressionState.js';

const advancementMap = [
  [/minecraft:story\/root|minecraft/i, 'connect_bot'],
  [/minecraft:story\/mine_stone|stone age/i, 'gather_stone'],
  [/minecraft:story\/upgrade_tools|get an upgrade/i, 'craft_basic_tools'],
  [/minecraft:story\/smelt_iron|acquire hardware/i, 'smelt_iron'],
  [/minecraft:story\/iron_tools|isn'?t it iron pick/i, 'craft_iron_tools'],
  [/minecraft:nether\/root|we need to go deeper/i, 'safe_nether_entry_confirmed']
];

export function vanillaAdvancementTrackingAvailable(bot) {
  return Boolean(bot?.supportFeature || bot?._client);
}

export function getKnownVanillaAdvancements(bot) {
  return {
    available: vanillaAdvancementTrackingAvailable(bot),
    advancements: [],
    note: 'Mineflayer does not expose a stable full advancement list for this local bot. Custom progression milestones are primary.'
  };
}

export function detectAdvancementMessages(bot, message) {
  const text = String(message || '');
  if (!/advancement|has made the advancement|goal reached|challenge complete/i.test(text)) return null;
  const milestoneId = mapVanillaAdvancementToMilestone(text);
  return {
    text,
    milestoneId,
    detectedAt: Date.now(),
    confidence: milestoneId ? 'medium' : 'low'
  };
}

export function mapVanillaAdvancementToMilestone(advancementIdOrText) {
  const text = String(advancementIdOrText || '').toLowerCase();
  for (const [pattern, milestoneId] of advancementMap) {
    if (pattern.test(text)) return milestoneId;
  }
  return null;
}

export function recordVanillaAdvancement(stateOrNull, advancement) {
  const state = stateOrNull || loadProgressionState();
  const record = {
    id: advancement?.id || advancement?.text || `vanilla_${Date.now()}`,
    text: advancement?.text || '',
    milestoneId: advancement?.milestoneId || mapVanillaAdvancementToMilestone(advancement?.id || advancement?.text),
    detectedAt: advancement?.detectedAt || Date.now(),
    confidence: advancement?.confidence || 'low'
  };
  state.vanillaAdvancements = [record, ...(state.vanillaAdvancements || [])].slice(0, 100);
  return saveProgressionState(state);
}

export function getVanillaAdvancementStatus(state = loadProgressionState()) {
  return {
    available: false,
    recordedCount: state.vanillaAdvancements?.length || 0,
    recent: (state.vanillaAdvancements || []).slice(0, 5),
    note: explainVanillaTrackingLimits()
  };
}

export function explainVanillaTrackingLimits() {
  return 'Vanilla advancement tracking is best-effort only. tj uses custom evidence-based milestones first and does not require operator commands.';
}

