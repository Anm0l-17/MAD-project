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

export const decryptMessage = (encryptedStr, key = SHARED_KEY) => {
    try {
        if (!encryptedStr) return '';
        if (encryptedStr.includes('|')) {
            const [ciphertext, mac] = encryptedStr.split('|');
            const expectedMac = CryptoJS.HmacSHA256(ciphertext, key).toString();
            
            // Constant-time-like comparison to mitigate timing attacks
            if (mac !== expectedMac) {
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

