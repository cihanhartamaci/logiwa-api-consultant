import { describe, expect, it } from 'vitest';
import {
  extractKeywords,
  getDocumentationIndexStats,
  getRelevantArticles,
  getRelevantKnowledge,
  getRelevantSwagger,
  searchDocumentation,
} from './contextFilter';

describe('documentation index', () => {
  it('indexes the complete Help Center and Swagger collections', () => {
    const stats = getDocumentationIndexStats();

    expect(stats.helpCenterArticles).toBeGreaterThan(300);
    expect(stats.helpCenterChunks).toBeGreaterThan(stats.helpCenterArticles);
    expect(stats.swaggerOperations).toBeGreaterThan(200);
    expect(stats.swaggerSchemas).toBeGreaterThan(0);
    expect(stats.knowledgeDocuments).toBeGreaterThanOrEqual(20);
    expect(stats.knowledgeChunks).toBeGreaterThan(0);
  });

  it('expands operational synonyms in Turkish and English', () => {
    const keywords = extractKeywords('Depoda stok kabul işlemi');

    expect(keywords).toContain('warehouse');
    expect(keywords).toContain('inventory');
    expect(keywords).toContain('receiving');
  });

  it('retrieves the expected Help Center article with a stable citation', () => {
    const results = getRelevantArticles('asynchronous report export', 5);

    expect(results.some(result => result.title === 'Asynchronous Report Exports')).toBe(true);
    expect(results.every(result => /^HC-\d+-\d+$/.test(result.sourceId))).toBe(true);
  });

  it('retrieves exact Swagger operations and their referenced schemas', () => {
    const result = getRelevantSwagger('authorize get token', 5);

    expect(result.sources.some(source =>
      source.method === 'POST' && source.path === '/v3.1/Authorize/token'
    )).toBe(true);
    expect(Object.keys(result.document.components.schemas).length).toBeGreaterThan(0);
    expect(result.sources.every(source => /^API-\d+$/.test(source.sourceId))).toBe(true);
  });

  it('searches both corpora for every user query', () => {
    const result = searchDocumentation('create and receive a purchase order');

    expect(result.helpCenter.length).toBeGreaterThan(0);
    expect(result.swagger.sources.length).toBeGreaterThan(0);
    expect(result.coverage.indexedHelpCenterArticles).toBeGreaterThan(300);
    expect(result.coverage.indexedSwaggerOperations).toBeGreaterThan(200);
  });

  it('attaches request and response schemas for create purchase order', () => {
    const result = getRelevantSwagger('create purchase order', 6);
    const created = result.document.paths['/v3.1/PurchaseOrder/create']?.post;

    expect(created).toBeTruthy();
    expect(JSON.stringify(created.requestBody)).toContain('PurchaseOrderCreateApiRequest');
    expect(created.responses['201']).toBeTruthy();
    expect(result.document.components.schemas.PurchaseOrderCreateApiRequest).toBeTruthy();
    expect(result.document.components.schemas.PurchaseOrderCreateApiRequest.required).toEqual(
      expect.arrayContaining(['clientIdentifier', 'code', 'warehouseIdentifier', 'purchaseOrderLineList'])
    );
    expect(result.document.components.schemas.PurchaseOrderCreateApiRequest.properties.code.type).toBe('string');
  });

  it('blends Help Center workflow with the matching Open API operation', () => {
    const result = searchDocumentation('How do I create a purchase order?');

    expect(result.helpCenter.some((article) => article.title === 'Create a Purchase Order')).toBe(true);
    expect(result.swagger.sources.some((source) =>
      source.method === 'POST' && source.path === '/v3.1/PurchaseOrder/create'
    )).toBe(true);
    expect(result.coverage.indexedSwaggerSchemas).toBeGreaterThan(400);
  });

  it('indexes Magna-Tiles knowledge docs and retrieves implementation guides', () => {
    const webhooks = getRelevantKnowledge('shipment inventory webhook', 5);
    expect(webhooks.some((article) => /webhook/i.test(article.title))).toBe(true);
    expect(webhooks.every((article) => /^KB-\d+-\d+$/.test(article.sourceId))).toBe(true);

    const inventory = searchDocumentation('list inventory API field guide');
    expect(inventory.knowledge.some((article) => /inventory/i.test(article.title))).toBe(true);
    expect(inventory.coverage.indexedKnowledgeDocuments).toBeGreaterThanOrEqual(20);

    const carrier = getRelevantKnowledge('carrier shipping option', 5);
    expect(carrier.some((article) => /carrier/i.test(article.title))).toBe(true);
  });

  it('indexes Logiwa Webhook v2.0 platform docs from webhook.logiwa.com', () => {
    const stats = getDocumentationIndexStats();
    expect(stats.knowledgeDocuments).toBeGreaterThanOrEqual(24);

    const platform = getRelevantKnowledge('Logiwa Webhook v2.0 webhook.logiwa.com create subscription JWT', 6);
    expect(platform.some((article) => /Webhook v2\.0/i.test(article.title))).toBe(true);
    expect(platform.some((article) => /webhook\.logiwa\.com/i.test(article.content))).toBe(true);

    const events = getRelevantKnowledge('ShipmentOrderCreated InventoryMovementRecorded supported events catalog', 5);
    expect(
      events.some(
        (article) =>
          /Supported Events/i.test(article.title) ||
          /ShipmentOrderCreated/i.test(article.content)
      )
    ).toBe(true);

    const delivery = getRelevantKnowledge('webhook HMAC retry timeout IP whitelist 10 seconds', 5);
    expect(delivery.some((article) => /Delivery|Security|Retries|Operations/i.test(article.title))).toBe(true);
  });

  it('indexes Integration Engineer playbooks for mapping and target-system connectors', () => {
    const stats = getDocumentationIndexStats();
    expect(stats.knowledgeDocuments).toBeGreaterThanOrEqual(31);

    const methodology = getRelevantKnowledge('integration mapping methodology field map Transform', 5);
    expect(methodology.some((article) => /mapping methodology/i.test(article.title))).toBe(true);
    expect(methodology.every((article) => /^KB-\d+-\d+$/.test(article.sourceId))).toBe(true);

    const netsuite = getRelevantKnowledge('NetSuite shipment order mapping ERP product inventory', 6);
    expect(
      netsuite.some(
        (article) =>
          /ERP product|marketplace|mapping methodology|architecture patterns/i.test(article.title) ||
          /NetSuite|mapping table/i.test(article.content)
      )
    ).toBe(true);

    const carrier = getRelevantKnowledge('Shippo FedEx tracking integration carrier label', 5);
    expect(carrier.some((article) => /Carrier and shipping|carrier \/ label/i.test(article.title))).toBe(true);

    const marketplace = getRelevantKnowledge('eBay Squarespace order ingest ShipmentOrder mapping', 5);
    expect(marketplace.some((article) => /Marketplace and storefront|order ingest/i.test(article.title))).toBe(true);
  });
});
