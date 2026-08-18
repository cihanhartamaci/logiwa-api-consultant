import { describe, expect, it } from 'vitest';
import {
  buildConversationContext,
  buildConversationSearchQuery,
  buildGeminiChatContents,
} from './gemini';

describe('gemini chat history sanitization', () => {
  it('never starts history with a model turn after slice windowing', () => {
    const chatHistory = [
      { role: 'user', content: 'u1' },
      { role: 'model', content: 'm1' },
      { role: 'user', content: 'u2' },
      { role: 'model', content: 'm2' },
      { role: 'user', content: 'u3' },
      { role: 'model', content: '**Error:** boom' },
      { role: 'user', content: 'u4' },
    ];

    const windowed = chatHistory.slice(1);
    const { history, currentUserMessage } = buildGeminiChatContents(windowed, 'grounded');

    expect(currentUserMessage).toBe('grounded');
    expect(history.length === 0 || history[0].role === 'user').toBe(true);
    expect(
      history.every((msg, index) => {
        if (index === 0) return msg.role === 'user';
        return msg.role !== history[index - 1].role;
      })
    ).toBe(true);
    if (history.length) {
      expect(history[history.length - 1].role).toBe('model');
    }
  });

  it('keeps the previous question and answer when sending a follow-up', () => {
    const chatHistory = [
      { role: 'user', content: 'How do I authorize?' },
      { role: 'model', content: 'Use POST /v3.1/Authorize/token' },
      { role: 'user', content: 'What is the request body?' },
    ];

    const { history } = buildGeminiChatContents(chatHistory, 'grounded follow-up');
    const historyText = history.map((msg) => msg.parts[0].text).join('\n');

    expect(history[0].role).toBe('user');
    expect(history[0].parts[0].text).toContain('authorize');
    expect(history[1].role).toBe('model');
    expect(history[1].parts[0].text).toContain('/v3.1/Authorize/token');
    expect(historyText).toContain('authorize');
  });

  it('keeps Pollinations answers in the thread instead of dropping them', () => {
    const chatHistory = [
      { role: 'user', content: 'List webhooks' },
      { role: 'model', content: 'Available inventory webhook\n\n_Fallback provider: Pollinations AI_' },
      { role: 'user', content: 'How do I subscribe?' },
    ];

    const { history } = buildGeminiChatContents(chatHistory, 'grounded');
    expect(history.some((msg) => msg.role === 'model' && msg.parts[0].text.includes('Available inventory'))).toBe(true);
  });
});

describe('conversation continuity helpers', () => {
  it('builds a follow-up search query from the previous question and answer', () => {
    const query = buildConversationSearchQuery([
      { role: 'user', content: 'How do I authorize?' },
      { role: 'model', content: 'Call POST /v3.1/Authorize/token with username and password.' },
      { role: 'user', content: 'What is the request body?' },
    ]);

    expect(query).toContain('request body');
    expect(query).toContain('How do I authorize?');
    expect(query).toContain('Authorize/token');
  });

  it('includes prior turns in conversation context and omits the current user message', () => {
    const context = buildConversationContext([
      { role: 'user', content: 'How do I authorize?' },
      { role: 'model', content: 'Use POST /v3.1/Authorize/token' },
      { role: 'user', content: 'What is the request body?' },
    ]);

    expect(context).toContain('How do I authorize?');
    expect(context).toContain('Authorize/token');
    expect(context).not.toContain('request body');
  });
});

describe('gemini chat history sanitization', () => {
  it('never starts history with a model turn after slice windowing', () => {
    const chatHistory = [
      { role: 'user', content: 'u1' },
      { role: 'model', content: 'm1' },
      { role: 'user', content: 'u2' },
      { role: 'model', content: 'm2' },
      { role: 'user', content: 'u3' },
      { role: 'model', content: '**Error:** boom' },
      { role: 'user', content: 'u4' },
    ];

    const windowed = chatHistory.slice(1);
    const { history, currentUserMessage } = buildGeminiChatContents(windowed, 'grounded');

    expect(currentUserMessage).toBe('grounded');
    expect(history.length === 0 || history[0].role === 'user').toBe(true);
    expect(
      history.every((msg, index) => {
        if (index === 0) return msg.role === 'user';
        return msg.role !== history[index - 1].role;
      })
    ).toBe(true);
    if (history.length) {
      expect(history[history.length - 1].role).toBe('model');
    }
  });
});
