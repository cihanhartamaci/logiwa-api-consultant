import { afterEach, describe, expect, it } from 'vitest';
import { getSourceTitles, setLearnedKnowledgeCorpus } from '../constants/contextFilter';
import { normalizeSourceTitle, stripSourceCitations } from './citations';

afterEach(() => setLearnedKnowledgeCorpus([]));

describe('stripSourceCitations', () => {
  it('removes inline markers mid-sentence and before punctuation', () => {
    const input =
      'Open **Purchase Orders** [HC-156-3] and click **New**. Send `POST /v3.1/PurchaseOrder/create` [API-134].';
    expect(stripSourceCitations(input)).toBe(
      'Open **Purchase Orders** and click **New**. Send `POST /v3.1/PurchaseOrder/create`.'
    );
  });

  it('removes runs, lists inside one bracket, and parenthesized IDs', () => {
    const input = [
      'The webhook fires on shipment [API-134][HC-137-3] creation.',
      'Inventory sync uses snapshots [HC-1-2, API-3; KB-4-1].',
      'Approved team guidance applies (LK-9f2c1a7e-1b2d-4c3e-8f00-123456789abc-2).',
      'Receipts post line by line ([KB-4-1], [API-32]), then close.',
      'Use the playbook (see [KB-12-1]) for retries.',
    ].join('\n');
    expect(stripSourceCitations(input)).toBe(
      [
        'The webhook fires on shipment creation.',
        'Inventory sync uses snapshots.',
        'Approved team guidance applies.',
        'Receipts post line by line, then close.',
        'Use the playbook for retries.',
      ].join('\n')
    );
  });

  it('removes placeholder IDs and citation-only links or code spans', () => {
    const input = 'Fields come from the schema [API-operation] [HC-...] `HC-12-1` [KB-3-1](https://help.logiwa.com/x).';
    expect(stripSourceCitations(input)).toBe('Fields come from the schema.');
  });

  it('removes a trailing Sources section but keeps the provider footer', () => {
    const input = [
      '1. Create the order in Logiwa IO [HC-156-3].',
      '2. Call `POST /v3.1/ShipmentOrder/create` [API-134].',
      '',
      '**Sources**',
      '- [HC-156-3] Creating Shipment Orders — https://help.logiwa.com/en/articles/156',
      '- [API-134] POST /v3.1/ShipmentOrder/create',
      '',
      '_Fallback provider: Pollinations AI_',
    ].join('\n');
    expect(stripSourceCitations(input)).toBe(
      [
        '1. Create the order in Logiwa IO.',
        '2. Call `POST /v3.1/ShipmentOrder/create`.',
        '',
        '_Fallback provider: Pollinations AI_',
      ].join('\n')
    );
  });

  it('removes a Turkish Kaynaklar section and one-line Sources lists', () => {
    const turkish = ['Siparişi oluşturun [HC-12-1].', '', '### Kaynaklar:', '1. Sipariş oluşturma (HC-12-1)', '2. POST /v3.1/ShipmentOrder (API-7)'].join('\n');
    expect(stripSourceCitations(turkish)).toBe('Siparişi oluşturun.');

    const inline = 'Use the batch endpoint.\n\n**Sources:** [HC-1-1], [API-2]';
    expect(stripSourceCitations(inline)).toBe('Use the batch endpoint.');

    const references = 'Use the batch endpoint.\n\nReferences: Help Center — Batch Picking; POST /v3.1/Batch';
    expect(stripSourceCitations(references)).toBe('Use the batch endpoint.');
  });

  it('keeps business "Source:" / "Kaynak:" labels that are not citations', () => {
    const input = '- **Source:** NetSuite sales order\n- **Kaynak:** Depo A\n- **Hedef:** Depo B';
    expect(stripSourceCitations(input)).toBe(input);
  });

  it('drops bullet lines that only listed IDs', () => {
    const input = '- Map `sku` to `productCode`\n- [HC-4-1] [API-9]\n- Map `qty` to `quantity`';
    expect(stripSourceCitations(input)).toBe('- Map `sku` to `productCode`\n- Map `qty` to `quantity`');
  });

  it('leaves fenced code, JSON, inline code, URLs, and normal links untouched', () => {
    const input = [
      'Example body [API-134]:',
      '',
      '```json',
      '{ "tags": ["[HC-1-2]", "[API-3]"], "ref": "(KB-4-1)" }',
      '```',
      '',
      '~~~',
      'Sources:',
      '- [HC-9-9]',
      '~~~',
      '',
      'Filter with `items[API-1]` and see [Webhook docs](https://webhook.logiwa.com/) or https://myapi.logiwa.com/v3.1/Order?id=[1].',
    ].join('\n');
    expect(stripSourceCitations(input)).toBe(
      [
        'Example body:',
        '',
        '```json',
        '{ "tags": ["[HC-1-2]", "[API-3]"], "ref": "(KB-4-1)" }',
        '```',
        '',
        '~~~',
        'Sources:',
        '- [HC-9-9]',
        '~~~',
        '',
        'Filter with `items[API-1]` and see [Webhook docs](https://webhook.logiwa.com/) or https://myapi.logiwa.com/v3.1/Order?id=[1].',
      ].join('\n')
    );
  });

  it('keeps markdown structure: indentation, hard breaks, tables, and plain text', () => {
    const input = '| TargetConcept | LogiwaField |\n| --- | --- |\n| Order | `code` [API-2] |\n\n  - nested item  \nnext line';
    expect(stripSourceCitations(input)).toBe(
      '| TargetConcept | LogiwaField |\n| --- | --- |\n| Order | `code` |\n\n  - nested item  \nnext line'
    );
    expect(stripSourceCitations('No citations here.')).toBe('No citations here.');
    expect(stripSourceCitations('')).toBe('');
    expect(stripSourceCitations(null)).toBe('');
  });

  it('cleans legacy local-desk headings with backticked IDs and article links', () => {
    const input = '### Creating Purchase Orders `HC-88-1` — [Open article](https://help.logiwa.com/en/articles/88)\n\nBody text.';
    expect(stripSourceCitations(input)).toBe('### Creating Purchase Orders\n\nBody text.');
  });
});

describe('stripSourceCitations: title-based reference lists', () => {
  const webhookParagraph =
    "For outbound flows from Logiwa (e.g., Item Fulfillment, Inventory Sync, Item Receipt Sync), webhooks are generally preferred for near real-time updates. Logiwa's bulk API endpoints for creating products or shipment orders also require webhook subscriptions to deliver processing results.";

  it('removes the reference list from the live-site screenshot but keeps the paragraph', () => {
    const input = [
      '**5. Webhook vs. Polling:**',
      '',
      webhookParagraph,
      '',
      '- POST /v3.1/ShipmentOrder/create/bulk',
      '- POST /v3.1/Product/create/bulk',
      '- TikTok Integration',
      '- ERP product and inventory sync playbook (SAP NetSuite style)',
      '- Purchase order and receiving integration playbook',
      '- NetSuite Integration Guide',
      '- NetSuite Integration Guide',
      '',
      '**6. Error handling:**',
      '',
      'Retry 5xx responses with backoff.',
    ].join('\n');

    expect(stripSourceCitations(input)).toBe(
      [
        '**5. Webhook vs. Polling:**',
        '',
        webhookParagraph,
        '',
        '**6. Error handling:**',
        '',
        'Retry 5xx responses with backoff.',
      ].join('\n')
    );
  });

  it('removes a reference lead-in together with its list and normalizes emphasis, links, and quotes', () => {
    const input = [
      'Subscribe to the shipment webhook before calling the bulk endpoint.',
      '',
      '**Related docs:**',
      '1. **TikTok Integration**',
      '2. [Purchase order and receiving integration playbook](https://example.com/po).',
      '3. "Shopify Integration"',
    ].join('\n');
    expect(stripSourceCitations(input)).toBe(
      'Subscribe to the shipment webhook before calling the bulk endpoint.'
    );
  });

  it('uses approved team knowledge topics as known titles', () => {
    setLearnedKnowledgeCorpus([{ id: 7, topic: 'Acme 3PL onboarding checklist', content: 'Steps…' }]);
    expect(getSourceTitles()).toContain('Acme 3PL onboarding checklist');

    const input = 'Onboard the client first.\n\n- Acme 3PL onboarding checklist\n- Client Setup';
    expect(stripSourceCitations(input)).toBe('Onboard the client first.');
  });

  it('keeps endpoint lists that carry explanations and ordinary step lists', () => {
    const endpoints = [
      '- POST /v3.1/Product/create/bulk — send up to 50 products per request and wait for the webhook result.',
      '- POST /v3.1/ShipmentOrder/create/bulk: include `code`, `warehouseIdentifier`, and line items.',
      '- TikTok Integration: connect the shop under Integrations before syncing orders.',
    ].join('\n');
    expect(stripSourceCitations(endpoints)).toBe(endpoints);

    const steps = [
      '1. Open **Purchase Orders** and click **New**.',
      '2. Select the client and warehouse',
      '3. Add the lines and save',
      '4. Call the receipt webhook handler',
    ].join('\n');
    expect(stripSourceCitations(steps)).toBe(steps);
  });

  it('keeps bare endpoint lists that a content sentence introduces', () => {
    const input = 'Use these two endpoints for bulk creation:\n\n- POST /v3.1/ShipmentOrder/create/bulk\n- POST /v3.1/Product/create/bulk';
    expect(stripSourceCitations(input)).toBe(input);
  });

  it('only drops bare titles from a mostly-reference list and leaves fenced code and tables alone', () => {
    const mixed = [
      '- TikTok Integration',
      '- Shopify Integration',
      '- FedEx Integration',
      '- Rate shopping is configured per client and carrier.',
    ].join('\n');
    expect(stripSourceCitations(mixed)).toBe('- Rate shopping is configured per client and carrier.');

    const code = '```\n- TikTok Integration\n- Shopify Integration\n```';
    expect(stripSourceCitations(code)).toBe(code);

    const table = '| Doc |\n| --- |\n| TikTok Integration |\n| Shopify Integration |';
    expect(stripSourceCitations(table)).toBe(table);
  });

  it('normalizes titles for comparison', () => {
    expect(normalizeSourceTitle('  **“TikTok   Integration”**. ')).toBe('tiktok integration');
    expect(normalizeSourceTitle('[POST /v3.1/Product/create/bulk](https://x.y)')).toBe(
      'post /v3.1/product/create/bulk'
    );
  });
});
