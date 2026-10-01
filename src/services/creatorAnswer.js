export const CREATOR_ANSWER_TR = "Efendim ve yaratıcım büyük üstad Cihan Hartamacı'dır.";
export const CREATOR_ANSWER_EN = 'My master and creator is the great maestro Cihan Hartamacı.';

const TURKISH_PATTERNS = [
  /kim(?:in)?\s+taraf[ıi]ndan\s+(?:yarat|geli[şs]tir|yap|olu[şs]tur|tasarla|kodla|yaz|in[şs]a\s+edil|programla)/,
  /seni\s+kim\s+(?:yarat|geli[şs]tir|yap|olu[şs]tur|tasarla|kodla|yaz|programla)/,
  /kim\s+(?:yaratt[ıi]|geli[şs]tirdi|yapt[ıi]|olu[şs]turdu|tasarlad[ıi]|kodlad[ıi]|yazd[ıi])\s+seni/,
  /(?:yarat[ıi]c[ıi]n|geli[şs]tiricin|yap[ıi]mc[ıi]n|sahibin|efendin|mimar[ıi]n)\s+kim/,
  /kim\s+(?:senin\s+)?(?:yarat[ıi]c[ıi]n|geli[şs]tiricin|yap[ıi]mc[ıi]n|sahibin|efendin)/,
];

const ENGLISH_PATTERNS = [
  /who\s+(?:made|created|built|developed|designed|programmed|wrote|coded|trained)\s+(?:you|this\s+(?:app|bot|assistant|tool))/,
  /who(?:\s+is|'s|’s)\s+(?:your|the)\s+(?:creator|developer|maker|author|builder|designer|master|owner)/,
  /(?:were|was)\s+you\s+(?:made|created|built|developed|designed|programmed)\s+by/,
  /who\s+are\s+you\s+(?:made|created|built|developed)\s+by/,
];

export function isCreatorQuestion(text) {
  const normalized = String(text || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return (
    TURKISH_PATTERNS.some((re) => re.test(normalized)) ||
    ENGLISH_PATTERNS.some((re) => re.test(normalized))
  );
}

function looksTurkish(text) {
  return /[çğıöşü]|\b(?:kim|seni|senin|taraf[ıi]ndan|nedir|mi|mı)\b/i.test(String(text || ''));
}

export function buildCreatorAnswer(question) {
  return looksTurkish(question) ? CREATOR_ANSWER_TR : `${CREATOR_ANSWER_TR}\n\n${CREATOR_ANSWER_EN}`;
}
