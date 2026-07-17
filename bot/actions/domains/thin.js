/**
 * Thin-core action wrappers — small reliable API over thinCore.js.
 */
import * as thinCore from '../../thinCore.js';

/**
 * @param {object} ctx
 * @param {Function} ctx.getApi - returns the public actions api (set after createActions builds it)
 */
export function createThinHandlers(ctx) {
  const {
    bot,
    config,
    memory,
    say,
    perception,
    cancellation,
    taskQueue,
    safety,
    getApi
  } = ctx;

  function thinActionContext(context = {}) {
    return {
      ...context,
      config,
      cancellation,
      taskQueue,
      safety,
      state: context.state || perception(),
      actions: getApi(),
      rawText: context.rawText || context.command || ''
    };
  }

  async function runThinAction(actionName, args = {}, context = {}, { speak = true } = {}) {
    const quiet = context.silent === true || context.quietMacro === true || context.source === 'competentCore';
    const result = await thinCore.runThinAction(bot, memory, actionName, {
      ...args,
      quietMacro: quiet || args.quietMacro
    }, thinActionContext(context));
    if (speak && !quiet && result?.message) say(result.message, true);
    return result;
  }

  async function thinStatusAction(args = {}, context = {}) {
    return runThinAction('status', args, context);
  }

  async function thinStopAction(args = {}, context = {}) {
    return runThinAction('stop', args, context);
  }

  async function thinComeToOwnerAction(args = {}, context = {}) {
    return runThinAction('come_to_owner', args, context);
  }

  async function thinFollowOwnerAction(args = {}, context = {}) {
    return runThinAction('follow_owner', args, context);
  }

  async function thinStayAction(args = {}, context = {}) {
    return runThinAction('stay', args, context);
  }

  async function thinCollectResourceAction(args = {}, context = {}) {
    return runThinAction('collect_resource', args, context);
  }

  async function thinResumeLastCollectAction(args = {}, context = {}) {
    return runThinAction('resume_last_collect', args, context);
  }

  async function thinEatIfHungryAction(args = {}, context = {}) {
    return runThinAction('eat_if_hungry', args, context);
  }

  async function thinEquipToolForAction(args = {}, context = {}) {
    return runThinAction('equip_tool_for', args, context);
  }

  async function thinEquipArmorAction(args = {}, context = {}) {
    return runThinAction('equip_armor', args, context);
  }

  async function thinCraftItemAction(args = {}, context = {}) {
    return runThinAction('craft_item', args, context);
  }

  async function thinStoreItemsAction(args = {}, context = {}) {
    // When run from competent-core macros, let the macro announce once (no double chat).
    const speak = context.source !== 'competentCore' && context.source !== 'natural_router';
    return runThinAction('store_items', args, context, { speak });
  }

  async function thinReturnHomeAction(args = {}, context = {}) {
    return runThinAction('return_home', args, context);
  }

  async function thinRememberHomeAction(args = {}, context = {}) {
    return runThinAction('remember_home', args, context);
  }

  async function thinMissingRequirementsAction(args = {}, context = {}) {
    return runThinAction('report_missing_requirements', args, context);
  }

  return {
    thinActionContext,
    runThinAction,
    thinStatusAction,
    thinStopAction,
    thinComeToOwnerAction,
    thinFollowOwnerAction,
    thinStayAction,
    thinCollectResourceAction,
    thinResumeLastCollectAction,
    thinEatIfHungryAction,
    thinEquipToolForAction,
    thinEquipArmorAction,
    thinCraftItemAction,
    thinStoreItemsAction,
    thinReturnHomeAction,
    thinRememberHomeAction,
    thinMissingRequirementsAction
  };
}
