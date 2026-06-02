// src/screens/ConversationScreen.js
import 'react-native-get-random-values';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    StyleSheet, Animated, KeyboardAvoidingView, Platform, StatusBar, Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { INITIAL_MESSAGES } from '../data/mockData';
import { encryptMessage, decryptMessage } from '../utils/encryption';
import { colors } from '../theme';
import { deleteMessage, getMessages } from '../utils/storage';
import { Security } from '../utils/Security';
import { getPhoneNumber } from '../utils/peer';

// Transports
import TransportCoordinator from '../utils/transports/TransportCoordinator';
import { TransportType } from '../utils/transports/types';
import { subscribeTorStatus } from '../utils/tor';

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

    // Seen auto-delete: automatically trigger the burn timer as soon as the message renders/mounts on the screen
    useEffect(() => {
        if (!readStarted && msg.burnDuration) {
            setReadStarted(true);
            onStartBurn(msg.id);
        }
    }, []);

    const handleBurnComplete = () => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => onBurned(msg.id));
    };

    const isOut = msg.isOutgoing;
    return (
        <Animated.View style={{ opacity: fadeAnim }}>
            <View style={[styles.msgRow, isOut ? styles.msgOut : styles.msgIn]}>
                <TouchableOpacity
                    activeOpacity={0.9}
                    onLongPress={async () => {
                        if (msg.text) {
                            await Clipboard.setStringAsync(msg.text);
                            Alert.alert('Copied', 'Message copied to clipboard.');
                        }
                    }}
                    style={[
                        styles.bubble,
                        {
                            backgroundColor: isOut ? colors.cobaltDim : colors.surface2,
                            borderColor: isOut ? colors.cobalt + '44' : colors.border
                        },
                        msg.burnDuration && { borderColor: '#FF9500' + '88' },
                    ]}>
                    {msg.senderName && !isOut && (
                        <Text style={styles.senderTag}>{msg.senderName}</Text>
                    )}
                    <Text style={styles.bubbleText}>{msg.text}</Text>
                    
                    <View style={styles.badgeRow}>
                        <Text style={styles.encTag} numberOfLines={1}>
                            🔐 {msg.encrypted?.slice(0, 16)}…
                        </Text>
                        {msg.transports && msg.transports.length > 0 && (
                            <View style={styles.transportsBadgeWrap}>
                                {msg.transports.includes(TransportType.BLUETOOTH) && (
                                    <Text style={styles.badgeBt}>⚡ BLE</Text>
                                )}
                                {msg.transports.includes(TransportType.TOR) && (
                                    <Text style={styles.badgeTor}>🧅 Tor</Text>
                                )}
                            </View>
                        )}
                    </View>

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
export default function ConversationScreen({ route, navigation }) {
    const insets = useSafeAreaInsets();
    const { contact, vaultMode, isP2P, myPeerId, myDisplayName, roomId, sessionKey } = route.params;
    
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [circuitOpen, setCircuitOpen] = useState(false);
    const [peerOnline, setPeerOnline] = useState(!isP2P);
    const [torProgress, setTorProgress] = useState(0);
    const [transportStatus, setTransportStatus] = useState({
        torConnected: false,
        bluetoothConnected: false,
    });

    const listRef = useRef(null);
    const accentColor = vaultMode ? colors.emerald : colors.cobalt;

    // Load persisted chat history on mount
    useEffect(() => {
        const loadHistory = async () => {
            if (isP2P) {
                const stored = await getMessages(contact.id);
                const active = stored.filter(m => !m.burned);
                
                // Decrypt persisted messages for rendering
                const decryptedList = active.map(m => {
                    const decryptedText = decryptMessage(m.encrypted, sessionKey);
                    return { ...m, text: decryptedText };
                });
                setMessages(decryptedList);
            } else {
                setMessages((INITIAL_MESSAGES[contact.id] || []).filter(m => !m.burned));
            }
        };
        loadHistory();
    }, [isP2P, contact.id, sessionKey]);

    // Subscribe to progressive Tor bootstrapping status (showcase simulation)
    useEffect(() => {
        const unsubscribe = subscribeTorStatus((status) => {
            setTorProgress(status.bootstrapped ? 100 : status.progress);
        });
        return () => unsubscribe();
    }, []);

    // Subscribe to Transport coordinator connection statuses
    useEffect(() => {
        if (!isP2P) return;
        const unsubscribe = TransportCoordinator.subscribeConnectionStatus((status) => {
            setTransportStatus(status);
            setPeerOnline(status.torConnected || status.bluetoothConnected);
        });
        return () => unsubscribe();
    }, [isP2P]);

    // ── Transport coordinator P2P listener & BT session setup ─────────────────
    useEffect(() => {
        if (!isP2P) return;

        let isMounted = true;

        (async () => {
            const phone = await getPhoneNumber();
            if (!isMounted) return;

            // Set active session in coordinator
            TransportCoordinator.setSession(roomId, myPeerId, myDisplayName, contact.id);

            // Spin up Bluetooth Classic Server & Client concurrently (Proximity Pairing)
            const targetPhone = contact.phoneNumber || contact.id;
            await TransportCoordinator.startBluetoothSession(myPeerId, phone, targetPhone);
        })();

        // Subscribe to incoming messages over both paths
        const unsubscribeMsg = TransportCoordinator.subscribeMessage((uiMessage) => {
            const decrypted = decryptMessage(uiMessage.encrypted, sessionKey);
            const decryptedMsg = {
                ...uiMessage,
                text: decrypted,
            };
            setMessages(prev => {
                if (prev.some(m => m.id === uiMessage.id)) return prev;
                return [...prev, decryptedMsg];
            });
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        });

        // Subscribe to delivery transport updates (badge rendering)
        const unsubscribeBadge = TransportCoordinator.subscribeTransportUpdate(({ messageId, transport }) => {
            setMessages(prev => prev.map(m => {
                if (m.id === messageId) {
                    const currentTransports = m.transports ? [...m.transports] : [];
                    if (!currentTransports.includes(transport)) {
                        currentTransports.push(transport);
                    }
                    return { ...m, transports: currentTransports };
                }
                return m;
            }));
        });

        return () => {
            isMounted = false;
            unsubscribeMsg();
            unsubscribeBadge();
            TransportCoordinator.stopBluetoothSession();
        };
    }, [isP2P, roomId, myPeerId, myDisplayName, contact.id, sessionKey]);

    // ── Send ──────────────────────────────────────────────────────────────────
    const handleSend = useCallback(async () => {
        const text = inputText.trim();
        if (!text) return;
        setInputText('');

        const enc = encryptMessage(text, sessionKey);

        if (isP2P) {
            // Strict 5 seconds default chat auto-deletion duration
            const uiMsg = await TransportCoordinator.sendMessage(contact.id, text, enc, 5);
            setMessages(prev => [...prev, uiMsg]);
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        } else {
            // Demo auto-reply for mock conversations (enforcing 5s auto-delete)
            const msg = {
                id: 'msg_' + Date.now(), contactId: contact.id,
                text, encrypted: enc,
                senderName: myDisplayName,
                isOutgoing: true, timestamp: Date.now(),
                burnDuration: 5, isRead: true, burned: false,
                transports: [TransportType.TOR, TransportType.BLUETOOTH],
            };
            setMessages(prev => [...prev, msg]);
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

            const replies = [
                'Local secure RSSI gate confirmed.', 'Proximity pairing validated ✓',
                'AES-256 E2EE handshake active.', '5sec auto-delete timer operational.',
            ];
            const delay = 2000 + Math.random() * 2000;
            setTimeout(() => {
                const replyText = replies[Math.floor(Math.random() * replies.length)];
                const enc2 = encryptMessage(replyText, sessionKey);
                const reply = {
                    id: 'msg_' + Date.now() + '_reply', contactId: contact.id,
                    text: replyText, encrypted: enc2,
                    isOutgoing: false, timestamp: Date.now(),
                    burnDuration: 5, // Strict 5s default burn
                    isRead: false, burned: false,
                    transports: [TransportType.TOR, TransportType.BLUETOOTH],
                };
                setMessages(prev => [...prev, reply]);
                setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
            }, delay);
        }
    }, [inputText, isP2P, myDisplayName, contact.id, sessionKey]);

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
            <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 16) }]}>
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
                            ? (transportStatus.torConnected && transportStatus.bluetoothConnected
                                ? '● Tor & Bluetooth Active ⚡🧅'
                                : transportStatus.bluetoothConnected
                                    ? '● Bluetooth Local Active ⚡'
                                    : transportStatus.torConnected
                                        ? '● Tor Showcase Active 🧅'
                                        : '● waiting for peer…')
                            : (contact.online ? '● online · hidden service' : '● offline · queued')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={toggleCircuit} style={styles.circuitBtn}>
                    <Text style={{ fontSize: 18 }}>🌐</Text>
                </TouchableOpacity>
            </View>

            {/* Tor progressive bootstrapping status bar (Showcase) */}
            {isP2P && torProgress < 100 && (
                <View style={styles.progressiveBootTrack}>
                    <View style={[styles.progressiveBootFill, { width: `${torProgress}%` }]} />
                    <Text style={styles.progressiveBootText}>TUNNELING TOR SECURE CIRCUIT (SHOWCASE): {torProgress}%</Text>
                </View>
            )}

            {/* Circuit map */}
            <Animated.View style={[styles.circuitDrawer, { maxHeight: circuitHeight }]}>
                <Text style={[styles.circuitTitle, { color: accentColor }]}>
                    {isP2P ? 'P2P SECURE SESSIONS' : 'ACTIVE TOR CIRCUIT'}
                </Text>
                {isP2P ? (
                    <View style={styles.circuitRow}>
                        {['📱 YOU', '⚡ BLE P2P (RSSI threshold: -80dBm)', '🧅 Tor (Showcase)', `📱 ${contact.alias}`].map((node, i, arr) => (
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
                        ? `Dual-Path: BLE Proximity Classic (RSSI Active) + Tor Showcase SOCKS`
                        : '3 hops · ~220ms · AES-256 E2EE'}
                </Text>
            </Animated.View>

            {/* E2E banner */}
            <View style={styles.e2eBanner}>
                <Text style={styles.e2eText}>
                    🔐 {isP2P ? 'AES-256 E2EE · Proximity pairing · 5sec Seen Auto-delete Active' : 'End-to-end encrypted · Tap burn messages to start timer'}
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
            <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
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
        paddingHorizontal: 14, paddingBottom: 12,
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
    encTag: { fontSize: 9, color: colors.text3, fontFamily: 'monospace' },
    msgTime: { fontSize: 10, color: colors.text3, marginTop: 4 },
    burnWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    burnTrack: { flex: 1, height: 2, backgroundColor: colors.surface3, borderRadius: 99, overflow: 'hidden' },
    burnFill: { height: '100%', borderRadius: 99 },
    burnCountdown: { fontSize: 10, fontFamily: 'monospace', minWidth: 28, textAlign: 'right' },
    burnHint: { fontSize: 10, fontFamily: 'monospace', marginTop: 6 },
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 10,
        paddingHorizontal: 14, paddingVertical: 10,
        borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg,
    },
    input: {
        flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
        borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
        fontSize: 14, color: colors.text1, maxHeight: 100,
    },
    sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    sendIcon: { color: '#fff', fontSize: 16 },

    // Progressive bootstrap bar
    progressiveBootTrack: {
        height: 18,
        backgroundColor: 'rgba(255, 149, 0, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 149, 0, 0.2)',
    },
    progressiveBootFill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 149, 0, 0.3)',
    },
    progressiveBootText: {
        fontSize: 9,
        color: '#FF9500',
        fontFamily: 'monospace',
        fontWeight: 'bold',
        zIndex: 1,
    },

    // Transports Badges
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 4,
        gap: 8,
    },
    transportsBadgeWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    badgeBt: {
        fontSize: 8,
        color: '#00E676',
        backgroundColor: 'rgba(0, 230, 118, 0.12)',
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 4,
        fontFamily: 'monospace',
        fontWeight: '700',
        overflow: 'hidden',
    },
    badgeTor: {
        fontSize: 8,
        color: '#007AFF',
        backgroundColor: 'rgba(0, 122, 255, 0.15)',
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 4,
        fontFamily: 'monospace',
        fontWeight: '700',
        overflow: 'hidden',
    },
});
