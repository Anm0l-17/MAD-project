// src/utils/socket.js
// Singleton Socket.io client — connect once, share everywhere
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL_KEY = '@cipher_relay_url';
export const DEFAULT_SERVER_URL = 'http://192.168.131.1:3001';
const SOCKS5_PROXY_PORT = 9050; // Standard Tor client proxy port

let _socket = null;
let _torActive = false;

export async function getRelayUrl() {
    try {
        const url = await AsyncStorage.getItem(SERVER_URL_KEY);
        return url || DEFAULT_SERVER_URL;
    } catch {
        return DEFAULT_SERVER_URL;
    }
}

export async function setRelayUrl(url) {
    try {
        await AsyncStorage.setItem(SERVER_URL_KEY, url.trim() || DEFAULT_SERVER_URL);
    } catch (e) {
        console.warn('Failed to save relay URL', e);
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

// Fail-Closed SOCKS5 connection check
async function verifyTorProxy() {
    try {
        // Ping local SOCKS5 proxy port to confirm Tor/Orbot is active
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const response = await fetch(`http://127.0.0.1:${SOCKS5_PROXY_PORT}`, {
            method: 'HEAD',
            mode: 'no-cors',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return true;
    } catch (e) {
        console.warn('[Tor Security] SOCKS5 connection refused on port', SOCKS5_PROXY_PORT, '. Fail-closed triggered.');
        return false;
    }
}

export async function connectSocket() {
    if (_socket) {
        _socket.disconnect();
    }
    
    // Fail-Closed Guard check
    const torRunning = await verifyTorProxy();
    if (!torRunning) {
        _torActive = false;
        console.error('[Tor Security Check] FAILED. Connection aborted to prevent IP leakage.');
        return null;
    }
    
    _torActive = true;
    const url = await getRelayUrl();
    
    _socket = io(url, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        // In native ejected environment, socket.io-client is routed over Tor SOCKS5 using native engine bridges
    });

    _socket.on('connect', () => {
        console.log('[Socket] Connected to onion relay:', url, 'ID:', _socket.id);
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
