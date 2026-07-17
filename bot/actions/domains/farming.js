/**
 * Farming + animal pen handlers.
 */
import * as farming from '../../farming.js';
import * as animalPens from '../../animalPens.js';
import * as animalCare from '../../animalCare.js';
import * as farmStorage from '../../farmStorage.js';

export function createFarmingHandlers(ctx) {
  const {
    bot,
    config,
    memory,
    setupMovements,
    say,
    throwIfCancelled,
    resourceOptions,
    syncWaypoint,
    stop
  } = ctx;

  async function farmingStatusAction() {
    const text = farming.farmingStatusText(bot, memory);
    say(text, true);
    return farming.farmingStatus(bot, memory);
  }

  async function createFarmAction(cropType = 'wheat', options = {}) {
    throwIfCancelled();
    setupMovements();
    const result = await farming.createSmallFarm(bot, memory, resourceOptions({ cropType, ...options }));
    if (result.requiresConfirmation) {
      memory.update({ pendingFarmConfirmation: { action: 'large_farm', cropType, expiresAt: Date.now() + 60000 } });
    }
    if (result.ok && result.farm?.center) syncWaypoint(`${result.farm.cropType || cropType} farm`, 'farm', result.farm.center, 'Registered crop farm.', ['base', 'farm']);
    say(result.message, true);
    return result;
  }

  async function maintainFarmAction(options = {}) {
    throwIfCancelled();
    setupMovements();
    const result = await farming.maintainFarm(bot, memory, resourceOptions(options));
    say(result.message, true);
    return result;
  }

  async function harvestCropsAction() {
    throwIfCancelled();
    const result = await farming.harvestMatureCrops(bot, memory, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function replantCropsAction() {
    throwIfCancelled();
    const result = await farming.replantCrops(bot, memory, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function plantCropAction(cropType = 'wheat') {
    throwIfCancelled();
    const farm = await farming.findOrCreateFarm(bot, memory, resourceOptions({ cropType }));
    const result = farm.ok && farm.farm
      ? await farming.plantCrop(bot, memory, cropType, resourceOptions({ farm: farm.farm }))
      : farm;
    say(result.message, true);
    return result;
  }

  async function animalPenStatusAction() {
    const text = animalPens.animalPenStatusText(bot, memory);
    say(text, true);
    return animalPens.animalPenStatus(bot, memory);
  }

  async function createAnimalPenAction(animalType = 'cow') {
    throwIfCancelled();
    setupMovements();
    const result = await animalPens.createAnimalPen(bot, memory, animalType, resourceOptions({ animalType }));
    if (result.ok && result.pen?.center) syncWaypoint(`${animalType} pen`, 'pen', result.pen.center, `Registered ${animalType} animal pen.`, ['base', 'pen']);
    say(result.message, true);
    return result;
  }

  async function lureAnimalToPenAction(animalType = 'cow') {
    throwIfCancelled();
    setupMovements();
    memory.update({ animalTaskActive: true });
    const result = await animalCare.lureAnimalToPen(bot, memory, animalType, resourceOptions({ animalType }));
    memory.update({ animalTaskActive: false });
    say(result.message, true);
    return result;
  }

  async function breedAnimalsAction(animalType = 'cow') {
    throwIfCancelled();
    const result = await animalCare.breedAnimalsInPen(bot, memory, animalType, resourceOptions({ animalType, direct: true }));
    say(result.message, true);
    return result;
  }

  async function feedAnimalsAction(animalType = 'cow') {
    throwIfCancelled();
    const result = await animalCare.feedAnimalsInPen(bot, memory, animalType, resourceOptions({ animalType, direct: true }));
    say(result.message, true);
    return result;
  }

  async function collectEggsAction() {
    throwIfCancelled();
    const result = await animalCare.collectEggs(bot, memory, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function shearSheepAction() {
    throwIfCancelled();
    const result = await animalCare.shearSheep(bot, memory, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function milkCowAction() {
    throwIfCancelled();
    const result = await animalCare.milkCow(bot, memory, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function farmStorageStatusAction() {
    const summary = farmStorage.getFarmInventorySummary(bot);
    const text = Object.keys(summary).length ? Object.entries(summary).map(([name, count]) => `${name} ${count}`).join(', ') : 'no farm items';
    say(`Farm storage status: ${text}.`, true);
    return summary;
  }

  async function storeFarmItemsAction() {
    throwIfCancelled();
    const result = await farmStorage.storeFarmItems(bot, memory, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function stopFarmingAction() {
    memory.update({ farmTaskActive: false });
    return stop();
  }

  async function stopAnimalTaskAction() {
    memory.update({ animalTaskActive: false });
    return stop();
  }


  return {
    farmingStatusAction,
    createFarmAction,
    maintainFarmAction,
    harvestCropsAction,
    replantCropsAction,
    plantCropAction,
    animalPenStatusAction,
    createAnimalPenAction,
    lureAnimalToPenAction,
    breedAnimalsAction,
    feedAnimalsAction,
    collectEggsAction,
    shearSheepAction,
    milkCowAction,
    farmStorageStatusAction,
    storeFarmItemsAction,
    stopFarmingAction,
    stopAnimalTaskAction
  };
}
