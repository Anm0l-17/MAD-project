// src/utils/transports/types.js

export const TransportType = {
    TOR: 'tor',
    BLUETOOTH: 'bluetooth',
};

/**
 * Creates a standard message envelope.
 * @param {string} id - Stable, unique message ID (UUID)
 * @param {string} roomId - Session room ID
 * @param {string} peerId - Sender's peer ID
 * @param {string} displayName - Sender's display name
 * @param {string} encrypted - AES-256 encrypted payload string
 * @param {number|null} burnDuration - Self-destruct time in seconds (or null)
 * @param {string[]} transports - Transports that successfully delivered this message
 * @returns {object} Message envelope
 */
export function createMessageEnvelope(id, roomId, peerId, displayName, encrypted, burnDuration = 5, transports = []) {
    return {
        id,
        roomId,
        peerId,
        displayName,
        encrypted,
        timestamp: Date.now(),
        burnDuration,
        transports,
    };
}
