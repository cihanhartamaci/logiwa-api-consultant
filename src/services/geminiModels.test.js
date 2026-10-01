import { describe, expect, it } from 'vitest';
import { GEMINI_MODELS, isUsableDiscoveredModel, orderGeminiModels } from './gemini';

describe('Gemini model cascade', () => {
  it('has many backup models to walk through on rate limits', () => {
    expect(GEMINI_MODELS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(GEMINI_MODELS).size).toBe(GEMINI_MODELS.length);
  });

  it('appends discovered models after the static list without duplicates', () => {
    const ordered = orderGeminiModels(['a', 'b'], ['b', 'c']);
    expect(ordered).toEqual(['a', 'b', 'c']);
  });

  it('keeps only text-generation Gemini models from discovery', () => {
    expect(
      isUsableDiscoveredModel({
        name: 'models/gemini-2.5-flash',
        supportedGenerationMethods: ['generateContent'],
      })
    ).toBe(true);
    expect(
      isUsableDiscoveredModel({
        name: 'models/text-embedding-004',
        supportedGenerationMethods: ['embedContent'],
      })
    ).toBe(false);
    expect(
      isUsableDiscoveredModel({
        name: 'models/gemini-2.5-flash-preview-tts',
        supportedGenerationMethods: ['generateContent'],
      })
    ).toBe(false);
    expect(
      isUsableDiscoveredModel({
        name: 'models/gemma-3-27b-it',
        supportedGenerationMethods: ['generateContent'],
      })
    ).toBe(false);
  });
});
