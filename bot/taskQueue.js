const taskDefinitions = {
  getFood: [
    'checkHunger',
    'checkInventoryFood',
    'cookRawFoodIfPossible',
    'findNearbyFoodSource',
    'gatherPlantFoodIfSafe',
    'huntPassiveAnimalIfNeeded',
    'collectDrops',
    'cookRawFoodIfPossible',
    'returnNearOwner',
    'reportFoodResult'
  ],
  cookFood: [
    'findOrPlaceFurnace',
    'findFuel',
    'putRawFoodInFurnace',
    'putFuelInFurnace',
    'waitForFoodOutput',
    'takeCookedFood',
    'eatIfHungryAndFoodExists'
  ],
  createFarm: [
    'chooseFarmSpot',
    'tillFarmSoil',
    'plantFarmCrop',
    'placeFarmTorches',
    'registerFarm',
    'reportFarmResult'
  ],
  maintainFarm: [
    'scanRegisteredFarm',
    'harvestMatureCrops',
    'collectDrops',
    'replantFarmCrops',
    'storeFarmOutput',
    'reportFarmResult'
  ],
  createAnimalPen: [
    'choosePenSpot',
    'craftPenSupplies',
    'buildAnimalPen',
    'registerAnimalPen',
    'reportAnimalResult'
  ],
  lureAnimal: [
    'findAnimal',
    'equipAnimalFood',
    'openPenGate',
    'lureAnimalIntoPen',
    'closePenGate',
    'reportAnimalResult'
  ],
  breedAnimals: [
    'checkAnimalCount',
    'checkAnimalFood',
    'feedTwoAnimals',
    'reportAnimalResult'
  ],
  prepareForCombat: [
    'prepareForCombat',
    'combatRecovery'
  ],
  defendSelf: [
    'prepareForCombat',
    'defendSelf',
    'combatRecovery'
  ],
  defendOwner: [
    'prepareForCombat',
    'defendOwner',
    'combatRecovery'
  ],
  guardBase: [
    'prepareForCombat',
    'guardBase',
    'combatRecovery'
  ],
  engageThreat: [
    'prepareForCombat',
    'engageThreat',
    'combatRecovery'
  ],
  fleeThreat: [
    'fleeThreat',
    'combatRecovery'
  ],
  returnAfterCombat: [
    'returnAfterCombat',
    'combatRecovery'
  ]
};

export function createTaskQueue(memory) {
  function isValidTask(task) {
    return Boolean(task) &&
      typeof task === 'object' &&
      typeof task.name === 'string' &&
      Array.isArray(task.steps) &&
      Number.isInteger(task.stepIndex);
  }

  let currentTask = memory.get().currentTask || null;
  if (currentTask && !isValidTask(currentTask)) {
    console.warn('[taskQueue] clearing malformed persisted task');
    currentTask = null;
    memory.set('currentTask', null);
  }

  function persist() {
    memory.set('currentTask', currentTask);
  }

  function setTask(name, steps, meta = {}) {
    currentTask = {
      name,
      steps,
      stepIndex: 0,
      meta,
      goalId: meta.goalId || null,
      stepId: meta.stepId || null,
      createdByPlanner: Boolean(meta.createdByPlanner),
      canPause: meta.canPause !== false,
      canResume: Boolean(meta.canResume),
      riskLevel: meta.riskLevel || 'low',
      paused: false,
      pausedReason: null,
      startedAt: Date.now(),
      failures: []
    };
    persist();
    return currentTask;
  }

  function setNamedTask(name, meta = {}) {
    const steps = taskDefinitions[name];
    if (!steps) throw new Error(`unknown task definition: ${name}`);
    return setTask(name, steps, meta);
  }

  function clearTask() {
    currentTask = null;
    persist();
  }

  function getCurrentTask() {
    return currentTask;
  }

  function setGoalTask(goalId, stepId, task) {
    const steps = task?.steps || [task?.name || stepId || 'goalStep'];
    return setTask(task?.name || 'goalTask', steps, {
      ...(task?.meta || {}),
      goalId,
      stepId,
      createdByPlanner: true,
      canPause: task?.canPause !== false,
      canResume: Boolean(task?.canResume),
      riskLevel: task?.riskLevel || 'low'
    });
  }

  function clearGoalTask(goalId, reason = 'cleared') {
    if (currentTask?.goalId === goalId) {
      currentTask.failures.push({ reason, at: Date.now() });
      clearTask();
      return true;
    }
    return false;
  }

  function pauseGoalTask(goalId, reason = 'paused') {
    if (currentTask?.goalId !== goalId) return false;
    currentTask.paused = true;
    currentTask.pausedReason = reason;
    persist();
    return true;
  }

  function resumeGoalTask(goalId) {
    if (currentTask?.goalId !== goalId) return false;
    currentTask.paused = false;
    currentTask.pausedReason = null;
    persist();
    return true;
  }

  function getTaskForGoal(goalId) {
    return currentTask?.goalId === goalId ? currentTask : null;
  }

  function isGoalTaskRunning(goalId) {
    return Boolean(currentTask?.goalId === goalId && !currentTask.paused);
  }

  function markStepFailed(reason) {
    if (!currentTask) return;
    currentTask.failures.push({ step: currentTask.steps[currentTask.stepIndex], reason, at: Date.now() });
    persist();
  }

  function markStepDone() {
    if (!currentTask) return;
    currentTask.stepIndex += 1;
    if (currentTask.stepIndex >= currentTask.steps.length) clearTask();
    else persist();
  }

  function retryInterruptedStep(reason, options = {}) {
    if (!currentTask) return { done: false, failed: true, clearTask: true, message: reason };
    const maxRetries = Math.max(0, Number(options.maxRetries ?? currentTask.meta?.maxInterruptedStepRetries ?? 2));
    const key = `${currentTask.stepIndex}:${currentTask.steps[currentTask.stepIndex]}`;
    if (!currentTask.meta) currentTask.meta = {};
    if (!currentTask.meta.interruptedStepRetries) currentTask.meta.interruptedStepRetries = {};
    const retries = Number(currentTask.meta.interruptedStepRetries[key] || 0) + 1;
    currentTask.meta.interruptedStepRetries[key] = retries;
    markStepFailed(reason);

    if (retries <= maxRetries) {
      const repeatFrom = Math.max(0, Number(options.repeatFrom ?? currentTask.stepIndex - 1));
      currentTask.stepIndex = repeatFrom;
      persist();
      return {
        done: false,
        failed: true,
        clearTask: false,
        retry: true,
        repeatFrom,
        message: `${reason}; retrying (${retries}/${maxRetries})`
      };
    }

    clearTask();
    return {
      done: false,
      failed: true,
      clearTask: true,
      retry: false,
      message: `${reason}; retry limit reached (${maxRetries})`
    };
  }

  async function runNextStep(context) {
    if (!currentTask) return { done: true, message: 'no task' };
    if (currentTask.paused) return { done: false, paused: true, message: currentTask.pausedReason || 'task paused' };
    if (!isValidTask(currentTask) || currentTask.stepIndex < 0 || currentTask.stepIndex >= currentTask.steps.length) {
      clearTask();
      return { done: false, failed: true, clearTask: true, message: 'cleared malformed task' };
    }
    if (context.cancellation?.isCancelled?.()) {
      clearTask();
      return { done: false, failed: true, cancelled: true, clearTask: true, message: 'task cancelled' };
    }
    const step = currentTask.steps[currentTask.stepIndex];
    const handler = context.handlers[step];

    if (!handler) {
      markStepFailed(`no handler for ${step}`);
      clearTask();
      return { done: false, failed: true, message: `missing handler ${step}` };
    }

    let result;
    try {
      context.cancellation?.throwIfCancelled?.();
      result = await handler(currentTask, context);
      context.cancellation?.throwIfCancelled?.();
    } catch (error) {
      if (error?.cancelled || error?.name === 'CancelledError') {
        clearTask();
        return { done: false, failed: true, cancelled: true, message: error.message || 'task cancelled' };
      }
      if (/digging aborted/i.test(String(error?.message || ''))) {
        return retryInterruptedStep('digging was stopped or interrupted');
      }
      throw error;
    }
    if (result?.failed) {
      markStepFailed(result.reason || 'step failed');
      if (result.repeatFrom !== undefined && result.clearTask === false) {
        currentTask.stepIndex = result.repeatFrom;
        persist();
        return result;
      }
      if (result.clearTask !== false) clearTask();
      return result;
    }

    if (result?.repeatFrom !== undefined) {
      currentTask.stepIndex = result.repeatFrom;
      persist();
      return result;
    }

    if (result?.done !== false) markStepDone();
    return result || { done: true };
  }

  return {
    setTask,
    setNamedTask,
    clearTask,
    getCurrentTask,
    runNextStep,
    markStepFailed,
    markStepDone,
    setGoalTask,
    clearGoalTask,
    pauseGoalTask,
    resumeGoalTask,
    getTaskForGoal,
    isGoalTaskRunning
  };
}
