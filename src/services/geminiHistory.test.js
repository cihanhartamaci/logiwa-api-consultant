import { describe, expect, it } from 'vitest';
import { buildGeminiChatContents } from './gemini';

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
