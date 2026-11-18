import { randomInt } from 'node:crypto';

const canonicalOrigin = 'https://plotstudio.pro';
const aliasNames = Object.freeze(['e82', 'k47', 'm13', 'r68', 't29', 'v54', 'x31', 'z76']);
export const STUDIO_ALIAS_HOSTS = Object.freeze(aliasNames.map(name => `dns-${name}.plotstudio.pro`));
export const STUDIO_ALIAS_ORIGINS = Object.freeze(STUDIO_ALIAS_HOSTS.map(host => `https://${host}`));
export const STUDIO_WORKSPACE_PATH = '/studio/?workspace=1';

export function isStudioAliasHost(host) {
  return typeof host === 'string' && STUDIO_ALIAS_HOSTS.includes(host.toLowerCase());
}

export function isStudioAliasOrigin(origin) {
  return STUDIO_ALIAS_ORIGINS.includes(origin);
}

export function createStudioRotation({ origin, enabled }) {
  function pick(previous) {
    const candidates = STUDIO_ALIAS_ORIGINS.filter(alias => alias !== previous);
    return candidates[randomInt(candidates.length)];
  }

  return { enabled: enabled === true && origin === canonicalOrigin, pick };
}
