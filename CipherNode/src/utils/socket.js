// src/utils/socket.js
// Singleton Socket.io client — connect once, share everywhere
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL_KEY = '@cipher_relay_url';
const DEV_DEFAULT_SERVER_URL = 'http://192.168.131.1:3001';
const TOR_RUNTIME_ENABLED = false;
export const DEFAULT_SERVER_URL = __DEV__
    ? DEV_DEFAULT_SERVER_URL
    : 'http://your-relay-server:3001';

let _socket = null;
let _torActive = false;
let _torStatus = {
    running: false,
    bootstrapped: false,
    progress: 100,
    status: 'Tor disabled at runtime',
    socksPort: 9050,
    lastError: null,
};

export async function getRelayUrl() {
    try {
        const url = await AsyncStorage.getItem(SERVER_URL_KEY);
        if (!url) return DEFAULT_SERVER_URL;
        if (!isRelayUrlAllowed(url)) return DEFAULT_SERVER_URL;
        return url;
    } catch {
        return DEFAULT_SERVER_URL;
    }
}

export async function setRelayUrl(url) {
    try {
        const trimmed = (url || '').trim();
        const nextUrl = trimmed || DEFAULT_SERVER_URL;
        if (!isRelayUrlAllowed(nextUrl)) {
            throw new Error('Relay URL must be a .onion address in release builds.');
        }
        await AsyncStorage.setItem(SERVER_URL_KEY, nextUrl);
        return nextUrl;
    } catch (e) {
        console.warn('Failed to save relay URL', e);
        throw e;
    }
}

export function getSocket() {
    if (!_socket) {
        console.warn('[Socket] getSocket() called before connectSocket() was finished!');
    }
    return _socket;
}

export function isTorActive() {
    return _torActive;
}

export function getTorStatus() {
    return _torStatus;
}

function isOnionUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.hostname.endsWith('.onion');
    } catch {
        return false;
    }
}

export function isRelayUrlAllowed(url) {
    if (!TOR_RUNTIME_ENABLED) return true;
    if (__DEV__) return true;
    return isOnionUrl(url);
}

export async function connectSocket() {
    if (_socket) {
        if (_socket.connected) return _socket;
        _socket.disconnect();
    }

    const url = await getRelayUrl();
    if (!isRelayUrlAllowed(url)) {
        console.error('[Relay] URL rejected.');
        return null;
    }
    
    _socket = io(url, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
    });

    _socket.on('connect', () => {
        console.log('[Socket] Connected to relay:', url, 'ID:', _socket.id);
    });
    _socket.on('connect_error', (err) => {
        console.warn('[Socket] Connect error to', url, ':', err.message);
    });
    _socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
    });
    
    return _socket;
}

export function disconnectSocket() {
    if (_socket) {
        _socket.disconnect();
        _socket = null;
        _torActive = false;
    }
}
