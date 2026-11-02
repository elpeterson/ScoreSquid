import { describe, expect, it } from 'vitest';
import { emailOrigin, hostnameOf, rootRedirect, sportForHost, sportHref } from '../sport';

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe('hostnameOf', () => {
  it('drops the port and handles a missing header', () => {
    expect(hostnameOf('localhost:3000')).toBe('localhost');
    expect(hostnameOf('archery.scoresquid.com')).toBe('archery.scoresquid.com');
    expect(hostnameOf(null)).toBe('');
  });
});

describe('sportForHost', () => {
  it('uses the subdomain, which beats the cookie', () => {
    expect(sportForHost('archery.scoresquid.com')).toBe('archery');
    expect(sportForHost('gymnastics.scoresquid.com', 'archery')).toBe('gymnastics');
  });

  it('ignores the cookie on the root domain', () => {
    for (const host of ['scoresquid.com', 'www.scoresquid.com', 'other.scoresquid.com']) {
      expect(sportForHost(host, 'archery')).toBeNull();
    }
  });

  it('uses the cookie on hosts without subdomains', () => {
    expect(sportForHost('localhost', 'archery')).toBe('archery');
    expect(sportForHost('my-branch.vercel.app', 'gymnastics')).toBe('gymnastics');
  });

  it('gives null for an unknown cookie or a bare host named after a sport', () => {
    expect(sportForHost('localhost', 'chess')).toBeNull();
    expect(sportForHost('localhost')).toBeNull();
    expect(sportForHost('archery')).toBeNull();
  });
});

describe('sportHref', () => {
  it('links to the subdomain in production and the query locally', () => {
    expect(sportHref('archery', 'scoresquid.com')).toBe('https://archery.scoresquid.com/');
    expect(sportHref('archery', 'localhost')).toBe('/?sport=archery');
  });
});

describe('rootRedirect', () => {
  it('shows the picker at the root', () => {
    expect(rootRedirect('/', 'scoresquid.com')).toBeNull();
    expect(rootRedirect('/', 'localhost')).toBeNull();
  });

  it('sends /<sport>/... on the root domain to the subdomain', () => {
    expect(rootRedirect('/archery/login', 'scoresquid.com')).toBe(
      'https://archery.scoresquid.com/login',
    );
  });

  it('sends anything else to the picker', () => {
    expect(rootRedirect('/dashboard', 'scoresquid.com')).toBe('/');
    expect(rootRedirect('/chess/login', 'scoresquid.com')).toBe('/');
    expect(rootRedirect('//evil.example', 'scoresquid.com')).toBe('/');
    expect(rootRedirect('/archery/login', 'localhost')).toBe('/');
  });

  it('stays on the sport subdomain for a path that looks like another host', () => {
    const target = rootRedirect('/archery//evil.example', 'scoresquid.com');
    expect(new URL(target!, 'https://scoresquid.com').hostname).toBe('archery.scoresquid.com');
  });
});

describe('emailOrigin', () => {
  it('uses the sport subdomain in production', () => {
    expect(emailOrigin('archery', env({ VERCEL_ENV: 'production', VERCEL_URL: 'x.vercel.app' }))).toBe(
      'https://archery.scoresquid.com',
    );
  });

  it('uses the deployment URL on previews', () => {
    expect(emailOrigin('archery', env({ VERCEL_ENV: 'preview', VERCEL_URL: 'x.vercel.app' }))).toBe(
      'https://x.vercel.app',
    );
  });

  it('falls back to the base URL, then localhost', () => {
    expect(emailOrigin('archery', env({ NEXT_PUBLIC_BASE_URL: 'http://dev.test' }))).toBe(
      'http://dev.test',
    );
    expect(emailOrigin('archery', env({}))).toBe('http://localhost:3000');
  });
});
