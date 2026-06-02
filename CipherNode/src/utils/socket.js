// src/utils/socket.js
// Singleton loopback Socket.io mock — completely dormant network-wise
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTorStatus as getTorProgress } from './tor';

const SERVER_URL_KEY = '@cipher_relay_url';
export const DEFAULT_SERVER_URL = 'http://ciphernode-onion-relay.onion';

class MockSocket {
    constructor() {
        this.connected = true;
        this.id = 'mock_session_onion_socket_1002';
        this.listeners = {};
    }

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
        
        // Auto-trigger successful socket events immediately to keep legacy flows happy
        if (event === 'connect') {
            setTimeout(() => callback(), 100);
        }
        if (event === 'registered') {
            setTimeout(() => callback({ peerId: 'me', displayName: 'OPERATOR' }), 200);
        }
    }

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    emit(event, data) {
        console.log(`[MockSocket] Emitted event [${event}] with payload:`, data);
    }

    disconnect() {
        this.connected = false;
        console.log('[MockSocket] Disconnected cleanly');
    }
}

let _socket = new MockSocket();

export async function getRelayUrl() {
    return DEFAULT_SERVER_URL;
}

export async function setRelayUrl(url) {
    return DEFAULT_SERVER_URL;
}

export function getSocket() {
    return _socket;
}

export function isTorActive() {
    return true; // Showcase Tor as always circuit active
}

export async function getTorStatus() {
    return await getTorProgress();
}

export async function connectSocket() {
    if (!_socket) {
        _socket = new MockSocket();
    }
    _socket.connected = true;
    return _socket;
}

export function disconnectSocket() {
    if (_socket) {
        _socket.disconnect();
    }
}

export function isRelayUrlAllowed(url) {
    return true;
}
