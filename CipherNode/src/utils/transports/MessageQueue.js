// src/utils/transports/MessageQueue.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEYS = {
    tor: '@ciphernode_queue_tor',
    bluetooth: '@ciphernode_queue_bluetooth',
};

class MessageQueue {
    /**
     * Gets the key for a specific transport.
     * @private
     */
    _getKey(transport) {
        const key = QUEUE_KEYS[transport.toLowerCase()];
        if (!key) throw new Error(`[MessageQueue] Unsupported transport: ${transport}`);
        return key;
    }

    /**
     * Retrieves the entire message queue for a given transport.
     * @param {string} transport - 'tor' or 'bluetooth'
     * @returns {Promise<object[]>} Array of message envelopes
     */
    async getQueue(transport) {
        try {
            const key = this._getKey(transport);
            const raw = await AsyncStorage.getItem(key);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn(`[MessageQueue] Failed to read queue for ${transport}:`, e);
            return [];
        }
    }

    /**
     * Appends a message envelope to a transport's queue.
     * @param {string} transport - 'tor' or 'bluetooth'
     * @param {object} envelope - The message envelope to store
     */
    async queueMessage(transport, envelope) {
        try {
            const key = this._getKey(transport);
            const queue = await this.getQueue(transport);
            
            // Avoid duplicates in the queue itself
            if (queue.some(msg => msg.id === envelope.id)) return;

            queue.push(envelope);
            await AsyncStorage.setItem(key, JSON.stringify(queue));
            console.log(`[MessageQueue] Queued message ${envelope.id} for ${transport}`);
        } catch (e) {
            console.warn(`[MessageQueue] Failed to queue message for ${transport}:`, e);
        }
    }

    /**
     * Removes a message from a transport's queue upon successful delivery.
     * @param {string} transport - 'tor' or 'bluetooth'
     * @param {string} messageId - Unique ID of the message to remove
     */
    async removeMessage(transport, messageId) {
        try {
            const key = this._getKey(transport);
            const queue = await this.getQueue(transport);
            const filtered = queue.filter(msg => msg.id !== messageId);
            await AsyncStorage.setItem(key, JSON.stringify(filtered));
            console.log(`[MessageQueue] Removed message ${messageId} from ${transport} queue`);
        } catch (e) {
            console.warn(`[MessageQueue] Failed to remove message from ${transport} queue:`, e);
        }
    }

    /**
     * Clear all queued messages for a transport.
     * @param {string} transport - 'tor' or 'bluetooth'
     */
    async clearQueue(transport) {
        try {
            const key = this._getKey(transport);
            await AsyncStorage.removeItem(key);
        } catch (e) {
            console.warn(`[MessageQueue] Failed to clear queue for ${transport}:`, e);
        }
    }
}

export default new MessageQueue();
