import CryptoJS from 'crypto-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOrCreatePeerId } from './peer';

const STORAGE_KEY = '@ciphernode_vault';

export const Security = {
  encryptData: (text, key) => {
    try {
      return CryptoJS.AES.encrypt(text, key).toString();
    } catch (e) {
      console.error('Encryption failed', e);
      return null;
    }
  },

  decryptData: (cipherText, key) => {
    try {
      const bytes = CryptoJS.AES.decrypt(cipherText, key);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (e) {
      console.error('Decryption failed', e);
      return null;
    }
  },

  saveToVault: async (messageObj) => {
    try {
      const peerId = await getOrCreatePeerId();
      const localKey = CryptoJS.SHA256(peerId + '_vault_key').toString();
      const messages = await Security.loadVault();
      
      messages.push(messageObj);
      const payload = JSON.stringify(messages);
      const encrypted = CryptoJS.AES.encrypt(payload, localKey).toString();
      await AsyncStorage.setItem(STORAGE_KEY, encrypted);
    } catch (e) {
      console.error('Save to vault failed', e);
    }
  },

  loadVault: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      
      const peerId = await getOrCreatePeerId();
      const localKey = CryptoJS.SHA256(peerId + '_vault_key').toString();
      
      try {
        const bytes = CryptoJS.AES.decrypt(raw, localKey);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        if (decrypted) return JSON.parse(decrypted);
      } catch {
        // Fallback for unencrypted vault data compatibility
        return JSON.parse(raw);
      }
      return [];
    } catch (e) {
      console.error('Load vault failed', e);
      return [];
    }
  },

  burnData: async (messageId) => {
    try {
      const peerId = await getOrCreatePeerId();
      const localKey = CryptoJS.SHA256(peerId + '_vault_key').toString();
      const messages = await Security.loadVault();
      
      const filtered = messages.filter(m => m.id !== messageId);
      const payload = JSON.stringify(filtered);
      const encrypted = CryptoJS.AES.encrypt(payload, localKey).toString();
      await AsyncStorage.setItem(STORAGE_KEY, encrypted);
      console.log(`[BURN] Message ${messageId} deleted permanently from vault.`);
    } catch (e) {
      console.error('Burn failed', e);
    }
  }
};
