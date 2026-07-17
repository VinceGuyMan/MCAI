import { getBlueprintBlockCount, getBlueprintDimensions, getBlueprintMaterialList } from './blueprintRegistry.js';

function materialText(materials = {}, limit = 8) {
  const entries = Object.entries(materials).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return 'none';
  const shown = entries.slice(0, limit).map(([name, count]) => `${count} ${name}`);
  if (entries.length > limit) shown.push(`+${entries.length - limit} more`);
  return shown.join(', ');
}

export function generateTextPreview(blueprint) {
  if (!blueprint) return 'Unknown blueprint.';
  const dimensions = getBlueprintDimensions(blueprint);
  return `${blueprint.name}: ${blueprint.description} Size ${dimensions.width}x${dimensions.length}x${dimensions.height}, ${getBlueprintBlockCount(blueprint)} blocks, risk ${blueprint.riskLevel}.`;
}

export function generateMaterialPreview(blueprint, materialStatus = null) {
  const required = materialStatus?.required || getBlueprintMaterialList(blueprint);
  const missing = materialStatus?.missing || {};
  const base = `Required: ${materialText(required)}.`;
  if (!Object.keys(missing).length) return `${base} Materials look available.`;
  return `${base} Missing: ${materialText(missing)}.`;
}

export function generatePlacementPreview(plan) {
  if (!plan) return 'No plan.';
  return `${plan.blueprint.name} at ${plan.origin.x},${plan.origin.y},${plan.origin.z}, rotation ${plan.rotation}, ${plan.blocks.length} placements.`;
}

export function generateBuildAreaSummary(plan) {
  if (!plan) return 'No area selected.';
  const xs = plan.blocks.map((entry) => entry.position.x);
  const ys = plan.blocks.map((entry) => entry.position.y);
  const zs = plan.blocks.map((entry) => entry.position.z);
  return `Area: x ${Math.min(...xs)}..${Math.max(...xs)}, y ${Math.min(...ys)}..${Math.max(...ys)}, z ${Math.min(...zs)}..${Math.max(...zs)}.`;
}

export function generateChatPreview(plan) {
  if (!plan) return 'No blueprint plan.';
  return `Blueprint: ${plan.blueprint.name}. Blocks: ${plan.blocks.length}. ${generateBuildAreaSummary(plan)} Say "tj confirm build" to approve.`;
}

export function generateDashboardPreview(plan) {
  if (!plan) return null;
  return {
    blueprintId: plan.blueprintId,
    name: plan.blueprint.name,
    description: plan.blueprint.description,
    origin: plan.origin,
    rotation: plan.rotation,
    blockCount: plan.blocks.length,
    area: generateBuildAreaSummary(plan),
    materials: plan.materials?.required || {}
  };
}

