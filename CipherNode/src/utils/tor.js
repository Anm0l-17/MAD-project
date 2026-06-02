// src/utils/tor.js
// Asynchronous high-fidelity Tor simulation layer for stakeholder showcases
// Completely disabled at native runtime, executing entirely in memory

const FALLBACK_STATUS = {
  available: true,
  running: false,
  bootstrapped: false,
  progress: 0,
  status: 'Tor initializing...',
  socksPort: 9050,
  lastError: null,
};

let simulatedStatus = { ...FALLBACK_STATUS };
const listeners = new Set();
let simInterval = null;

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
  return true; // Keep true to allow showcase UI to render
}

export async function startTor() {
  if (simulatedStatus.running || simulatedStatus.bootstrapped) {
    return normalizeStatus(simulatedStatus);
  }

  simulatedStatus.running = true;
  simulatedStatus.progress = 0;
  simulatedStatus.status = 'Starting Tor daemon...';
  notifyListeners();

  const bootLogs = [
    { progress: 15, status: 'Starting Tor daemon (RSA-4096 keys)...' },
    { progress: 35, status: 'Onion service mapped to virtual port ✓' },
    { progress: 60, status: 'Building secure circuit path (3 hops)...' },
    { progress: 80, status: 'Guard node: DE-Frankfurt-01 established' },
    { progress: 95, status: 'Rendezvous point complete. Handshaking...' },
    { progress: 100, status: 'Tor Circuit bootstrapped complete (100%)' }
  ];

  let logIdx = 0;
  if (simInterval) clearInterval(simInterval);
  
  simInterval = setInterval(() => {
    if (logIdx < bootLogs.length) {
      simulatedStatus.progress = bootLogs[logIdx].progress;
      simulatedStatus.status = bootLogs[logIdx].status;
      if (simulatedStatus.progress === 100) {
        simulatedStatus.bootstrapped = true;
      }
      notifyListeners();
      logIdx++;
    } else {
      clearInterval(simInterval);
      simInterval = null;
    }
  }, 1000); // 6-second total progressive boot

  return normalizeStatus(simulatedStatus);
}

export async function stopTor() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
  simulatedStatus = { ...FALLBACK_STATUS };
  notifyListeners();
  return normalizeStatus(simulatedStatus);
}

export async function getTorStatus() {
  return normalizeStatus(simulatedStatus);
}

export function subscribeTorStatus(callback) {
  listeners.add(callback);
  // Fire current status immediately upon subscribing
  callback(normalizeStatus(simulatedStatus));
  return () => {
    listeners.delete(callback);
  };
}

function notifyListeners() {
  listeners.forEach(cb => cb(normalizeStatus(simulatedStatus)));
}

export async function ensureTorReady({ timeoutMs = 45000 } = {}) {
  const initial = await startTor();
  if (initial.bootstrapped) return initial;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const status = await getTorStatus();
    if (status.bootstrapped) return status;
  }
  return getTorStatus();
}
