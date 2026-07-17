const commonWordFixes = new Map([
  ['wud', 'wood'],
  ['fud', 'food'],
  ['irn', 'iron'],
  ['cole', 'coal'],
  ['ston', 'stone'],
  ['dimond', 'diamond'],
  ['diomond', 'diamond'],
  ['netehr', 'nether'],
  ['armr', 'armor'],
  ['armer', 'armor'],
  ['armour', 'armor'],
  ['folow', 'follow'],
  ['folo', 'follow'],
  ['heer', 'here'],
  ['prepair', 'prepare'],
  ['rember', 'remember'],
  ['gard', 'guard'],
  ['lite', 'light'],
  ['torchs', 'torches'],
  ['bredd', 'bread'],
  ['furnis', 'furnace'],
  ['sheild', 'shield'],
  ['pixaxe', 'pickaxe'],
  ['pick', 'pickaxe'],
  ['gols', 'goals'],
  ['gole', 'goal'],
  ['cnacel', 'cancel'],
  ['frze', 'freeze'],
  ['stp', 'stop'],
  ['stoop', 'stop'],
  ['stap', 'stop'],
  ['biuld', 'build'],
  ['bulid', 'build'],
  ['bild', 'build'],
  ['comand', 'command'],
  ['commmands', 'commands'],
  ['equipt', 'equip'],
  ['diamnd', 'diamond'],
  ['dimnd', 'diamond'],
  ['cobble', 'cobblestone'],
  ['cobblston', 'cobblestone']
]);

const slangFixes = new Map([
  ['u', 'you'],
  ['r', 'are'],
  ['ur', 'your'],
  ['wat', 'what'],
  ['wut', 'what'],
  ['shud', 'should'],
  ['nxt', 'next'],
  ['pls', 'please'],
  ['plz', 'please'],
  ['thx', 'thanks'],
  ['ty', 'thank you'],
  ['rn', 'right now'],
  ['idk', "I don't know"],
  ['nvm', 'nevermind']
]);

function normalizeSpaces(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function replaceWords(text, replacements) {
  return normalizeSpaces(text)
    .split(' ')
    .map((word) => {
      const clean = word.toLowerCase();
      return replacements.get(clean) || word;
    })
    .join(' ');
}

export function normalizeMinecraftTerms(text) {
  return replaceWords(text, commonWordFixes);
}

export function normalizeSlang(text) {
  return replaceWords(text, slangFixes);
}

export function normalizePhonetic(text) {
  return normalizeSpaces(text)
    .replace(/\bcome hear\b/gi, 'come here')
    .replace(/\bcom here\b/gi, 'come here')
    .replace(/\bcme here\b/gi, 'come here')
    .replace(/\bget over hear\b/gi, 'get over here')
    .replace(/\bstay neer me\b/gi, 'stay near me')
    .replace(/\btee jay\b/gi, 'tj')
    .replace(/\bt j\b/gi, 'tj')
    .replace(/\bshow comand\b/gi, 'show commands')
    .replace(/\bshow comands\b/gi, 'show commands');
}

export function normalizeBotAliases(text) {
  return normalizeSpaces(text)
    .replace(/^@tj\b/i, 'tj')
    .replace(/^!tj\b/i, 'tj')
    .replace(/^tee\s*jay\b/i, 'tj')
    .replace(/^t\s*j\b/i, 'tj');
}

export function normalizeCommonTypos(text) {
  let output = normalizeSpaces(String(text || '').toLowerCase());
  output = output.replace(/[.,!?;:]+$/g, '');
  output = normalizeBotAliases(output);
  output = normalizePhonetic(output);
  output = normalizeSlang(output);
  output = normalizeMinecraftTerms(output);
  return normalizeSpaces(output);
}

function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  const rows = s.length + 1;
  const cols = t.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[s.length][t.length];
}

function similarity(a, b) {
  const max = Math.max(String(a || '').length, String(b || '').length, 1);
  return 1 - (levenshtein(a, b) / max);
}

export function fuzzyMatchCommand(text, commandList, threshold = 0.72) {
  const normalized = normalizeCommonTypos(text);
  let best = null;

  for (const command of commandList) {
    const score = similarity(normalized, normalizeCommonTypos(command));
    if (!best || score > best.score) best = { command, score };
  }

  if (best && best.score >= threshold) return best;
  return null;
}

export function getCorrectionConfidence(original, corrected) {
  return similarity(normalizeCommonTypos(original), normalizeCommonTypos(corrected));
}

