/** Every app stores a theme; apps add their own boolean toggles. */
export type BaseSettings = { theme: string };

const THEMES = ['light', 'dark', 'system'];

/**
 * Validate a single setting update coming from the client. Server actions take
 * arbitrary input at runtime, so the key must be a known column and the value
 * must have that column's type. `defaults` is the whitelist: `theme`, plus any
 * key whose default is a boolean.
 */
export function parseSettingUpdate<T extends BaseSettings>(
  key: unknown,
  value: unknown,
  defaults: T,
): Partial<T> | null {
  if (typeof key !== 'string' || !Object.hasOwn(defaults, key)) return null;
  if (key === 'theme') {
    return typeof value === 'string' && THEMES.includes(value)
      ? ({ theme: value } as Partial<T>)
      : null;
  }
  const isToggle = typeof defaults[key as keyof T] === 'boolean';
  return isToggle && typeof value === 'boolean'
    ? ({ [key]: value } as Partial<T>)
    : null;
}
