import { describe, it, expect } from 'vitest';
import { safeNextPath } from '../redirect';

describe('safeNextPath', () => {
  it('keeps same-origin paths', () => {
    expect(safeNextPath('/account')).toBe('/account');
    expect(safeNextPath('/account?type=recovery')).toBe('/account?type=recovery');
    expect(safeNextPath('/account?tab=security#form')).toBe('/account?tab=security#form');
  });

  it('falls back when next is missing', () => {
    expect(safeNextPath(null)).toBe('/dashboard');
    expect(safeNextPath('')).toBe('/dashboard');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(safeNextPath('https://evil.example')).toBe('/dashboard');
    expect(safeNextPath('//evil.example')).toBe('/dashboard');
    expect(safeNextPath('/\\evil.example')).toBe('/dashboard');
    expect(safeNextPath('javascript:alert(1)')).toBe('/dashboard');
  });

  it('rejects paths that become protocol-relative once tabs and newlines are stripped', () => {
    for (const next of ['/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '\t//evil.example']) {
      expect(safeNextPath(next)).toBe('/dashboard');
    }
  });

  it('honours a custom fallback', () => {
    expect(safeNextPath('//evil.example', '/home')).toBe('/home');
  });

  it('never resolves off-origin', () => {
    const base = 'https://app.example/auth/callback';
    for (const next of [
      '//evil.example',
      '/\\evil.example',
      'https://evil.example',
      '/\t/evil.example',
      '/\n\n/evil.example',
      '/ok',
    ]) {
      expect(new URL(safeNextPath(next), base).origin).toBe('https://app.example');
    }
  });
});
