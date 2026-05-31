// src/utils/transports/DedupeCache.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEDUPE_CACHE_KEY = '@ciphernode_dedupe_cache';
const MAX_CACHE_SIZE = 1000;

class DedupeCache {
    constructor() {
        this.cache = new Set();
        this.order = []; // Tracks order for rolling eviction (FIFO)
        this.initialized = false;
    }

    /**
     * Initializes the dedupe cache from persistent storage.
     */
    async initialize() {
        if (this.initialized) return;
        try {
            const raw = await AsyncStorage.getItem(DEDUPE_CACHE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    this.order = parsed;
                    this.cache = new Set(parsed);
                }
            }
        } catch (e) {
            console.warn('[DedupeCache] Failed to load cache from storage:', e);
        } finally {
            this.initialized = true;
        }
    }

    /**
     * Checks if a message ID has already been seen and processed.
     * @param {string} messageId - The unique message ID to check.
     * @returns {boolean} True if duplicate, false otherwise.
     */
    has(messageId) {
        return this.cache.has(messageId);
    }

    /**
     * Adds a message ID to the dedupe cache, evicting the oldest if limit is exceeded.
     * @param {string} messageId - The unique message ID.
     */
    async add(messageId) {
        await this.initialize();
        if (this.cache.has(messageId)) return;

        // If cache limit is exceeded, evict the oldest entry
        if (this.order.length >= MAX_CACHE_SIZE) {
            const oldest = this.order.shift();
            if (oldest) {
                this.cache.delete(oldest);
            }
        }

        this.cache.add(messageId);
        this.order.push(messageId);

        try {
            await AsyncStorage.setItem(DEDUPE_CACHE_KEY, JSON.stringify(this.order));
        } catch (e) {
            console.warn('[DedupeCache] Failed to persist cache:', e);
        }
    }

    /**
     * Clears the cache both in memory and persisted storage.
     */
    async clear() {
        this.cache.clear();
        this.order = [];
        try {
            await AsyncStorage.removeItem(DEDUPE_CACHE_KEY);
        } catch (e) {
            console.warn('[DedupeCache] Failed to clear persistent storage:', e);
        }
    }
}

export default new DedupeCache();
