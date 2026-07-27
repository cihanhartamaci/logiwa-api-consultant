import { describe, expect, it } from 'vitest';
import {
  extractKeywords,
  getDocumentationIndexStats,
  getRelevantArticles,
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
});
