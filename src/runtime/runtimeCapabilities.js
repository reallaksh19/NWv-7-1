// src/runtime/runtimeCapabilities.js
export function getRuntimeCapabilities() {
  const isBrowser = typeof window !== 'undefined';
  const hostname = isBrowser ? window.location.hostname : '';
  const isStaticHost = /github\.io$/i.test(hostname);

  return {
    isBrowser,
    isStaticHost,
    canUseBackendApi: !isStaticHost,
    preferSnapshots: isStaticHost,
    allowWideFeedFetch: !isStaticHost,
    allowLiveWeather: !isStaticHost,
    allowLiveMarket: !isStaticHost,
    allowRemoteSettingsSync: !isStaticHost,
    runtimeLabel: isStaticHost ? 'static-host' : 'full-runtime'
  };
}