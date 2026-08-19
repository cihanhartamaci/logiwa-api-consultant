import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compactDocumentationSources,
  formatPollinationsExhausted,
  generatePollinationsFallback,
  pickPollinationsFallbackModels,
  pollinationsErrorKind,
  POLLINATIONS_FALLBACK_MODELS,
  POLLINATIONS_OFFICIAL_MODELS,
  prepareGeminiSources,
  resetPollinationsModelCache,
} from '../services/pollinations';

afterEach(() => {
  resetPollinationsModelCache();
  vi.unstubAllGlobals();
});

describe('pollinations fallback helpers', () => {
  it('puts zero-pollen community models before official aliases and drops paid openai / invalid :free ids', () => {
    expect(POLLINATIONS_FALLBACK_MODELS[0]).toContain('/');
    expect(POLLINATIONS_FALLBACK_MODELS).toContain('openai-fast');
    expect(POLLINATIONS_FALLBACK_MODELS).toContain('mistral');
    expect(POLLINATIONS_FALLBACK_MODELS).toContain('gemma');
    expect(POLLINATIONS_FALLBACK_MODELS).not.toContain('openai');
    expect(POLLINATIONS_FALLBACK_MODELS).not.toContain('YoannDev90/gemma-4-31b:free');
    expect(POLLINATIONS_OFFICIAL_MODELS[0]).toBe('nova-fast');
  });

  it('classifies Pollinations HTTP failures so 402/400 skip instead of aborting', () => {
    expect(pollinationsErrorKind({ message: 'Pollinations openai failed (402): Insufficient balance' })).toBe(
      'payment'
    );
    expect(
      pollinationsErrorKind({
        message: 'Pollinations text YoannDev90/gemma-4-31b:free failed (400): Invalid model or alias',
      })
    ).toBe('invalid_model');
    expect(pollinationsErrorKind({ message: 'Pollinations rejected (401)' })).toBe('auth');
    expect(pollinationsErrorKind({ message: 'Pollinations gemma failed (500): boom' })).toBe('other');
  });

  it('picks live zero-pollen community models before official cheap aliases', () => {
    const cascade = pickPollinationsFallbackModels([
      {
        name: 'chigwell/llm7-fast',
        pricing: { promptTextTokens: '0', completionTextTokens: '0' },
      },
      {
        name: 'openai',
        pricing: { promptTextTokens: '0.00000015', completionTextTokens: '0.0000009375' },
      },
      {
        name: 'openai-fast',
        aliases: ['gpt-5-nano'],
        pricing: { promptTextTokens: '0.0000000375', completionTextTokens: '0.0000003' },
      },
    ]);

    expect(cascade[0]).toBe('chigwell/llm7-fast');
    expect(cascade).toContain('openai-fast');
    expect(cascade).not.toContain('openai');
  });

  it('explains empty pollen balance when every official model returns 402', () => {
    const message = formatPollinationsExhausted([
      'Pollinations openai failed (402): Insufficient balance',
      'Pollinations openai failed (402): Insufficient balance',
    ]);
    expect(message).toContain('enter.pollinations.ai');
    expect(message).toContain('pollen');
  });

  it('skips 402 and invalid models, then uses the next free model', async () => {
    const attempted = [];
    vi.stubGlobal('fetch', async (_url, options) => {
      const body = JSON.parse(options.body);
      attempted.push(body.model);
      if (body.model === 'openai') {
        return {
          ok: false,
          status: 402,
          text: async () =>
            JSON.stringify({ error: { message: 'Insufficient balance', code: 'PAYMENT_REQUIRED' } }),
        };
      }
      if (body.model === 'YoannDev90/gemma-4-31b:free') {
        return {
          ok: false,
          status: 400,
          text: async () =>
            JSON.stringify({ error: { message: 'Invalid model or alias', code: 'BAD_REQUEST' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => 'Authorize uses POST /v3.1/Authorize/token',
      };
    });

    const text = await generatePollinationsFallback({
      apiKey: 'test-key',
      systemInstruction: 'Be brief.',
      chatHistory: [{ role: 'user', content: 'How do I get a token?' }],
      groundedUserPrompt: 'How do I get a token?',
      models: ['openai', 'YoannDev90/gemma-4-31b:free', 'chigwell/llm7-fast'],
    });

    expect(text).toContain('Authorize/token');
    expect(attempted).toEqual(['openai', 'YoannDev90/gemma-4-31b:free', 'chigwell/llm7-fast']);
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
                requestBody: {
                  schema: { $ref: '#/components/schemas/PurchaseOrderCreateApiRequest' },
                },
                responses: {
                  201: {
                    description: 'Created',
                    schema: { $ref: '#/components/schemas/GuidResult' },
                  },
                },
              },
            },
          },
          components: {
            schemas: {
              PurchaseOrderCreateApiRequest: {
                required: ['clientIdentifier', 'code'],
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  clientIdentifier: { type: 'string', format: 'uuid' },
                },
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
    expect(
      compact.swagger.document.paths['/v3.1/PurchaseOrder/create'].post.requestBody.schema._ref ||
        compact.swagger.document.paths['/v3.1/PurchaseOrder/create'].post.requestBody.schema.$ref
    ).toBe('#/components/schemas/PurchaseOrderCreateApiRequest');
    expect(compact.swagger.document.components.schemas.PurchaseOrderCreateApiRequest.required).toContain(
      'clientIdentifier'
    );
    expect(
      compact.swagger.document.components.schemas.PurchaseOrderCreateApiRequest.properties.code.type
    ).toBe('string');
    expect(compact.swagger.document.paths['/v3.1/PurchaseOrder/create'].post.responses['201']).toBeTruthy();
  });

  it('keeps request and response schemas in the Gemini source payload', () => {
    const payload = prepareGeminiSources({
      query: 'create purchase order',
      helpCenter: [
        {
          sourceId: 'HC-1-1',
          title: 'Create a Purchase Order',
          url: 'https://example.com/po',
          content: 'Use the Purchase Order screen.',
        },
      ],
      knowledge: [
        {
          sourceId: 'KB-0-1',
          title: 'example create purchase order',
          origin: 'Magna-Tiles / API_Support_Doc.zip',
          content: 'Example JSON payload from example_create_purchase_order.json',
        },
      ],
      swagger: {
        sources: [{ sourceId: 'API-0', method: 'POST', path: '/v3.1/PurchaseOrder/create' }],
        document: {
          paths: {
            '/v3.1/PurchaseOrder/create': {
              post: {
                requestBody: { schema: { $ref: '#/components/schemas/PurchaseOrderCreateApiRequest' } },
              },
            },
          },
          components: {
            schemas: {
              PurchaseOrderCreateApiRequest: {
                required: ['code'],
                properties: { code: { type: 'string' } },
              },
            },
          },
        },
      },
    });

    expect(payload.blend).toMatch(/request and response/i);
    expect(payload.swagger.document.components.schemas.PurchaseOrderCreateApiRequest.required).toContain('code');
    expect(payload.helpCenter[0].content).toContain('Purchase Order screen');
    expect(payload.knowledge[0].sourceId).toBe('KB-0-1');
  });
});
