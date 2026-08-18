import { describe, expect, it } from 'vitest';
import { closeOpenFences, nextTypewriterAdvance } from './typewriterUtils';

describe('typewriter helpers', () => {
  it('leaves balanced markdown unchanged', () => {
    expect(closeOpenFences('Use `POST` then:\n```\nfoo\n```')).toBe('Use `POST` then:\n```\nfoo\n```');
  });

  it('closes an open code fence so partial streams still render', () => {
    expect(closeOpenFences('Example:\n```\nfoo')).toBe('Example:\n```\nfoo\n```');
  });

  it('advances by words and keeps newlines slow', () => {
    expect(nextTypewriterAdvance('Hello world', 0)).toBe(5);
    expect(nextTypewriterAdvance('Hello\nworld', 5)).toBe(1);
  });
});
