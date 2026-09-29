import { describe, expect, it } from 'vitest';
import { signSession, verifySession } from './sessionToken';

describe('sessionToken', () => {
  it('signs and verifies a session', async () => {
    const { token, expiresAt } = await signSession('integrationsteam', 'test-signing-key', 120);
    expect(expiresAt).toBeTruthy();
    const payload = await verifySession(token, 'test-signing-key');
    expect(payload.sub).toBe('integrationsteam');
  });

  it('rejects tampered tokens', async () => {
    const { token } = await signSession('integrationsteam', 'test-signing-key', 120);
    const bad = `${token.slice(0, -2)}ab`;
    expect(await verifySession(bad, 'test-signing-key')).toBeNull();
    expect(await verifySession(token, 'wrong-key')).toBeNull();
  });
});
