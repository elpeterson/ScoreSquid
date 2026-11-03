// Settings for the end-to-end run. Supabase comes from the local stack (`supabase start`
// in apps/web), or from E2E_SUPABASE_* when they're set, as for a separate test stack.
import { execSync } from 'node:child_process';

export const APP_PORT = 3100;
export const MSO_PORT = 4010;
export const APP_URL = `http://localhost:${APP_PORT}`;
export const MSO_STAND_IN = `http://127.0.0.1:${MSO_PORT}`;

export type SupabaseEnv = { url: string; publishableKey: string; serviceRoleKey: string; mailUrl: string };

export function supabaseEnv(): SupabaseEnv {
  if (process.env.E2E_SUPABASE_URL) {
    return {
      url: process.env.E2E_SUPABASE_URL,
      publishableKey: process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? '',
      serviceRoleKey: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '',
      mailUrl: process.env.E2E_MAIL_URL ?? '',
    };
  }
  const out = execSync('supabase status -o env', { cwd: `${__dirname}/../..`, encoding: 'utf8' });
  const vars = Object.fromEntries(
    out
      .split('\n')
      .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim()))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => [m[1], m[2]]),
  );
  const env = {
    url: vars.API_URL ?? '',
    publishableKey: vars.PUBLISHABLE_KEY ?? vars.ANON_KEY ?? '',
    serviceRoleKey: vars.SERVICE_ROLE_KEY ?? '',
    mailUrl: vars.MAILPIT_URL ?? vars.INBUCKET_URL ?? '',
  };
  // Workers re-read the config, so pass what was found to them.
  process.env.E2E_SUPABASE_URL = env.url;
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY = env.publishableKey;
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey;
  process.env.E2E_MAIL_URL = env.mailUrl;
  return env;
}

/** Refuses anything but a local stack: these tests create and delete accounts freely. */
export function assertLocal(env: SupabaseEnv) {
  const host = new URL(env.url).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`End-to-end tests only run against a local Supabase stack, not ${host}`);
  }
}
