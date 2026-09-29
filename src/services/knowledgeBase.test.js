import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFeedbackPayload, topicFromCorrection } from './feedback';

function clearBrowserStorage() {
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
}

describe('feedback helpers', () => {
  beforeEach(() => {
    clearBrowserStorage();
  });

  it('builds a feedback payload with client id', () => {
    const payload = buildFeedbackPayload({
      rating: 'down',
      questionText: 'How do webhooks work?',
      answerText: 'Something incomplete',
      correctionText: 'Use webhook.logiwa.com for v2',
      provider: 'gemini',
    });
    expect(payload.rating).toBe('down');
    expect(payload.question_text).toContain('webhooks');
    expect(payload.correction_text).toContain('webhook.logiwa.com');
    expect(payload.provider).toBe('gemini');
    expect(payload.client_id).toBeTruthy();
  });

  it('derives a topic from the correction text', () => {
    expect(
      topicFromCorrection(
        'Prefer Webhook Platform v2.0 base URL https://webhook.logiwa.com. Do not use legacy helpers.',
        'webhooks?'
      )
    ).toMatch(/Prefer Webhook Platform/i);
  });
});

describe('knowledgeBase local facade', () => {
  beforeEach(() => {
    clearBrowserStorage();
    vi.resetModules();
  });

  it('saves pending correction then approves into prompt knowledge', async () => {
    const kb = await import('./knowledgeBase');
    const pending = await kb.saveKnowledge('Webhook v2', 'Use webhook.logiwa.com', {
      status: 'pending',
      source: 'correction',
    });
    expect(pending.status).toBe('pending');
    expect(kb.getAllKnowledge()).toHaveLength(0);
    expect(kb.getKnowledgeDeskEntries().some((e) => e.status === 'pending')).toBe(true);

    await kb.approveKnowledge(pending.id);
    const approved = kb.getAllKnowledge();
    expect(approved).toHaveLength(1);
    expect(approved[0].topic).toBe('Webhook v2');
    expect(approved[0].content).toContain('webhook.logiwa.com');
  });

  it('submitAnswerFeedback down creates pending knowledge locally', async () => {
    const kb = await import('./knowledgeBase');
    const { pendingKnowledge } = await kb.submitAnswerFeedback({
      rating: 'down',
      questionText: 'How do I subscribe to inventory webhooks?',
      answerText: 'Wrong legacy path',
      correctionText: 'Subscribe via https://webhook.logiwa.com for Webhook v2.0.',
      provider: 'pollinations',
    });
    expect(pendingKnowledge).toBeTruthy();
    expect(pendingKnowledge.status).toBe('pending');
    expect(pendingKnowledge.source).toBe('correction');
  });
});
