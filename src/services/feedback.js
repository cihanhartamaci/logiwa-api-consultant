export function getClientId() {
  try {
    const key = 'aintegration_client_id';
    let id = localStorage.getItem(key);
    if (id) return id;
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `client-${Date.now()}`;
    localStorage.setItem(key, id);
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
  if (fromCorrection && fromCorrection.length >= 8) return fromCorrection.slice(0, 120);
  const fromQuestion = String(questionText || '').trim().slice(0, 120);
  return fromQuestion || 'User correction';
}
