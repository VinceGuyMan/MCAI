/**
 * Map memory helpers shared by exploration, base, and nether handlers.
 */
import * as mapMemoryStore from '../../mapMemory.js';

export function createMapHelpers({ bot, config }) {
  function currentDimension() {
    return bot.game?.dimension || bot.game?.dimensionName || 'overworld';
  }

  function loadMapMemory() {
    return mapMemoryStore.loadMapMemory();
  }

  function saveMapMemory(mapMemory) {
    return mapMemoryStore.saveMapMemory(mapMemory);
  }

  function syncWaypoint(name, type, position, notes = '', tags = []) {
    if (!config.mapMemoryEnabled || !position) return null;
    const mapMemory = loadMapMemory();
    const record = mapMemoryStore.addWaypoint(mapMemory, {
      name,
      type,
      dimension: currentDimension(),
      position,
      createdBy: 'tj',
      notes,
      tags
    });
    saveMapMemory(mapMemory);
    return record;
  }


  return {
    currentDimension,
    loadMapMemory,
    saveMapMemory,
    syncWaypoint
  };
}
