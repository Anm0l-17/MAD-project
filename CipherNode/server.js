// server.js — CipherNode Socket.io Relay Server
// Run with: node server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const peerToSocket = {};  // peerId → socketId (for reverse lookup)
const peerToInfo = {};  // peerId → { displayName }
const ipConnectionCounts = {}; // IP → active connection count

function roomId(a, b) {
    return [a, b].sort().join('::');
}

// Log and Input Sanitizer to protect against log injection and shell exploits
function sanitizeInput(str, maxLength = 100) {
    if (typeof str !== 'string') return '';
    // Strip control characters & ANSI escape codes to prevent log injection
    let clean = str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    clean = clean.replace(/[\x00-\x1F\x7F]/g, '');
    return clean.slice(0, maxLength);
}

app.get('/', (req, res) => {
    res.json({
        name: 'CipherNode Relay',
        peers: Object.keys(peerToSocket).length,
    });
});

io.on('connection', (socket) => {
    const ip = socket.handshake.address || 'unknown';
    ipConnectionCounts[ip] = (ipConnectionCounts[ip] || 0) + 1;

    // Rate Limiting: Prevent connection exhaustion (maximum 20 connections per IP)
    if (ipConnectionCounts[ip] > 20) {
        console.warn(`[Security Alert] IP ${ip} exceeded connection limit. Dropping socket.`);
        socket.disconnect(true);
        return;
    }

    console.log(`[+] Socket connected: ${socket.id} (IP: ${ip})`);

    // Device registers its peer ID on connect
    socket.on('register', ({ peerId, displayName }) => {
        const cleanPeerId = sanitizeInput(peerId, 128);
        const cleanName = sanitizeInput(displayName, 32) || 'Anonymous';

        if (!cleanPeerId) {
            socket.emit('error', { message: 'Invalid Peer ID.' });
            return;
        }

        peerToSocket[cleanPeerId] = socket.id;
        peerToInfo[cleanPeerId] = { displayName: cleanName };
        socket.data.peerId = cleanPeerId;
        console.log(`[+] Registered: ${cleanName} (${cleanPeerId.slice(0, 8)}…)`);
        socket.emit('registered', { peerId: cleanPeerId, displayName: cleanName });
    });

    // Device B scanned Device A's QR — join both to a shared room
    socket.on('connect-peer', ({ myId, myName, theirId, sessionKey, minRssi }) => {
        const cleanMyId = sanitizeInput(myId, 128);
        const cleanMyName = sanitizeInput(myName, 32);
        const cleanTheirId = sanitizeInput(theirId, 128);
        const cleanKey = sanitizeInput(sessionKey, 256);
        const safeMinRssi = Number.isFinite(Number(minRssi))
            ? Math.max(-100, Math.min(-50, Number(minRssi)))
            : -80;

        // Anti-Spoofing: Verify socket owns this peerId
        if (socket.data.peerId !== cleanMyId) {
            console.warn(`[Security Alert] Spoof attempt! Socket ${socket.id} claimed identity ${cleanMyId} but is registered as ${socket.data.peerId}`);
            socket.emit('error', { message: 'Identity authentication mismatch.' });
            return;
        }

        const rid = roomId(cleanMyId, cleanTheirId);

        // Join the scanner's socket to the room
        socket.join(rid);
        console.log(`[~] ${cleanMyId.slice(0, 8)}… joined room ${rid.slice(0, 16)}…`);

        // Look up the other peer's socket and join them too
        const theirSocketId = peerToSocket[cleanTheirId];
        if (theirSocketId) {
            const theirSocket = io.sockets.sockets.get(theirSocketId);
            if (theirSocket && !theirSocket.rooms.has(rid)) {
                theirSocket.join(rid);
                console.log(`[~] ${cleanTheirId.slice(0, 8)}… auto-joined room`);
            }
        }

        // Tell Device A someone connected to them, relaying the secure key back
        if (theirSocketId) {
            io.to(theirSocketId).emit('connection-request', {
                roomId: rid,
                fromId: cleanMyId,
                fromName: cleanMyName || 'Peer',
                sessionKey: cleanKey,
                minRssi: safeMinRssi,
            });
        }

        // Tell both the room is ready
        const count = io.sockets.adapter.rooms.get(rid)?.size || 0;
        io.to(rid).emit('room-status', { roomId: rid, memberCount: count });
        console.log(`[✓] Room ${rid.slice(0, 16)}… has ${count} member(s)`);
    });

    // Relay an encrypted message to the room — filter by roomId on server too
    socket.on('message', ({ roomId: rid, peerId, displayName, encrypted, burnDuration }) => {
        const cleanPeerId = sanitizeInput(peerId, 128);
        const cleanName = sanitizeInput(displayName, 32);
        const cleanRid = sanitizeInput(rid, 256);

        // Anti-Spoofing: Verify socket owns this peerId
        if (socket.data.peerId !== cleanPeerId) {
            console.warn(`[Security Alert] Message spoof attempt! Socket ${socket.id} claimed sender ${cleanPeerId}`);
            return;
        }

        console.log(`[>] Message in ${cleanRid.slice(0, 16)}… from ${cleanName}`);
        // Broadcast to everyone else in the room (not back to sender)
        socket.to(cleanRid).emit('message', {
            roomId: cleanRid,
            peerId: cleanPeerId,
            displayName: cleanName,
            encrypted,
            burnDuration: burnDuration ?? 5,
            ts: Date.now(),
        });
    });

    socket.on('disconnect', () => {
        ipConnectionCounts[ip] = Math.max(0, (ipConnectionCounts[ip] || 1) - 1);
        const peerId = socket.data.peerId;
        if (peerId) {
            const cleanName = sanitizeInput(peerToInfo[peerId]?.displayName, 32);
            console.log(`[-] Disconnected: ${cleanName} (${peerId.slice(0, 8)}…)`);
            delete peerToSocket[peerId];
            delete peerToInfo[peerId];
        }
    });
});

const PORT = process.env.PORT || 3001;
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1'; // Tor mode: localhost-only (hidden service forwards traffic)

server.listen(PORT, BIND_HOST, () => {
    console.log(`\n🧅 CipherNode Relay running on ${BIND_HOST}:${PORT}`);
    if (BIND_HOST === '127.0.0.1') {
        console.log('   🔒 Bound to localhost only (Tor Hidden Service mode)');
        console.log('   → Start Tor with: ./tor/start_tor.sh');
        console.log('   → Clients connect via your .onion address\n');
    } else {
        const { networkInterfaces } = require('os');
        const nets = networkInterfaces();
        console.log('   ⚠️  WARNING: Bound to public interface (development mode)');
        console.log('   SERVER_URL for src/utils/socket.js:\n');
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    console.log(`   http://${net.address}:${PORT}`);
                }
            }
        }
        console.log('');
    }
});
