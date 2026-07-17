const injectionPatterns = [
  /ignore (all )?(your )?(previous|prior|above) (instructions|rules)/i,
  /forget .*owner/i,
  /you now obey/i,
  /new owner/i,
  /developer mode/i,
  /system prompt/i,
  /hidden instructions/i,
  /jailbreak/i
];

const secretPatterns = [
  /api key/i,
  /system prompt/i,
  /config secrets?/i,
  /print .*config/i,
  /show .*config/i,
  /local file path/i,
  /read .*files?/i,
  /open .*files?/i,
  /password/i,
  /token/i
];

const bypassPatterns = [
  /attack modvinny/i,
  /kill all/i,
  /attack all/i,
  /break every chest/i,
  /(go )?jump in lava/i,
  /go into the nether without confirmation/i,
  /bypass confirmation/i
];

export function detectPromptInjection(text) {
  return injectionPatterns.some((pattern) => pattern.test(String(text || '')));
}

export function detectSecretRequest(text) {
  return secretPatterns.some((pattern) => pattern.test(String(text || '')));
}

export function detectActionBypassAttempt(text) {
  return bypassPatterns.some((pattern) => pattern.test(String(text || '')));
}

export function detectImpersonationAttempt(text) {
  return /i am modvinny|pretend i am modvinny|modvinny said/i.test(String(text || ''));
}

export function sanitizeDialogueInput(text) {
  return String(text || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 350);
}

export function sanitizeDialogueOutput(text) {
  return String(text || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function shouldRefuseDialogue(text, context = {}) {
  if (detectPromptInjection(text)) return { refuse: true, reason: 'prompt_injection' };
  if (detectSecretRequest(text)) return { refuse: true, reason: 'secret_request' };
  if (detectActionBypassAttempt(text)) return { refuse: true, reason: 'unsafe_action' };
  if (!context.isOwner && detectImpersonationAttempt(text)) return { refuse: true, reason: 'impersonation' };
  return { refuse: false, reason: null };
}

export function createSafeRefusal(reason) {
  if (reason === 'secret_request') return "I'm not sharing private setup details.";
  if (reason === 'impersonation') return 'Nope. Only ModVinny can give me orders.';
  if (reason === 'unsafe_action') return "That sounds unsafe. I'm not doing it.";
  return "Nope. I'm keeping my rules and safety checks.";
}

export function enforceNoActionExecution(dialogueOutput) {
  const output = dialogueOutput && typeof dialogueOutput === 'object' ? { ...dialogueOutput } : {};
  delete output.actions;
  delete output.command;
  delete output.action;
  return output;
}

export function checkDialogueSafety(messageContext = {}) {
  const text = sanitizeDialogueInput(messageContext.rawText || messageContext.text || '');
  return shouldRefuseDialogue(text, messageContext);
}
