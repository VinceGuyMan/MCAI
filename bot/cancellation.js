export class CancelledError extends Error {
  constructor(reason = 'cancelled') {
    super(reason);
    this.name = 'CancelledError';
    this.cancelled = true;
  }
}

export function createCancellation() {
  let cancelled = false;
  let reason = null;
  let cancelledAt = 0;
  let generation = 0;
  const handlers = new Set();
  const tasks = new Map();

  function isCancelled() {
    return cancelled;
  }

  function throwIfCancelled() {
    if (cancelled) throw new CancelledError(reason || 'cancelled');
  }

  function resetCancellation() {
    cancelled = false;
    reason = null;
    cancelledAt = 0;
    generation += 1;
  }

  function cancelAll(nextReason = 'cancelled') {
    cancelled = true;
    reason = nextReason;
    cancelledAt = Date.now();
    generation += 1;
    console.log(`[cancel] ${nextReason}`);
    for (const [taskId, cancelFn] of [...tasks.entries()]) {
      try {
        cancelFn?.({ reason, cancelledAt, generation, taskId });
      } catch (error) {
        console.warn(`[cancel] task ${taskId} failed: ${error.message}`);
      } finally {
        tasks.delete(taskId);
      }
    }
    for (const handler of [...handlers]) {
      try {
        handler({ reason, cancelledAt, generation });
      } catch (error) {
        console.warn(`[cancel] handler failed: ${error.message}`);
      }
    }
  }

  function getState() {
    return { cancelled, reason, cancelledAt, generation, activeTasks: listActiveCancelableTasks() };
  }

  function getCancellationReason() {
    return reason;
  }

  function onCancel(handler) {
    if (typeof handler !== 'function') return () => {};
    handlers.add(handler);
    return () => removeCancelHandler(handler);
  }

  function removeCancelHandler(handler) {
    handlers.delete(handler);
  }

  function createCancellationToken(label = 'task') {
    const tokenGeneration = generation;
    return {
      label,
      generation: tokenGeneration,
      isCancelled,
      throwIfCancelled,
      get reason() {
        return reason;
      },
      getCancellationReason
    };
  }

  function registerCancelableTask(taskId, cancelFn = null) {
    if (!taskId) return { ok: false, reason: 'taskId is required' };
    tasks.set(String(taskId), typeof cancelFn === 'function' ? cancelFn : () => {});
    return { ok: true, taskId: String(taskId) };
  }

  function unregisterCancelableTask(taskId) {
    return tasks.delete(String(taskId));
  }

  function cancelTask(taskId, nextReason = 'cancelled') {
    const key = String(taskId);
    const cancelFn = tasks.get(key);
    if (!cancelFn) return { ok: false, reason: `No active task: ${key}` };
    try {
      cancelFn({ reason: nextReason, cancelledAt: Date.now(), generation, taskId: key });
    } finally {
      tasks.delete(key);
    }
    return { ok: true, taskId: key, reason: nextReason };
  }

  function listActiveCancelableTasks() {
    return [...tasks.keys()].sort();
  }

  return {
    isCancelled,
    throwIfCancelled,
    resetCancellation,
    cancelAll,
    getCancellationReason,
    createCancellationToken,
    registerCancelableTask,
    unregisterCancelableTask,
    cancelTask,
    listActiveCancelableTasks,
    onCancel,
    removeCancelHandler,
    getState
  };
}

export function isCancelledError(error) {
  return Boolean(error?.cancelled || error?.name === 'CancelledError');
}

const defaultCancellation = createCancellation();

export const isCancelled = defaultCancellation.isCancelled;
export const throwIfCancelled = defaultCancellation.throwIfCancelled;
export const resetCancellation = defaultCancellation.resetCancellation;
export const cancelAll = defaultCancellation.cancelAll;
export const getCancellationReason = defaultCancellation.getCancellationReason;
export const createCancellationToken = defaultCancellation.createCancellationToken;
export const registerCancelableTask = defaultCancellation.registerCancelableTask;
export const unregisterCancelableTask = defaultCancellation.unregisterCancelableTask;
export const cancelTask = defaultCancellation.cancelTask;
export const listActiveCancelableTasks = defaultCancellation.listActiveCancelableTasks;
export const onCancel = defaultCancellation.onCancel;
export const removeCancelHandler = defaultCancellation.removeCancelHandler;
