// src/utils/storage.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import { getOrCreatePeerId } from './peer';

const MESSAGES_KEY = '@ciphernode_messages';
const CONTACTS_KEY = '@ciphernode_contacts';

export const saveMessages = async (contactId, messages) => {
    try {
        const peerId = await getOrCreatePeerId();
        const localKey = CryptoJS.SHA256(peerId + '_storage_key').toString();
        const all = await getAllMessages();
        all[contactId] = messages;
        
        const payload = JSON.stringify(all);
        const encrypted = CryptoJS.AES.encrypt(payload, localKey).toString();
        await AsyncStorage.setItem(MESSAGES_KEY, encrypted);
    } catch (e) { console.error('saveMessages:', e); }
};

export const getAllMessages = async () => {
    try {
        const raw = await AsyncStorage.getItem(MESSAGES_KEY);
        if (!raw) return {};
        
        const peerId = await getOrCreatePeerId();
        const localKey = CryptoJS.SHA256(peerId + '_storage_key').toString();
        
        try {
            const bytes = CryptoJS.AES.decrypt(raw, localKey);
            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
            if (decrypted) return JSON.parse(decrypted);
        } catch {
            // If decryption fails, try parsing raw text for legacy backward compatibility
            return JSON.parse(raw);
        }
        return {};
    } catch { return {}; }
};

export const getMessages = async (contactId) => {
    const all = await getAllMessages();
    return all[contactId] || [];
};

export const deleteMessage = async (contactId, messageId) => {
    const msgs = await getMessages(contactId);
    const filtered = msgs.filter(m => m.id !== messageId);
    await saveMessages(contactId, filtered);
    return filtered;
};

export const clearAll = async () => {
    await AsyncStorage.multiRemove([MESSAGES_KEY, CONTACTS_KEY]);
};
