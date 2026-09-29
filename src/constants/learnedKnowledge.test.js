import { describe, expect, it } from 'vitest';
import {
  getRelevantLearnedKnowledge,
  searchDocumentation,
  setLearnedKnowledgeCorpus,
} from '../constants/contextFilter';

describe('learned knowledge BM25', () => {
  it('indexes approved team knowledge and retrieves it', () => {
    setLearnedKnowledgeCorpus([
      {
        id: 'abc',
        topic: 'Webhook Platform v2 base URL',
        content:
          'For Logiwa Webhook Platform v2.0 use https://webhook.logiwa.com. Prefer this over legacy /v3.1/Webhook helpers.',
      },
    ]);

    const hits = getRelevantLearnedKnowledge('webhook platform base url v2', 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].sourceId).toMatch(/^LK-/);
    expect(hits[0].title).toMatch(/Webhook Platform/i);

    const pack = searchDocumentation('webhook.logiwa.com platform v2', {
      helpLimit: 2,
      swaggerLimit: 2,
      knowledgeLimit: 4,
    });
    expect(pack.coverage.indexedLearnedChunks).toBeGreaterThan(0);
    expect(pack.knowledge.some((item) => String(item.sourceId).startsWith('LK-'))).toBe(true);
  });
});
