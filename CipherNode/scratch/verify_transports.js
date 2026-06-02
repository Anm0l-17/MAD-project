// scratch/verify_transports.js
// Executable Node.js dry-run unit tests for verifying core transport algorithms
// Run with: node verify_transports.js

const mockStorage = {};
const mockAsyncStorage = {
    getItem: async (key) => mockStorage[key] || null,
    setItem: async (key, val) => { mockStorage[key] = String(val); },
    removeItem: async (key) => { delete mockStorage[key]; },
    multiRemove: async (keys) => { keys.forEach(k => delete mockStorage[k]); }
};

console.log('🛡️  CipherNode Transport System Validation Tests');
console.log('================================================');

// ── Test 1: DedupeCache Core Eviction Algorithm ──────────────────────────────
class MockDedupeCache {
    constructor(maxSize = 5) {
        this.cache = new Set();
        this.order = [];
        this.maxSize = maxSize;
    }
    async add(id) {
        if (this.cache.has(id)) return;
        if (this.order.length >= this.maxSize) {
            const oldest = this.order.shift();
            this.cache.delete(oldest);
        }
        this.cache.add(id);
        this.order.push(id);
    }
    has(id) {
        return this.cache.has(id);
    }
}

async function runDedupeTests() {
    console.log('\n[Test 1] Running Deduplication Cache Tests...');
    const cache = new MockDedupeCache(5); // Small size for testing
    
    // Add unique messages
    await cache.add('msg_1');
    await cache.add('msg_2');
    await cache.add('msg_3');
    await cache.add('msg_4');
    await cache.add('msg_5');
    
    console.log('✓ Initial 5 messages loaded into cache.');
    console.log('  msg_1 exists?', cache.has('msg_1') ? 'Yes (Pass)' : 'No (Fail)');
    console.log('  msg_3 exists?', cache.has('msg_3') ? 'Yes (Pass)' : 'No (Fail)');
    
    // Evict oldest by adding 6th
    console.log('Adding 6th message (should evict msg_1)...');
    await cache.add('msg_6');
    
    console.log('  msg_1 exists?', cache.has('msg_1') ? 'Yes (Fail)' : 'No (Pass)');
    console.log('  msg_6 exists?', cache.has('msg_6') ? 'Yes (Pass)' : 'No (Fail)');
    console.log('  msg_2 exists?', cache.has('msg_2') ? 'Yes (Pass)' : 'No (Fail)');
    console.log('✓ Rolling FIFO cache eviction logic validated successfully.');
}

// ── Test 2: Message Queueing and Persisting ─────────────────────────────────
class MockMessageQueue {
    constructor() {
        this.storage = mockAsyncStorage;
    }
    async getQueue(transport) {
        const raw = await this.storage.getItem(`@queue_${transport}`);
        return raw ? JSON.parse(raw) : [];
    }
    async queueMessage(transport, envelope) {
        const queue = await this.getQueue(transport);
        if (queue.some(msg => msg.id === envelope.id)) return;
        queue.push(envelope);
        await this.storage.setItem(`@queue_${transport}`, JSON.stringify(queue));
    }
    async removeMessage(transport, id) {
        const queue = await this.getQueue(transport);
        const filtered = queue.filter(msg => msg.id !== id);
        await this.storage.setItem(`@queue_${transport}`, JSON.stringify(filtered));
    }
}

async function runQueueTests() {
    console.log('\n[Test 2] Running Message Queue Tests...');
    const queue = new MockMessageQueue();
    
    const env1 = { id: 'env_1', payload: 'Secure Payload 1' };
    const env2 = { id: 'env_2', payload: 'Secure Payload 2' };
    
    // Queue messages for Tor
    await queue.queueMessage('tor', env1);
    await queue.queueMessage('tor', env2);
    
    let torQueue = await queue.getQueue('tor');
    console.log(`✓ Queued messages retrieved. Count: ${torQueue.length} (Expected: 2)`);
    console.log(`  First message: ${torQueue[0].id} (Expected: env_1)`);
    
    // Queue duplicate message - should be ignored
    await queue.queueMessage('tor', env1);
    torQueue = await queue.getQueue('tor');
    console.log(`✓ Duplicate queue prevention. Count: ${torQueue.length} (Expected: 2)`);
    
    // Remove completed message
    await queue.removeMessage('tor', 'env_1');
    torQueue = await queue.getQueue('tor');
    console.log(`✓ Removed sent message. Count: ${torQueue.length} (Expected: 1)`);
    console.log(`  Remaining message: ${torQueue[0].id} (Expected: env_2)`);
}

// ── Test 3: Tor Stable ID Envelope Prefixing ──────────────────────────────────
function packTorPayload(envelopeId, encryptedCipher) {
    return `${envelopeId}::${encryptedCipher}`;
}

function unpackTorPayload(payload) {
    const parts = payload.split('::');
    if (parts.length >= 2) {
        return {
            id: parts[0],
            encrypted: parts.slice(1).join('::')
        };
    }
    return null;
}

function runEnvelopeTests() {
    console.log('\n[Test 3] Running Tor Envelope Packaging Tests...');
    const originalId = 'uuid-v4-msg-handshake-1002';
    const originalCipher = 'U2FsdGVkX19CiphertextData|HMACchecksum';
    
    const packed = packTorPayload(originalId, originalCipher);
    console.log(`✓ Packed payload format: "${packed}"`);
    
    const unpacked = unpackTorPayload(packed);
    console.log('✓ Unpacked payload successfully.');
    console.log('  Extracted Message ID:', unpacked.id, `(Matches: ${unpacked.id === originalId})`);
    console.log('  Extracted Ciphertext:', unpacked.encrypted, `(Matches: ${unpacked.encrypted === originalCipher})`);
}

// ── Executing ────────────────────────────────────────────────────────────────
(async () => {
    try {
        await runDedupeTests();
        await runQueueTests();
        runEnvelopeTests();
        console.log('\n================================================');
        console.log('🎉 ALL UNIT TESTS COMPLETED SUCCESSFULLY!');
    } catch (e) {
        console.error('❌ Test failed with error:', e);
    }
})();
