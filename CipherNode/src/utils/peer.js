import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PEER_ID_KEY = '@cipher_peer_id';
const PEER_NAME_KEY = '@cipher_peer_name';
const PEER_PHONE_KEY = '@cipher_peer_phone';

// Timeout wrapper — prevents AsyncStorage from hanging indefinitely
function withTimeout(promise, ms = 3000, fallback) {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
    ]);
}

function generateId() {
    const array = new Uint8Array(16);
    global.crypto.getRandomValues(array);

    // Set UUID v4 specific bits
    array[6] = (array[6] & 0x0f) | 0x40; // Version 4
    array[8] = (array[8] & 0x3f) | 0x80; // Variant 10xx

    return Array.from(array, (byte, index) => {
        const hex = byte.toString(16).padStart(2, '0');
        if (index === 4 || index === 6 || index === 8 || index === 10) {
            return '-' + hex;
        }
        return hex;
    }).join('');
}

export async function getOrCreatePeerId() {
    try {
        let id = await withTimeout(AsyncStorage.getItem(PEER_ID_KEY), 3000, null);
        if (!id) {
            id = generateId();
            // Best-effort persist — don't await so it never blocks
            AsyncStorage.setItem(PEER_ID_KEY, id).catch(() => {});
        }
        return id;
    } catch {
        return generateId();
    }
}

export async function getDisplayName() {
    try {
        return (await withTimeout(AsyncStorage.getItem(PEER_NAME_KEY), 3000, null)) || 'Anonymous';
    } catch {
        return 'Anonymous';
    }
}

export async function setDisplayName(name) {
    try {
        await AsyncStorage.setItem(PEER_NAME_KEY, name.trim() || 'Anonymous');
    } catch {}
}

export async function getPhoneNumber() {
    try {
        return (await withTimeout(AsyncStorage.getItem(PEER_PHONE_KEY), 3000, null)) || '';
    } catch {
        return '';
    }
}

export async function setPhoneNumber(phone) {
    try {
        await AsyncStorage.setItem(PEER_PHONE_KEY, (phone || '').trim());
    } catch {}
}

