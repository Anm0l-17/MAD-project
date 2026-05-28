import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PEER_ID_KEY = '@cipher_peer_id';
const PEER_NAME_KEY = '@cipher_peer_name';

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
        let id = await AsyncStorage.getItem(PEER_ID_KEY);
        if (!id) {
            id = generateId();
            await AsyncStorage.setItem(PEER_ID_KEY, id);
        }
        return id;
    } catch {
        return generateId(); // fallback (won't persist)
    }
}

export async function getDisplayName() {
    try {
        return (await AsyncStorage.getItem(PEER_NAME_KEY)) || 'Anonymous';
    } catch {
        return 'Anonymous';
    }
}

export async function setDisplayName(name) {
    await AsyncStorage.setItem(PEER_NAME_KEY, name.trim() || 'Anonymous');
}
