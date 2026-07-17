import * as mapMemoryStore from '../../mapMemory.js';

export const rememberNetherPortal = mapMemoryStore.rememberNetherPortal;
export const rememberOverworldPortal = mapMemoryStore.rememberOverworldPortal;
export const addNetherDanger = mapMemoryStore.addNetherDanger;
export const addNetherEntryRecord = mapMemoryStore.addNetherEntryRecord;
export const getKnownNetherPortal = mapMemoryStore.getKnownNetherPortal;
export const getKnownOverworldPortal = mapMemoryStore.getKnownOverworldPortal;
export const summarizeNetherMemory = mapMemoryStore.summarizeNetherMemory;

export function netherMemoryStatus(mapMemory) {
  const summary = mapMemoryStore.summarizeNetherMemory(mapMemory);
  return {
    ok: true,
    summary,
    message: `Nether memory: ${summary.overworldPortals} Overworld portal(s), ${summary.netherPortals} Nether portal(s), ${summary.netherDangers} danger zone(s), ${summary.entries} entry record(s).`
  };
}
