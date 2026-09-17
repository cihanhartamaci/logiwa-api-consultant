import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ApiKeyInstructionsModal from './ApiKeyInstructionsModal';
import { GEMINI_SITE_REFERRER } from '../services/gemini';

describe('ApiKeyInstructionsModal', () => {
  it('renders Gemini and Pollinations key instructions when open', () => {
    const html = renderToStaticMarkup(
      createElement(ApiKeyInstructionsModal, { open: true, onClose: vi.fn() })
    );

    expect(html).toContain('How to get API keys');
    expect(html).toContain('Gemini API key');
    expect(html).toContain('Pollinations API key');
    expect(html).toContain('aistudio.google.com/apikey');
    expect(html).toContain('enter.pollinations.ai');
    expect(html).toContain(GEMINI_SITE_REFERRER);
    expect(html).toContain('HTTP referrers');
  });

  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      createElement(ApiKeyInstructionsModal, { open: false, onClose: vi.fn() })
    );
    expect(html).toBe('');
  });
});
