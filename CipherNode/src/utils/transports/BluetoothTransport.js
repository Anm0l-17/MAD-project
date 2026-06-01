// src/utils/transports/BluetoothTransport.js
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const { BluetoothModule } = NativeModules;
const bluetoothEmitter = BluetoothModule ? new NativeEventEmitter(BluetoothModule) : null;

class BluetoothTransport {
    constructor() {
        this.listeners = {
            connected: new Set(),
            disconnected: new Set(),
            message: new Set(),
            discovery: new Set(),
        };

        this.isConnected = false;
        this.isScanning = false;
        this.setupSubscriptions();
    }

    /**
     * Set up native event subscriptions.
     * @private
     */
    setupSubscriptions() {
        if (!bluetoothEmitter) return;

        bluetoothEmitter.addListener('onBluetoothPeerConnected', (data) => {
            console.log('[BluetoothTransport] Peer connected natively:', data.peerName);
            this.isConnected = true;
            this.listeners.connected.forEach(cb => cb(data));
        });

        bluetoothEmitter.addListener('onBluetoothPeerDisconnected', () => {
            console.log('[BluetoothTransport] Peer disconnected natively');
            this.isConnected = false;
            this.listeners.disconnected.forEach(cb => cb());
        });

        bluetoothEmitter.addListener('onBluetoothMessageReceived', (data) => {
            console.log('[BluetoothTransport] Message received natively');
            this.listeners.message.forEach(cb => cb(data.message));
        });

        bluetoothEmitter.addListener('onBluetoothDiscoveryStatus', (data) => {
            console.log('[BluetoothTransport] Discovery scanning status:', data.scanning);
            this.isScanning = data.scanning;
            this.listeners.discovery.forEach(cb => cb(data.scanning));
        });
    }

    /**
     * Checks if Bluetooth is supported on the device.
     */
    async isSupported() {
        if (Platform.OS !== 'android' || !BluetoothModule) return false;
        try {
            return await BluetoothModule.isBluetoothSupported();
        } catch {
            return false;
        }
    }

    /**
     * Checks if Bluetooth is enabled on the device.
     */
    async isEnabled() {
        if (Platform.OS !== 'android' || !BluetoothModule) return false;
        try {
            return await BluetoothModule.isBluetoothEnabled();
        } catch {
            return false;
        }
    }

    /**
     * Starts the Bluetooth server listening for connection from a specific room.
     * @param {string} myPeerId - My Peer ID (will be set as Bluetooth local name)
     */
    async startServer(myPeerId) {
        if (Platform.OS !== 'android' || !BluetoothModule) return false;
        try {
            console.log('[BluetoothTransport] Starting P2P RFCOMM Server for PeerId:', myPeerId);
            return await BluetoothModule.startBluetoothServer(myPeerId);
        } catch (e) {
            console.warn('[BluetoothTransport] Failed to start Bluetooth Server:', e.message);
            return false;
        }
    }

    /**
     * Starts active Bluetooth discovery to locate and connect to a peer.
     * @param {string} theirPeerId - Peer ID to search for
     */
    async startDiscovery(theirPeerId, minRssi = -80) {
        if (Platform.OS !== 'android' || !BluetoothModule) return false;
        try {
            console.log('[BluetoothTransport] Starting P2P active discovery for peer:', theirPeerId, 'minRSSI:', minRssi);
            return await BluetoothModule.startBluetoothDiscovery(theirPeerId, minRssi);
        } catch (e) {
            console.warn('[BluetoothTransport] Failed to start Bluetooth Discovery:', e.message);
            return false;
        }
    }

    /**
     * Sends a raw payload string over the established Bluetooth connection.
     * @param {string} payload - The message payload
     */
    async sendMessage(payload) {
        if (Platform.OS !== 'android' || !BluetoothModule || !this.isConnected) return false;
        try {
            return await BluetoothModule.sendMessage(payload);
        } catch (e) {
            console.warn('[BluetoothTransport] Failed to send Bluetooth message:', e.message);
            return false;
        }
    }

    /**
     * Closes the server socket, client socket, streams, and cancels discovery.
     */
    async disconnect() {
        this.isConnected = false;
        this.isScanning = false;
        if (Platform.OS !== 'android' || !BluetoothModule) return;
        try {
            console.log('[BluetoothTransport] Disconnecting and cleaning up Bluetooth resources');
            await BluetoothModule.disconnect();
        } catch (e) {
            console.warn('[BluetoothTransport] Failed to disconnect cleanly:', e.message);
        }
    }

    // ── Callbacks ─────────────────────────────────────────────────────────────

    subscribeConnected(callback) {
        this.listeners.connected.add(callback);
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

    subscribeDiscovery(callback) {
        this.listeners.discovery.add(callback);
        return () => this.listeners.discovery.delete(callback);
    }
}

export default new BluetoothTransport();
