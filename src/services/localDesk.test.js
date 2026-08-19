import { describe, expect, it } from 'vitest';
import { searchDocumentation } from '../constants/contextFilter';
import { generateLocalDeskBriefing } from './localDesk';

describe('local documentation desk', () => {
  it('assembles a last-resort briefing from Help Center, knowledge, and Open API hits', () => {
    const sources = searchDocumentation('How do I create a purchase order?', {
      helpLimit: 4,
      swaggerLimit: 4,
      knowledgeLimit: 3,
    });
    const briefing = generateLocalDeskBriefing('How do I create a purchase order?', sources);

    expect(briefing).toContain('local documentation desk');
    expect(briefing).toContain('How do I create a purchase order?');
    expect(briefing).toMatch(/`HC-/);
    expect(briefing).toMatch(/POST \/v3\.1\//);
    expect(briefing).toMatch(/Request fields:/);
    expect(briefing).not.toMatch(/^\*\*Error:\*\*/m);
    expect(briefing).toContain('Last resort: local documentation desk');
  });

  it('explains an empty index without inventing endpoints', () => {
    const briefing = generateLocalDeskBriefing('zzz-no-match-token', {
      helpCenter: [],
      knowledge: [],
      swagger: { sources: [], document: { paths: {} } },
    });

    expect(briefing).toContain('did not return a strong match');
    expect(briefing).not.toContain('## Open API contracts');
    expect(briefing).not.toMatch(/POST \/v3/);
  });

  it('lists request fields from a compact swagger schema', () => {
    const briefing = generateLocalDeskBriefing('create shipment', {
      helpCenter: [],
      knowledge: [],
      swagger: {
        sources: [
          {
            sourceId: 'API-shipment-create',
            method: 'POST',
            path: '/v3.1/ShipmentOrder',
            summary: 'Create a shipment order',
          },
        ],
        document: {
          paths: {
            '/v3.1/ShipmentOrder': {
              post: {
                summary: 'Create a shipment order',
                requestBody: {
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/ShipmentOrder' },
                    },
                  },
                },
                responses: {
                  '200': {
                    content: {
                      'application/json': {
                        schema: { properties: { id: { type: 'string' } } },
                      },
                    },
                  },
                },
              },
            },
          },
          components: {
            schemas: {
              ShipmentOrder: {
                properties: {
                  code: { type: 'string' },
                  warehouseId: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    });

    expect(briefing).toContain('`POST /v3.1/ShipmentOrder`');
    expect(briefing).toContain('`code`');
    expect(briefing).toContain('`warehouseId`');
    expect(briefing).toContain('`id`');
  });
});
