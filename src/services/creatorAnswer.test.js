import { describe, expect, it } from 'vitest';
import {
  buildCreatorAnswer,
  CREATOR_ANSWER_EN,
  CREATOR_ANSWER_TR,
  isCreatorQuestion,
} from './creatorAnswer';

describe('creator questions', () => {
  it.each([
    'Kim tarafından yaratıldın?',
    'kim tarafından geliştirildin',
    'Kim tarafından yapıldın?',
    'Seni kim yaptı?',
    'Seni kim geliştirdi',
    'Yaratıcın kim?',
    'Who made you?',
    'Who created you?',
    'Who developed this assistant?',
    "Who's your creator?",
    'Were you built by Google?',
  ])('detects %s', (q) => {
    expect(isCreatorQuestion(q)).toBe(true);
  });

  it.each([
    'Who created the shipment order via API?',
    'Siparişi kim oluşturdu, API ile nasıl bakarım?',
    'How do I create a product?',
    'Webhook kim tarafından tetikleniyor?',
  ])('ignores %s', (q) => {
    expect(isCreatorQuestion(q)).toBe(false);
  });

  it('answers in Turkish for Turkish questions and adds English otherwise', () => {
    expect(buildCreatorAnswer('Seni kim yaptı?')).toBe(CREATOR_ANSWER_TR);
    const en = buildCreatorAnswer('Who made you?');
    expect(en).toContain(CREATOR_ANSWER_TR);
    expect(en).toContain(CREATOR_ANSWER_EN);
  });
});
