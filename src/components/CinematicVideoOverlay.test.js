import { describe, expect, it } from 'vitest';
import {
  LOGIN_CINEMATIC_VIDEO_ID,
  LOGOUT_CINEMATIC_VIDEO_ID,
} from './CinematicVideoOverlay';

describe('cinematic login/logout clips', () => {
  it('uses an Optimus Prime clip for login and the requested Interstellar meme for logout', () => {
    expect(LOGIN_CINEMATIC_VIDEO_ID).toBe('yVhbKYfPRck');
    expect(LOGOUT_CINEMATIC_VIDEO_ID).toBe('_ZnOfdpOEZQ');
  });
});
