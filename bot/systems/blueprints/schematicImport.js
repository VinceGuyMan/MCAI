import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, loadConfig } from '../../config.js';
import { validateBlueprint } from './blueprintRegistry.js';

const schematicsDir = path.join(projectRoot, 'schematics');

function safePath(filePath) {
  const resolved = path.resolve(schematicsDir, filePath || '');
  if (!resolved.startsWith(path.resolve(schematicsDir))) {
    const error = new Error('Schematic path must stay inside the project schematics folder.');
    error.code = 'SCHEMATIC_PATH_BLOCKED';
    throw error;
  }
  return resolved;
}

export function schematicImportStatus() {
  const config = loadConfig();
  return {
    enabled: Boolean(config.schematicImportEnabled && config.allowImportedSchematics),
    supported: false,
    directory: 'schematics',
    reason: 'Imported schematic parsing is scaffolded but disabled until a safe parser is added and tested.'
  };
}

export function supportedSchematicFormats() {
  return [];
}

export function explainSchematicLimitations() {
  return 'Schematic import is disabled in Phase 15. Built-in deterministic blueprints are supported; imported .schem files need a verified safe parser first.';
}

export function sanitizeImportedBlueprint(blueprint) {
  return {
    ...blueprint,
    id: String(blueprint?.id || '').replace(/[^a-z0-9_:-]/gi, '_').toLowerCase(),
    name: String(blueprint?.name || 'Imported Blueprint').slice(0, 80),
    blocks: Array.isArray(blueprint?.blocks) ? blueprint.blocks.slice(0, loadConfig().maxBlueprintBlocks || 256) : []
  };
}

export function validateImportedSchematic(blueprint) {
  const sanitized = sanitizeImportedBlueprint(blueprint);
  return validateBlueprint(sanitized);
}

export function parseSchematicToBlueprint(parsed) {
  return sanitizeImportedBlueprint(parsed);
}

export function importSchematic(filePath, options = {}) {
  const config = loadConfig();
  try {
    if (filePath) safePath(filePath);
  } catch (error) {
    return { ok: false, reason: error.message, evidence: ['schematic_import_unsupported'] };
  }
  if (!config.schematicImportEnabled || !config.allowImportedSchematics) {
    return { ok: false, reason: explainSchematicLimitations(), evidence: ['schematic_import_unsupported'] };
  }
  const resolved = safePath(filePath);
  if (!fs.existsSync(resolved)) return { ok: false, reason: 'Schematic file was not found in the schematics folder.' };
  return { ok: false, reason: 'No safe schematic parser is installed or enabled.', evidence: ['schematic_import_unsupported'] };
}
