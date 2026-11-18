export const STUDIO_CONTENT_HOSTS = Object.freeze([
  'cnt2-78.142.195.195.plotstudio.pro',
  'cnt2-185.254.74.74.plotstudio.pro',
  'cnt2-45.147.51.51.plotstudio.pro',
  'cnt2-185.248.86.86.plotstudio.pro',
  'cnt2-185.194.53.53.plotstudio.pro',
  'cnt2-45.130.20.20.plotstudio.pro',
  'cnt2-45.130.21.21.plotstudio.pro',
  'cnt2-94.156.35.72.plotstudio.pro',
  'cnt2-37.235.48.250.plotstudio.pro',
  'cnt2-188.190.19.10.plotstudio.pro',
]);

export const STUDIO_CONTENT_ORIGINS = Object.freeze(STUDIO_CONTENT_HOSTS.map(host => `https://${host}`));

export function isStudioContentHost(host) {
  return typeof host === 'string' && STUDIO_CONTENT_HOSTS.includes(host.toLowerCase());
}
