// src/utils/encryption.js
import 'react-native-get-random-values';
import CryptoJS from 'crypto-js';

const SHARED_KEY = 'CipherNode_AES_Demo_Key_2026'; // Mock fallback key

export const generateSecureKey = () => {
    const array = new Uint8Array(32);
    global.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

export const encryptMessage = (message, key = SHARED_KEY) => {
    const ciphertext = CryptoJS.AES.encrypt(message, key).toString();
    const mac = CryptoJS.HmacSHA256(ciphertext, key).toString();
    return `${ciphertext}|${mac}`;
};

// Constant-time string comparison to prevent timing-attack side-channels on HMAC tags.
// Processes every character regardless of any mismatch (length or value) to avoid
// leaking information through execution time.
function timingSafeEqual(a, b) {
    const len = Math.max(a.length, b.length);
    // Seed diff with the length delta so different-length strings never compare equal.
    let diff = a.length ^ b.length;
    for (let i = 0; i < len; i++) {
        // charCodeAt returns NaN for out-of-bounds indices; the bitwise OR coerces
        // NaN to 0, keeping the loop running without an early exit.
        diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
}

export const decryptMessage = (encryptedStr, key = SHARED_KEY) => {
    try {
        if (!encryptedStr) return '';
        if (encryptedStr.includes('|')) {
            const [ciphertext, mac] = encryptedStr.split('|');
            const expectedMac = CryptoJS.HmacSHA256(ciphertext, key).toString();
            
            // Constant-time comparison to mitigate timing attacks
            if (!timingSafeEqual(mac, expectedMac)) {
                console.warn('[Security] HMAC verification failed! Message tampered.');
                return '[Decryption failed: Integrity violation]';
            }
            const bytes = CryptoJS.AES.decrypt(ciphertext, key);
            return bytes.toString(CryptoJS.enc.Utf8) || '[Decryption failed]';
        }
        
        // Fallback for un-MAC'ed legacy/mock messages
        const bytes = CryptoJS.AES.decrypt(encryptedStr, key);
        return bytes.toString(CryptoJS.enc.Utf8) || encryptedStr;
    } catch (e) {
        console.error('Decryption failed', e);
        return '[Decryption failed]';
    }
};

export const generateNodeId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz234567';
    const array = new Uint8Array(16);
    global.crypto.getRandomValues(array);
    let id = '';
    for (let i = 0; i < 16; i++) {
        id += chars[array[i] % chars.length];
    }
    return id + '.onion';
};

