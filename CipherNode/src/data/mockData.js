// src/data/mockData.js
// NOTE: No encryption calls at module load time — crypto polyfill may not be ready yet.
// Encryption happens at runtime inside components/screens.

export const MY_NODE = {
    id: 'me',
    alias: 'OPERATOR',
    onion: 'v33x7p2mka4k9qr.onion',
    pubkey: 'RSA-4096:3A9F...C72E',
};

export const CONTACTS = [
    { id: 'c1', alias: 'Rajan S.', onion: 'r8m2n1qj7h3.onion', hue: 220, online: true, isVault: false },
    { id: 'c2', alias: 'Priya M.', onion: 'b5c9k3fx2p1.onion', hue: 160, online: true, isVault: false },
    { id: 'c3', alias: 'Arjun V.', onion: 'm7a4d2xn8q5.onion', hue: 40, online: false, isVault: false },
    { id: 'c4', alias: 'Node-Alpha', onion: 'q9f3t8uw1x2.onion', hue: 140, online: true, isVault: true },
];

// Encrypted field is a placeholder shown for demo — real encryption happens when sending
const ENC_STUB = 'U2FsdGVkX1+DEMO==';

export const INITIAL_MESSAGES = {
    c1: [
        {
            id: 'm1', contactId: 'c1',
            text: 'Circuit check: 4 hops confirmed.',
            encrypted: ENC_STUB,
            isOutgoing: false, timestamp: Date.now() - 600000,
            burnDuration: 60, isRead: false, burned: false,
        },
        {
            id: 'm2', contactId: 'c1',
            text: 'Copy. Sending payload now.',
            encrypted: ENC_STUB,
            isOutgoing: true, timestamp: Date.now() - 540000,
            burnDuration: null, isRead: true, burned: false,
        },
        {
            id: 'm3', contactId: 'c1',
            text: 'Checksum verified. Clean transfer ✓',
            encrypted: ENC_STUB,
            isOutgoing: false, timestamp: Date.now() - 480000,
            burnDuration: 45, isRead: false, burned: false,
        },
    ],
    c2: [
        {
            id: 'm4', contactId: 'c2',
            text: 'Lab keys uploaded to vault.',
            encrypted: ENC_STUB,
            isOutgoing: false, timestamp: Date.now() - 3600000,
            burnDuration: null, isRead: true, burned: false,
        },
        {
            id: 'm5', contactId: 'c2',
            text: 'Confirmed. Circuit verified.',
            encrypted: ENC_STUB,
            isOutgoing: true, timestamp: Date.now() - 3500000,
            burnDuration: null, isRead: true, burned: false,
        },
    ],
    c3: [],
    c4: [
        {
            id: 'm6', contactId: 'c4',
            text: 'Rendezvous confirmed. Vault channel open.',
            encrypted: ENC_STUB,
            isOutgoing: false, timestamp: Date.now() - 86400000,
            burnDuration: 30, isRead: false, burned: false,
        },
    ],
};
