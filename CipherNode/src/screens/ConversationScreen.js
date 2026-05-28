// src/screens/ConversationScreen.js
import 'react-native-get-random-values';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    StyleSheet, Animated, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { INITIAL_MESSAGES } from '../data/mockData';
import { encryptMessage, decryptMessage } from '../utils/encryption';
import { getSocket } from '../utils/socket';
import { colors } from '../theme';

let globalMsgId = 1000;
function makeId() { return 'msg_' + (++globalMsgId); }

function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Burn Bar ─────────────────────────────────────────────────────────────────
function BurnBar({ duration, isRead, onBurned }) {
    const [remaining, setRemaining] = useState(duration);
    const anim = useRef(new Animated.Value(1)).current;
    const started = useRef(false);

    useEffect(() => {
        if (!isRead || started.current) return;
        started.current = true;
        Animated.timing(anim, { toValue: 0, duration: duration * 1000, useNativeDriver: false }).start();
        const interval = setInterval(() => {
            setRemaining(prev => {
                if (prev <= 1) { clearInterval(interval); setTimeout(onBurned, 500); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [isRead]);

    const widthInterp = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
    const col = remaining > 10 ? '#FF9500' : colors.danger;

    if (!isRead) return (
        <Text style={[styles.burnHint, { color: '#FF9500' }]}>⏱ {duration}s · tap to start burn</Text>
    );
    return (
        <View style={styles.burnWrap}>
            <View style={styles.burnTrack}>
                <Animated.View style={[styles.burnFill, { width: widthInterp, backgroundColor: col }]} />
            </View>
            <Text style={[styles.burnCountdown, { color: col }]}>{remaining}s</Text>
        </View>
    );
}

// ── Bubble ────────────────────────────────────────────────────────────────────
function Bubble({ msg, onStartBurn, onBurned }) {
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const [readStarted, setReadStarted] = useState(msg.isRead || msg.isOutgoing);

    const handleBurnComplete = () => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => onBurned(msg.id));
    };
    const handleTap = () => {
        if (!readStarted && msg.burnDuration) { setReadStarted(true); onStartBurn(msg.id); }
    };

    const isOut = msg.isOutgoing;
    return (
        <Animated.View style={{ opacity: fadeAnim }}>
            <View style={[styles.msgRow, isOut ? styles.msgOut : styles.msgIn]}>
                <TouchableOpacity
                    activeOpacity={msg.burnDuration && !readStarted ? 0.7 : 1}
                    onPress={handleTap}
                    style={[
                        styles.bubble,
                        {
                            backgroundColor: isOut ? colors.cobaltDim : colors.surface2,
                            borderColor: isOut ? colors.cobalt + '44' : colors.border
                        },
                        msg.burnDuration && !readStarted && { borderColor: '#FF9500' + '88' },
                    ]}>
                    {msg.senderName && !isOut && (
                        <Text style={styles.senderTag}>{msg.senderName}</Text>
                    )}
                    <Text style={styles.bubbleText}>{msg.text}</Text>
                    <Text style={styles.encTag} numberOfLines={1}>
                        🔐 {msg.encrypted?.slice(0, 22)}…
                    </Text>
                    <Text style={[styles.msgTime, isOut && { textAlign: 'right' }]}>
                        {formatTime(msg.timestamp)}{isOut ? ' ✓✓' : ''}
                    </Text>
                    {msg.burnDuration && !msg.burned && (
                        <BurnBar duration={msg.burnDuration} isRead={readStarted} onBurned={handleBurnComplete} />
                    )}
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}

// ── Conversation Screen ───────────────────────────────────────────────────────
import { deleteMessage } from '../utils/storage';
import { Security } from '../utils/Security';

export default function ConversationScreen({ route, navigation }) {
    const { contact, vaultMode, isP2P, myPeerId, myDisplayName, roomId, sessionKey } = route.params;
    const [messages, setMessages] = useState(
        isP2P ? [] : ((INITIAL_MESSAGES[contact.id] || []).filter(m => !m.burned))
    );
    const [inputText, setInputText] = useState('');
    const [circuitOpen, setCircuitOpen] = useState(false);
    const [peerOnline, setPeerOnline] = useState(!isP2P);
    const listRef = useRef(null);
    const accentColor = vaultMode ? colors.emerald : colors.cobalt;

    // ── P2P Socket listeners ─────────────────────────────────────────────────
    useEffect(() => {
        if (!isP2P) return;
        const socket = getSocket();

        // Listen for incoming messages in our room
        const onMessage = ({ roomId: rid, peerId, displayName, encrypted, burnDuration, ts }) => {
            if (rid !== roomId) return;   // ignore messages for other rooms
            if (peerId === myPeerId) return; // ignore self echo
            const decrypted = decryptMessage(encrypted, sessionKey);
            const msg = {
                id: makeId(), contactId: contact.id,
                text: decrypted, encrypted,
                senderName: displayName,
                isOutgoing: false, timestamp: ts || Date.now(),
                burnDuration: burnDuration || null,
                isRead: false, burned: false,
            };
            setMessages(prev => [...prev, msg]);
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        };

        const onPeerJoined = () => setPeerOnline(true);
        const onRoomStatus = ({ memberCount }) => setPeerOnline(memberCount >= 2);

        socket.on('message', onMessage);
        socket.on('peer-joined', onPeerJoined);
        socket.on('room-status', onRoomStatus);

        return () => {
            socket.off('message', onMessage);
            socket.off('peer-joined', onPeerJoined);
            socket.off('room-status', onRoomStatus);
        };
    }, [isP2P, myPeerId, contact.id, sessionKey]);

    // ── Send ──────────────────────────────────────────────────────────────────
    const handleSend = useCallback(() => {
        const text = inputText.trim();
        if (!text) return;
        setInputText('');

        const enc = encryptMessage(text, sessionKey);
        const msg = {
            id: makeId(), contactId: contact.id,
            text, encrypted: enc,
            senderName: myDisplayName,
            isOutgoing: true, timestamp: Date.now(),
            burnDuration: null, isRead: true, burned: false,
        };
        setMessages(prev => [...prev, msg]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

        if (isP2P) {
            const socket = getSocket();
            socket.emit('message', {
                roomId,
                peerId: myPeerId,
                displayName: myDisplayName,
                encrypted: enc,
                burnDuration: null,
            });
        } else {
            // Demo auto-reply for mock conversations
            const replies = [
                'Circuit integrity confirmed.', 'Copy. Key rotation complete.',
                'Message received. Clean channel.', 'Relay handshake successful.',
            ];
            const delay = 2000 + Math.random() * 2000;
            setTimeout(() => {
                const replyText = replies[Math.floor(Math.random() * replies.length)];
                const shouldBurn = Math.random() > 0.5;
                const enc2 = encryptMessage(replyText, sessionKey);
                const reply = {
                    id: makeId(), contactId: contact.id,
                    text: replyText, encrypted: enc2,
                    isOutgoing: false, timestamp: Date.now(),
                    burnDuration: shouldBurn ? 20 + Math.floor(Math.random() * 40) : null,
                    isRead: false, burned: false,
                };
                setMessages(prev => [...prev, reply]);
                setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
            }, delay);
        }
    }, [inputText, isP2P, roomId, myPeerId, myDisplayName, contact.id, sessionKey]);

    // ── Burn ──────────────────────────────────────────────────────────────────
    const handleStartBurn = (id) => setMessages(prev => prev.map(m => m.id === id ? { ...m, isRead: true } : m));
    
    const handleBurned = async (id) => {
        setMessages(prev => prev.filter(m => m.id !== id));
        try {
            await deleteMessage(contact.id, id);
            await Security.burnData(id);
        } catch (e) {
            console.error('Failed to shred data on burn:', e);
        }
    };

    // ── Circuit map ───────────────────────────────────────────────────────────
    const circuitHeight = useRef(new Animated.Value(0)).current;
    const toggleCircuit = () => {
        Animated.timing(circuitHeight, { toValue: circuitOpen ? 0 : 120, duration: 300, useNativeDriver: false }).start();
        setCircuitOpen(!circuitOpen);
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={[styles.backText, { color: accentColor }]}>‹</Text>
                </TouchableOpacity>
                <View style={[styles.avatarSm, { backgroundColor: `hsl(${contact.hue ?? 220}, 50%, 30%)` }]}>
                    <Text style={styles.avatarSmText}>
                        {contact.alias.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </Text>
                </View>
                <TouchableOpacity style={styles.headerMeta} onPress={toggleCircuit}>
                    <Text style={styles.headerName}>{contact.alias}</Text>
                    <Text style={[styles.headerStatus, { color: peerOnline ? accentColor : colors.text3 }]}>
                        {isP2P
                            ? (peerOnline ? '● P2P connected · encrypted' : '● waiting for peer…')
                            : (contact.online ? '● online · hidden service' : '● offline · queued')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={toggleCircuit} style={styles.circuitBtn}>
                    <Text style={{ fontSize: 18 }}>🌐</Text>
                </TouchableOpacity>
            </View>

            {/* Circuit map */}
            <Animated.View style={[styles.circuitDrawer, { maxHeight: circuitHeight }]}>
                <Text style={[styles.circuitTitle, { color: accentColor }]}>
                    {isP2P ? 'P2P SESSION' : 'ACTIVE TOR CIRCUIT'}
                </Text>
                {isP2P ? (
                    <View style={styles.circuitRow}>
                        {['📱 YOU', '🔗 Relay', `📱 ${contact.alias}`].map((node, i, arr) => (
                            <React.Fragment key={i}>
                                <View style={styles.circuitNode}><Text style={styles.circuitNodeText}>{node}</Text></View>
                                {i < arr.length - 1 && <Text style={[styles.circuitArrow, { color: accentColor }]}>→</Text>}
                            </React.Fragment>
                        ))}
                    </View>
                ) : (
                    <View style={styles.circuitRow}>
                        {['📱 YOU', '🇩🇪 Frankfurt', '🇳🇱 Amsterdam', '🇸🇬 Singapore', '🔒 DEST'].map((node, i, arr) => (
                            <React.Fragment key={i}>
                                <View style={styles.circuitNode}><Text style={styles.circuitNodeText}>{node}</Text></View>
                                {i < arr.length - 1 && <Text style={[styles.circuitArrow, { color: accentColor }]}>→</Text>}
                            </React.Fragment>
                        ))}
                    </View>
                )}
                <Text style={styles.circuitSub}>
                    {isP2P
                        ? `Room: ${roomId?.slice(0, 20)}… · AES-256 encrypted`
                        : '3 hops · ~220ms · AES-256 encrypted'}
                </Text>
            </Animated.View>

            {/* E2E banner */}
            <View style={styles.e2eBanner}>
                <Text style={styles.e2eText}>
                    🔐 {isP2P ? 'AES-256 E2E encrypted · Socket.io relay' : 'End-to-end encrypted · Tap burn messages to start timer'}
                </Text>
            </View>

            {/* Messages */}
            <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={m => m.id}
                contentContainerStyle={{ padding: 14, gap: 8 }}
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
                ListEmptyComponent={isP2P ? (
                    <View style={{ alignItems: 'center', paddingTop: 60 }}>
                        <Text style={{ fontSize: 32 }}>🔗</Text>
                        <Text style={{ color: colors.text3, fontFamily: 'monospace', fontSize: 12, marginTop: 12 }}>
                            {peerOnline ? 'Peer connected. Say hello!' : 'Waiting for peer to join…'}
                        </Text>
                    </View>
                ) : null}
                renderItem={({ item }) => (
                    <Bubble msg={item} onStartBurn={handleStartBurn} onBurned={handleBurned} />
                )}
            />

            {/* Input */}
            <View style={styles.inputBar}>
                <TextInput
                    style={styles.input}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder={isP2P ? 'Encrypted P2P message…' : 'Encrypted message…'}
                    placeholderTextColor={colors.text3}
                    multiline
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                />
                <TouchableOpacity
                    style={[styles.sendBtn, { backgroundColor: inputText.trim() ? accentColor : colors.surface3 }]}
                    onPress={handleSend}>
                    <Text style={styles.sendIcon}>➤</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingTop: 52, paddingHorizontal: 14, paddingBottom: 12,
        borderBottomWidth: 1,
    },
    backBtn: { padding: 6, marginRight: 4 },
    backText: { fontSize: 28, fontWeight: '300', lineHeight: 32 },
    avatarSm: {
        width: 38, height: 38, borderRadius: 19,
        alignItems: 'center', justifyContent: 'center', marginRight: 10,
    },
    avatarSmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    headerMeta: { flex: 1 },
    headerName: { fontSize: 15, fontWeight: '600', color: colors.text1 },
    headerStatus: { fontSize: 10, fontFamily: 'monospace', marginTop: 1 },
    circuitBtn: { padding: 8 },
    circuitDrawer: { overflow: 'hidden', backgroundColor: colors.surface1, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16 },
    circuitTitle: { fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, paddingTop: 10, marginBottom: 8 },
    circuitRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
    circuitNode: { backgroundColor: colors.surface2, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 4 },
    circuitNodeText: { fontSize: 9, color: colors.text2, fontFamily: 'monospace' },
    circuitArrow: { fontSize: 10 },
    circuitSub: { fontSize: 9, color: colors.text3, fontFamily: 'monospace', paddingBottom: 10, marginTop: 6 },
    e2eBanner: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: colors.surface1, borderBottomWidth: 1, borderBottomColor: colors.border },
    e2eText: { fontSize: 10, color: colors.text3, textAlign: 'center', fontFamily: 'monospace' },
    senderTag: { fontSize: 10, color: colors.cobalt, fontFamily: 'monospace', marginBottom: 3 },
    msgRow: { flexDirection: 'row', marginVertical: 2 },
    msgOut: { justifyContent: 'flex-end' },
    msgIn: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '78%', borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleText: { fontSize: 14, color: colors.text1, lineHeight: 20 },
    encTag: { fontSize: 9, color: colors.text3, fontFamily: 'monospace', marginTop: 4 },
    msgTime: { fontSize: 10, color: colors.text3, marginTop: 4 },
    burnWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    burnTrack: { flex: 1, height: 2, backgroundColor: colors.surface3, borderRadius: 99, overflow: 'hidden' },
    burnFill: { height: '100%', borderRadius: 99 },
    burnCountdown: { fontSize: 10, fontFamily: 'monospace', minWidth: 28, textAlign: 'right' },
    burnHint: { fontSize: 10, fontFamily: 'monospace', marginTop: 6 },
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 10,
        paddingHorizontal: 14, paddingVertical: 10, paddingBottom: 28,
        borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg,
    },
    input: {
        flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
        borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
        fontSize: 14, color: colors.text1, maxHeight: 100,
    },
    sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    sendIcon: { color: '#fff', fontSize: 16 },
});
