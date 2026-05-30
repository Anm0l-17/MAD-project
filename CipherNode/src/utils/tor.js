import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const { TorModule } = NativeModules;
const torEmitter = TorModule ? new NativeEventEmitter(TorModule) : null;

const FALLBACK_STATUS = {
  available: false,
  running: false,
  bootstrapped: false,
  progress: 0,
  status: 'Tor module unavailable',
  socksPort: 9050,
  lastError: 'Tor module unavailable',
};

function normalizeStatus(status) {
  if (!status) return { ...FALLBACK_STATUS };
  return {
    available: true,
    running: Boolean(status.running),
    bootstrapped: Boolean(status.bootstrapped),
    progress: Number.isFinite(status.progress) ? status.progress : 0,
    status: status.status || '',
    socksPort: status.socksPort || 9050,
    lastError: status.lastError || null,
  };
}

export function isTorAvailable() {
  return Boolean(TorModule) && Platform.OS === 'android';
}

export async function startTor() {
  if (!TorModule || Platform.OS !== 'android') {
    return { ...FALLBACK_STATUS };
  }
  try {
    const status = await TorModule.startTor();
    return normalizeStatus(status);
  } catch (e) {
    return {
      ...FALLBACK_STATUS,
      available: true,
      status: e?.message || 'Tor start failed',
      lastError: e?.message || 'Tor start failed',
    };
  }
}

export async function stopTor() {
  if (!TorModule || Platform.OS !== 'android') return null;
  return TorModule.stopTor();
}

export async function getTorStatus() {
  if (!TorModule || Platform.OS !== 'android') {
    return { ...FALLBACK_STATUS };
  }
  try {
    const status = await TorModule.getStatus();
    return normalizeStatus(status);
  } catch (e) {
    return {
      ...FALLBACK_STATUS,
      available: true,
      status: e?.message || 'Tor status failed',
      lastError: e?.message || 'Tor status failed',
    };
  }
}

export function subscribeTorStatus(callback) {
  if (!torEmitter) return () => {};
  const subscription = torEmitter.addListener('TorStatus', (status) => {
    callback(normalizeStatus(status));
  });
  return () => subscription.remove();
}

export async function ensureTorReady({ timeoutMs = 45000 } = {}) {
  const initial = await startTor();
  if (initial.bootstrapped) return initial;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const status = await getTorStatus();
    if (status.bootstrapped) return status;
  }
  return getTorStatus();
}
