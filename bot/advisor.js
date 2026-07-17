function suggestion(templateName, name, reason, priority = 'normal') {
  return { templateName, name, reason, priority };
}

export function getSurvivalNeeds(perception = {}) {
  const needs = [];
  if (perception.needsFood || perception.criticalFood || perception.food < 14) needs.push('food');
  if (perception.needsArmor || (perception.armorScore || 0) < 4) needs.push('armour');
  if (perception.hostileNearby || perception.threatCount > 0) needs.push('safety');
  return needs;
}

export function getBaseNeeds(perception = {}) {
  const needs = [];
  if (!perception.hasHome) needs.push('home');
  if (perception.needsStorage || !perception.hasStorage) needs.push('storage');
  if (perception.needsShelter || !perception.hasShelter) needs.push('shelter');
  if (perception.needsBaseLighting || !perception.hasTorches) needs.push('lighting');
  return needs;
}

export function getResourceNeeds(perception = {}) {
  const needs = [];
  if (perception.needsWood) needs.push('wood');
  if (perception.needsStone) needs.push('stone');
  if (perception.needsCoal || perception.needsTorches) needs.push('coal');
  if (perception.needsTools || perception.needsMiningSupplies) needs.push('tools');
  return needs;
}

export function getSafetyNeeds(perception = {}) {
  const needs = [];
  if (perception.hostileNearby) needs.push('threats');
  if (perception.lavaNearby || perception.fireNearby || perception.fallRisk) needs.push('hazards');
  if (perception.nightUnsafe) needs.push('night safety');
  return needs;
}

export function rankGoalSuggestions(suggestions) {
  const weight = { urgent: 4, high: 3, normal: 2, low: 1 };
  return suggestions.sort((a, b) => (weight[b.priority] || 0) - (weight[a.priority] || 0));
}

export function explainSuggestion(item) {
  return `${item.name}: ${item.reason}`;
}

export function suggestNextGoals(_bot, memory, perception = {}, goals = {}) {
  const activeCount = (goals.activeGoals || []).filter((goal) => ['active', 'pending_approval', 'paused', 'blocked'].includes(goal.status)).length;
  const suggestions = [];
  if (activeCount > 0) return [];

  const survivalNeeds = getSurvivalNeeds(perception);
  const baseNeeds = getBaseNeeds(perception);
  const resourceNeeds = getResourceNeeds(perception);
  const safetyNeeds = getSafetyNeeds(perception);

  if (survivalNeeds.includes('food') || !perception.hasFoodSource) {
    suggestions.push(suggestion('food_security', 'Build Food Security', 'Food looks fragile or low.', 'urgent'));
  }
  if (safetyNeeds.length || perception.needsBaseLighting || perception.threatCount > 0) {
    suggestions.push(suggestion('secure_base', 'Secure Base', 'Lighting and threat checks would make the area safer.', 'high'));
  }
  if (baseNeeds.includes('storage') || baseNeeds.includes('shelter')) {
    suggestions.push(suggestion('improve_base', 'Improve Base', `Base needs: ${baseNeeds.join(', ')}.`, 'high'));
  }
  if (resourceNeeds.length) {
    suggestions.push(suggestion('stockpile_resources', 'Stockpile Resources', `Missing useful resources: ${resourceNeeds.join(', ')}.`, 'normal'));
  }
  if (!perception.hasIronGear && perception.hasMiningSupplies) {
    suggestions.push(suggestion('get_iron_gear', 'Get Iron Gear', 'Iron gear would improve survival and mining.', 'normal'));
  }
  if (!perception.hasMiningSupplies || perception.needsTools || perception.needsTorches) {
    suggestions.push(suggestion('prepare_for_mining', 'Prepare for Mining', 'Mining prep should come before resource runs.', 'normal'));
  }
  if (!suggestions.length && memory.get().homeBasePosition) {
    suggestions.push(suggestion('prepare_for_night', 'Prepare for Night', 'A quick safety check is a good default next move.', 'low'));
  }

  return rankGoalSuggestions(suggestions).slice(0, 3);
}
