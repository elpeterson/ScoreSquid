import { describe, expect, it } from 'vitest';
import { BE_API_ORIGIN, loopbackOrigin, MSO_ORIGIN, outboundOrigin } from '@/lib/outbound';

describe('outboundOrigin', () => {
  it('uses the real service by default', () => {
    expect(outboundOrigin(MSO_ORIGIN, {})).toBe(MSO_ORIGIN);
    expect(outboundOrigin(BE_API_ORIGIN, {})).toBe(BE_API_ORIGIN);
  });

  it('uses a local stand-in when one is configured', () => {
    expect(outboundOrigin(MSO_ORIGIN, { E2E_MSO_ORIGIN: 'http://127.0.0.1:4010' })).toBe('http://127.0.0.1:4010');
    expect(outboundOrigin(BE_API_ORIGIN, { E2E_BE_ORIGIN: 'http://localhost:4010/' })).toBe('http://localhost:4010');
  });

  it('never overrides on Vercel, production or preview', () => {
    for (const VERCEL_ENV of ['production', 'preview', 'development']) {
      expect(outboundOrigin(MSO_ORIGIN, { VERCEL_ENV, E2E_MSO_ORIGIN: 'http://127.0.0.1:4010' })).toBe(MSO_ORIGIN);
    }
  });

  it('ignores an override that is not a plain loopback origin', () => {
    for (const value of [
      'https://evil.example',
      'http://10.0.0.5:4010',
      'http://127.0.0.1.evil.example',
      'https://127.0.0.1:4010',
      'http://127.0.0.1:4010/path',
      'http://user@127.0.0.1:4010',
      'not a url',
    ]) {
      expect(loopbackOrigin(value)).toBeNull();
      expect(outboundOrigin(MSO_ORIGIN, { E2E_MSO_ORIGIN: value })).toBe(MSO_ORIGIN);
    }
  });
});
