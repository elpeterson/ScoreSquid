import { describe, it, expect } from 'vitest';
import { LOGIN_ERROR, loginErrorMessage } from '../login-errors';

describe('loginErrorMessage', () => {
  it('has text for every code the callback sends', () => {
    for (const code of Object.values(LOGIN_ERROR)) {
      expect(loginErrorMessage(code)).toEqual(expect.any(String));
    }
  });

  it('never echoes unknown input', () => {
    expect(loginErrorMessage('Your account is locked, call 555-0100')).toBeNull();
    expect(loginErrorMessage('constructor')).toBeNull();
    expect(loginErrorMessage('__proto__')).toBeNull();
  });

  it('ignores a missing or repeated parameter', () => {
    expect(loginErrorMessage(undefined)).toBeNull();
    expect(loginErrorMessage([LOGIN_ERROR.linkFailed, 'x'])).toBeNull();
  });
});
