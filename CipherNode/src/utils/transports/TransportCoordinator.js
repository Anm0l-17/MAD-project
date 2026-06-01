// src/utils/transports/TransportCoordinator.js
import uuid from 'react-native-uuid';
import TorTransport from './TorTransport';
import BluetoothTransport from './BluetoothTransport';
import DedupeCache from './DedupeCache';
import MessageQueue from './MessageQueue';
import { appendMessage, updateMessageTransports } from '../storage';
import { createMessageEnvelope, TransportType } from './types';

class TransportCoordinator {
    constructor() {
        this.listeners = {
            message: new Set(),
            transportUpdate: new Set(), // Fired when a duplicate confirms delivery over the second path
            connectionStatus: new Set(),
        };

        this.initialized = false;
        this.activeRoomId = null;
        this.myPeerId = null;
        this.myDisplayName = null;
        this.theirPeerId = null;

        this.setupTransports();
    }

    /**
     * Initializes the coordinator and Dedupe Cache.
     */
    async initialize() {
        if (this.initialized) return;
        await DedupeCache.initialize();
        this.initialized = true;
    }

    /**
     * Configures listeners on individual transports and links queue flush triggers.
     * @private
     */
    setupTransports() {
        // ── Tor Transports ────────────────────────────────────────────────────
        TorTransport.subscribeConnected(() => {
            console.log('[TransportCoordinator] Tor is online. Flushing queue...');
            this.flushQueue(TransportType.TOR);
            this.emitConnectionStatus();
        });

        TorTransport.subscribeDisconnected(() => {
            this.emitConnectionStatus();
        });

        TorTransport.subscribeMessage((envelope) => {
            this.handleIncomingMessage(envelope, TransportType.TOR);
        });

        // ── Bluetooth Transports ──────────────────────────────────────────────
        BluetoothTransport.subscribeConnected(() => {
            console.log('[TransportCoordinator] Bluetooth connected. Flushing queue...');
            this.flushQueue(TransportType.BLUETOOTH);
            this.emitConnectionStatus();
        });

        BluetoothTransport.subscribeDisconnected(() => {
            this.emitConnectionStatus();
        });

        BluetoothTransport.subscribeMessage((messageStr) => {
            try {
                const envelope = JSON.parse(messageStr);
                this.handleIncomingMessage(envelope, TransportType.BLUETOOTH);
            } catch (e) {
                console.warn('[TransportCoordinator] Failed to parse Bluetooth message envelope:', e);
            }
        });
    }

    /**
     * Sets session metadata for active messaging room.
     */
    setSession(roomId, myPeerId, myDisplayName, theirPeerId) {
        this.activeRoomId = roomId;
        this.myPeerId = myPeerId;
        this.myDisplayName = myDisplayName;
        this.theirPeerId = theirPeerId;
    }

    /**
     * Starts Bluetooth Server and Active Scanner for symmetric P2P pairing.
     */
    async startBluetoothSession(myPeerId, theirPeerId, minRssi = -80) {
        await this.initialize();
        const supported = await BluetoothTransport.isSupported();
        if (!supported) return;

        const enabled = await BluetoothTransport.isEnabled();
        if (!enabled) {
            console.log('[TransportCoordinator] Bluetooth is supported but turned off.');
            return;
        }

        // Symmetric active-connect: both advertise RFCOMM server AND run discovery client
        await BluetoothTransport.startServer(myPeerId);
        await BluetoothTransport.startDiscovery(theirPeerId, minRssi);
    }

    /**
     * Stop and clean up Bluetooth session resources when leaving room.
     */
    async stopBluetoothSession() {
        await BluetoothTransport.disconnect();
    }

    /**
     * Sends a secure message concurrently across all active transports, queuing on failures.
     * @param {string} contactId - Recipient contact ID
     * @param {string} text - Plain text message
     * @param {string} encrypted - AES-encrypted ciphertext with HMAC
     * @param {number|null} burnDuration - Self destruct time
     */
    async sendMessage(contactId, text, encrypted, burnDuration = 5) {
        await this.initialize();
        const msgId = uuid.v4();
        
        const envelope = createMessageEnvelope(
            msgId,
            this.activeRoomId,
            this.myPeerId,
            this.myDisplayName,
            encrypted,
            burnDuration,
            [] // Deliveries will populate dynamically
        );

        // 1. Immediately append to persistent storage (so it shows in UI instantly)
        const uiMessage = {
            id: msgId,
            contactId,
            text,
            encrypted,
            senderName: this.myDisplayName,
            isOutgoing: true,
            timestamp: envelope.timestamp,
            burnDuration,
            isRead: true,
            burned: false,
            transports: [], // Will fill up as deliveries succeed
        };
        await appendMessage(contactId, uiMessage);

        let sentViaAny = false;

        // 2. Transmit via Tor if active
        if (TorTransport.isConnected) {
            const success = await TorTransport.sendMessage(envelope);
            if (success) {
                envelope.transports.push(TransportType.TOR);
                await updateMessageTransports(contactId, msgId, TransportType.TOR);
                sentViaAny = true;
            } else {
                await MessageQueue.queueMessage(TransportType.TOR, envelope);
            }
        } else {
            await MessageQueue.queueMessage(TransportType.TOR, envelope);
        }

        // 3. Transmit via Bluetooth if connected
        if (BluetoothTransport.isConnected) {
            const success = await BluetoothTransport.sendMessage(JSON.stringify(envelope));
            if (success) {
                envelope.transports.push(TransportType.BLUETOOTH);
                await updateMessageTransports(contactId, msgId, TransportType.BLUETOOTH);
                sentViaAny = true;
            } else {
                await MessageQueue.queueMessage(TransportType.BLUETOOTH, envelope);
            }
        } else {
            // Queue for later Bluetooth recovery if enabled
            const enabled = await BluetoothTransport.isEnabled();
            if (enabled) {
                await MessageQueue.queueMessage(TransportType.BLUETOOTH, envelope);
            }
        }

        // Return updated UI message model
        return {
            ...uiMessage,
            transports: envelope.transports,
        };
    }

    /**
     * Processes incoming messages, applies deduplication, and records transport badges.
     * @private
     */
    async handleIncomingMessage(envelope, transportSource) {
        await this.initialize();

        // Guard: Verify message is for the currently active room
        if (envelope.roomId !== this.activeRoomId) {
            console.log('[TransportCoordinator] Received message for inactive room. Ignored.');
            return;
        }

        const contactId = envelope.peerId;

        // ── Case A: Duplicate message arrived via alternative path ────────────────
        if (DedupeCache.has(envelope.id)) {
            console.log(`[TransportCoordinator] Duplicate detected for ${envelope.id} via ${transportSource}. Updating badges...`);
            
            // Add the new transport to the storage metadata
            await updateMessageTransports(contactId, envelope.id, transportSource);

            // Notify UI to re-render badges for the existing bubble
            this.listeners.transportUpdate.forEach(cb => cb({
                messageId: envelope.id,
                transport: transportSource,
            }));
            return;
        }

        // ── Case B: Fresh message arrived ──────────────────────────────────────────
        console.log(`[TransportCoordinator] Fresh message ${envelope.id} received via ${transportSource}`);
        
        // 1. Mark as processed in cache
        await DedupeCache.add(envelope.id);

        // 2. Set transport metadata
        const transports = [transportSource];

        // 3. Save to storage
        const uiMessage = {
            id: envelope.id,
            contactId,
            text: '', // To be decrypted inside ConversationScreen
            encrypted: envelope.encrypted,
            senderName: envelope.displayName,
            isOutgoing: false,
            timestamp: envelope.timestamp,
            burnDuration: envelope.burnDuration ?? 5,
            isRead: false,
            burned: false,
            transports,
        };
        await appendMessage(contactId, uiMessage);

        // 4. Notify UI to append message bubble
        this.listeners.message.forEach(cb => cb(uiMessage));
    }

    /**
     * Flushes stored messages in queue for a transport that reconnected.
     * @private
     */
    async flushQueue(transport) {
        await this.initialize();
        const queue = await MessageQueue.getQueue(transport);
        if (queue.length === 0) return;

        console.log(`[TransportCoordinator] Flushing ${queue.length} queued messages for ${transport}...`);

        for (const envelope of queue) {
            let success = false;
            if (transport === TransportType.TOR) {
                success = await TorTransport.sendMessage(envelope);
            } else if (transport === TransportType.BLUETOOTH) {
                success = await BluetoothTransport.sendMessage(JSON.stringify(envelope));
            }

            if (success) {
                const contactId = envelope.peerId === this.myPeerId ? this.theirPeerId : envelope.peerId;
                await updateMessageTransports(contactId, envelope.id, transport);
                await MessageQueue.removeMessage(transport, envelope.id);
                
                // Notify UI to update transport badge if this was our own message
                if (envelope.peerId === this.myPeerId) {
                    this.listeners.transportUpdate.forEach(cb => cb({
                        messageId: envelope.id,
                        transport,
                    }));
                }
            } else {
                // Network failed again, cease flushing
                console.log(`[TransportCoordinator] Network failed during flush on ${transport}. Aborting.`);
                break;
            }
        }
    }

    /**
     * Dispatches current transport connection status to listeners.
     * @private
     */
    emitConnectionStatus() {
        const status = {
            torConnected: TorTransport.isConnected,
            bluetoothConnected: BluetoothTransport.isConnected,
        };
        this.listeners.connectionStatus.forEach(cb => cb(status));
    }

    // ── Callbacks ─────────────────────────────────────────────────────────────

    subscribeMessage(callback) {
        this.listeners.message.add(callback);
        return () => this.listeners.message.delete(callback);
    }

    subscribeTransportUpdate(callback) {
        this.listeners.transportUpdate.add(callback);
        return () => this.listeners.transportUpdate.delete(callback);
    }

    subscribeConnectionStatus(callback) {
        this.listeners.connectionStatus.add(callback);
        // Call immediately with initial status
        callback({
            torConnected: TorTransport.isConnected,
            bluetoothConnected: BluetoothTransport.isConnected,
        });
        return () => this.listeners.connectionStatus.delete(callback);
    }
}

export default new TransportCoordinator();
