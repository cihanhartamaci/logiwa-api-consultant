import { describe, expect, it } from 'vitest';
import {
  compactDocumentationSources,
  POLLINATIONS_FALLBACK_MODELS,
} from '../services/pollinations';

describe('pollinations fallback helpers', () => {
  it('exposes free-tier friendly model cascade', () => {
    expect(POLLINATIONS_FALLBACK_MODELS[0]).toBe('openai-fast');
    expect(POLLINATIONS_FALLBACK_MODELS).toContain('mistral');
    expect(POLLINATIONS_FALLBACK_MODELS).toContain('gemma');
  });

  it('compacts documentation sources for smaller free-model contexts', () => {
    const compact = compactDocumentationSources({
      query: 'create purchase order',
      coverage: { indexedHelpCenterArticles: 308 },
      helpCenter: [
        {
          sourceId: 'HC-1-1',
          title: 'Create a Purchase Order',
          url: 'https://example.com/po',
          content: 'A'.repeat(2500),
        },
      ],
      swagger: {
        sources: [
          {
            sourceId: 'API-0',
            method: 'POST',
            path: '/v3.1/PurchaseOrder/create',
            summary: 'Create purchase order',
          },
        ],
        document: {
          openapi: '3.0.1',
          info: { title: 'Logiwa Open API', version: 'v3.1' },
          paths: {
            '/v3.1/PurchaseOrder/create': {
              post: {
                summary: 'Create purchase order',
                description: 'B'.repeat(900),
                parameters: [{ name: 'x', in: 'query', description: 'filter' }],
              },
            },
          },
        },
      },
    });

    expect(compact.helpCenter).toHaveLength(1);
    expect(compact.helpCenter[0].content.endsWith('…')).toBe(true);
    expect(compact.swagger.sources[0].path).toBe('/v3.1/PurchaseOrder/create');
    expect(
      compact.swagger.document.paths['/v3.1/PurchaseOrder/create'].post.description.endsWith('…')
    ).toBe(true);
  });
});
