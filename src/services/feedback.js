const CLIENT_ID_KEY = 'aintegration_client_id';

export function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (id) return id;
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    return 'anonymous';
  }
}

export function buildFeedbackPayload({
  rating,
  questionText = '',
  answerText = '',
  correctionText = null,
  provider = null,
}) {
  return {
    rating,
    question_text: String(questionText || ''),
    answer_text: String(answerText || ''),
    correction_text: correctionText ? String(correctionText) : null,
    provider: provider || null,
    client_id: getClientId(),
  };
}

export function topicFromCorrection(correctionText, questionText = '') {
  const fromCorrection = String(correctionText || '').trim().split(/[.!?\n]/)[0];
  if (fromCorrection && fromCorrection.length >= 8) {
    return fromCorrection.slice(0, 120);
  }
  const fromQuestion = String(questionText || '').trim().slice(0, 120);
  return fromQuestion || 'User correction';
}
