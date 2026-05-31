// src/utils/transports/TorTransport.js
import { getSocket } from '../socket';

class TorTransport {
    constructor() {
        this.listeners = {
            connected: new Set(),
            disconnected: new Set(),
            message: new Set(),
        };

        this.isConnected = false;
        this.setupSocketListeners();
    }

    /**
     * Bind listeners to the active Socket.io instance.
     */
    setupSocketListeners() {
        const socket = getSocket();
        if (!socket) {
            // Socket might not be ready on construction, will retry when connecting
            setTimeout(() => this.setupSocketListeners(), 1000);
            return;
        }

        this.isConnected = socket.connected;

        socket.on('connect', () => {
            console.log('[TorTransport] Connected');
            this.isConnected = true;
            this.listeners.connected.forEach(cb => cb());
        });

        socket.on('disconnect', () => {
            console.log('[TorTransport] Disconnected');
            this.isConnected = false;
            this.listeners.disconnected.forEach(cb => cb());
        });

        socket.on('message', (data) => {
            console.log('[TorTransport] Message event received from socket');
            
            // Extract the prepended message ID if present (msgId::ciphertext|mac)
            if (data && data.encrypted) {
                const parts = data.encrypted.split('::');
                if (parts.length >= 2) {
                    const id = parts[0];
                    const realEncrypted = parts.slice(1).join('::');
                    
                    // Reconstruct envelope
                    const envelope = {
                        id,
                        roomId: data.roomId,
                        peerId: data.peerId,
                        displayName: data.displayName,
                        encrypted: realEncrypted,
                        burnDuration: data.burnDuration,
                        timestamp: data.ts || Date.now(),
                    };
                    
                    this.listeners.message.forEach(cb => cb(envelope));
                    return;
                }
            }
            
            // Fallback for legacy messages
            this.listeners.message.forEach(cb => cb(data));
        });
    }

    /**
     * Send message envelope over Tor Socket.io.
     * @param {object} envelope - The message envelope
     */
    async sendMessage(envelope) {
        const socket = getSocket();
        if (!socket || !socket.connected) {
            console.warn('[TorTransport] Socket disconnected, cannot send');
            return false;
        }

        // Package the stable ID as prefix in the 'encrypted' string
        // Format: msgId::ciphertext|mac
        const securePayload = `${envelope.id}::${envelope.encrypted}`;

        try {
            socket.emit('message', {
                roomId: envelope.roomId,
                peerId: envelope.peerId,
                displayName: envelope.displayName,
                encrypted: securePayload,
                burnDuration: envelope.burnDuration,
            });
            return true;
        } catch (e) {
            console.warn('[TorTransport] Emit failed:', e);
            return false;
        }
    }

    // ── Callbacks ─────────────────────────────────────────────────────────────

    subscribeConnected(callback) {
        this.listeners.connected.add(callback);
        // Fire immediately if already connected
        if (this.isConnected) callback();
        return () => this.listeners.connected.delete(callback);
    }

    subscribeDisconnected(callback) {
        this.listeners.disconnected.add(callback);
        return () => this.listeners.disconnected.delete(callback);
    }

    subscribeMessage(callback) {
        this.listeners.message.add(callback);
        return () => this.listeners.message.delete(callback);
    }
}

export default new TorTransport();
