// src/screens/PeerConnectScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TouchableOpacity, TextInput,
    StyleSheet, ActivityIndicator, Alert,
    PermissionsAndroid, Platform,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { getOrCreatePeerId, getDisplayName, setDisplayName } from '../utils/peer';
import { getSocket } from '../utils/socket';
import { generateSecureKey } from '../utils/encryption';
import { colors } from '../theme';

async function requestBluetoothPermissions() {
    if (Platform.OS !== 'android') return true;
    try {
        if (Platform.Version >= 31) {
            const granted = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
            ]);
            return (
                granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
                granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
                granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE] === PermissionsAndroid.RESULTS.GRANTED
            );
        } else {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
            );
            return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
    } catch (err) {
        console.warn('[Permissions] Failed to request Bluetooth permissions:', err);
        return false;
    }
}

export default function PeerConnectScreen({ navigation }) {
    const [tab, setTab] = useState('show');
    const [peerId, setPeerId] = useState(null);
    const [name, setName] = useState('');
    const [editingName, setEditing] = useState(false);
    const [scanned, setScanned] = useState(false);
    const [socketReady, setReady] = useState(false);
    const [sessionKey, setSessionKey] = useState('');
    const [proximityMeters, setProximityMeters] = useState('3');
    const [permission, requestPermission] = useCameraPermissions();
    const hasScanned = useRef(false);

    const proximityToRssi = (metersRaw) => {
        const meters = Math.max(1, Math.min(10, Number.parseInt(metersRaw, 10) || 3));
        // Approx mapping: 1m≈-55, 3m≈-65, 5m≈-72, 10m≈-80
        return Math.max(-90, Math.min(-50, Math.round(-55 - (meters - 1) * 2.8)));
    };

    useEffect(() => {
        let isMounted = true;

        (async () => {
            // Dynmically request Bluetooth permissions on mount
            await requestBluetoothPermissions();

            const id = await getOrCreatePeerId();
            const n = await getDisplayName();
            if (!isMounted) return;
            setPeerId(id);
            setName(n);

            // Generate an ephemeral strong 256-bit key for this QR code session
            const key = generateSecureKey();
            setSessionKey(key);

            const socket = getSocket();
            const onRegistered = () => isMounted && setReady(true);
            const onConnect = () => {
                if (!isMounted) return;
                socket.emit('register', { peerId: id, displayName: n });
            };

            socket.on('registered', onRegistered);
            socket.on('connect', onConnect); // Re-register if network drops and reconnects
            if (socket.connected) {
                socket.emit('register', { peerId: id, displayName: n });
                setReady(true);
            }

            // ── Device A listens for connection-request ──────────────────
            const onConnectionRequest = ({ roomId, fromId, fromName, sessionKey: relayedKey, minRssi }) => {
                if (!isMounted) return;
                const contact = {
                    id: fromId,
                    alias: fromName || 'Peer',
                    hue: 160,
                    online: true,
                    isVault: false,
                };
                navigation.replace('Conversation', {
                    contact,
                    isP2P: true,
                    myPeerId: id,
                    myDisplayName: n,
                    roomId,
                    sessionKey: relayedKey || key, // secure key derived out-of-band via QR
                    minRssi: Number.isFinite(minRssi) ? minRssi : proximityToRssi(proximityMeters),
                });
            };
            socket.on('connection-request', onConnectionRequest);

            return () => {
                socket.off('registered', onRegistered);
                socket.off('connect', onConnect);
                socket.off('connection-request', onConnectionRequest);
            };
        })();

        return () => { isMounted = false; };
    }, []);

    const saveName = async () => {
        await setDisplayName(name);
        setEditing(false);
        const socket = getSocket();
        if (peerId) socket.emit('register', { peerId, displayName: name });
    };

    // Device B scans Device A's QR
    const handleScan = ({ data }) => {
        if (hasScanned.current || scanned) return;
        hasScanned.current = true;
        setScanned(true);

        // data format: "CIPHER:<peerId>:<displayName>:<sessionKey>"
        const parts = data.split(':');
        if (parts[0] !== 'CIPHER' || !parts[1] || parts.length < 4) {
            Alert.alert('Invalid QR', 'Not a secure CipherNode peer QR.', [
                { text: 'Retry', onPress: () => { hasScanned.current = false; setScanned(false); } },
            ]);
            return;
        }

        const theirId = parts[1];
        const theirKey = parts[parts.length - 1];
        const theirName = parts.slice(2, parts.length - 1).join(':') || 'Unknown';
        const rid = [peerId, theirId].sort().join('::');

        const socket = getSocket();
        // Device B joins the room and relays theirKey back to Device A
        socket.emit('connect-peer', {
            myId: peerId,
            myName: name,
            theirId,
            sessionKey: theirKey,
            minRssi: proximityToRssi(proximityMeters),
        });

        navigation.replace('Conversation', {
            contact: { id: theirId, alias: theirName, hue: 220, online: true, isVault: false },
            isP2P: true,
            myPeerId: peerId,
            myDisplayName: name,
            roomId: rid,
            sessionKey: theirKey,
            minRssi: proximityToRssi(proximityMeters),
        });
    };

    const qrValue = peerId ? `CIPHER:${peerId}:${name}:${sessionKey}` : '';

    if (!peerId) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color={colors.cobalt} size="large" />
                <Text style={styles.loadingText}>Generating node identity…</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={[styles.back, { color: colors.cobalt }]}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Connect Peer</Text>
                <View style={{ width: 32 }} />
            </View>

            {/* Relay status */}
            <View style={[
                styles.statusBar,
                {
                    backgroundColor: socketReady ? 'rgba(0,230,118,0.1)' : 'rgba(255,59,48,0.1)',
                    borderColor: socketReady ? colors.emerald + '44' : 'rgba(255,59,48,0.3)'
                }
            ]}>
                <View style={[styles.statusDot, { backgroundColor: socketReady ? colors.emerald : colors.danger }]} />
                <Text style={[styles.statusText, { color: socketReady ? colors.emerald : colors.danger }]}>
                    {socketReady ? '📶 Relay Ready · Bluetooth pairing active' : '📶 Relay offline · Bluetooth local mode'}
                </Text>
            </View>

            <View style={styles.proximityBox}>
                <Text style={styles.proximityLabel}>Nearby range (meters)</Text>
                <TextInput
                    style={styles.proximityInput}
                    keyboardType="number-pad"
                    value={proximityMeters}
                    onChangeText={(value) => setProximityMeters(value.replace(/[^0-9]/g, '').slice(0, 2))}
                    placeholder="3"
                    placeholderTextColor={colors.text3}
                />
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
                <TouchableOpacity style={[styles.tab, tab === 'show' && styles.tabActive]} onPress={() => setTab('show')}>
                    <Text style={[styles.tabText, tab === 'show' && { color: colors.cobalt }]}>📱 My QR</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, tab === 'scan' && styles.tabActive]}
                    onPress={() => { setTab('scan'); setScanned(false); hasScanned.current = false; }}>
                    <Text style={[styles.tabText, tab === 'scan' && { color: colors.cobalt }]}>📷 Scan Peer</Text>
                </TouchableOpacity>
            </View>

            {/* ── Show QR ── */}
            {tab === 'show' && (
                <View style={styles.showPane}>
                    <View style={styles.qrCard}>
                        <View style={styles.qrBox}>
                            <QRCode value={qrValue} size={200} color="#fff" backgroundColor="#000" />
                        </View>
                        <Text style={styles.nodeLabel}>YOUR NODE ID</Text>
                        <Text style={styles.nodeId}>{peerId.slice(0, 18)}…</Text>
                        <View style={styles.waitingRow}>
                            <ActivityIndicator color={colors.cobalt} size="small" />
                            <Text style={styles.waitingText}>Waiting for peer to scan…</Text>
                        </View>
                    </View>

                    {/* Editable name */}
                    <View style={styles.nameRow}>
                        {editingName ? (
                            <>
                                <TextInput
                                    style={styles.nameInput} value={name} onChangeText={setName}
                                    autoFocus returnKeyType="done" onSubmitEditing={saveName}
                                    placeholder="Display name" placeholderTextColor={colors.text3}
                                />
                                <TouchableOpacity style={styles.saveBtn} onPress={saveName}>
                                    <Text style={styles.saveBtnText}>Save</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={styles.nameDisplay}>{name}</Text>
                                <TouchableOpacity onPress={() => setEditing(true)}>
                                    <Text style={styles.editBtn}>✏️ Edit name</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>

                    <Text style={styles.hint}>
                        Show this QR to the other person.{'\n'}They tap "Scan Peer" and scan it.{'\n'}You'll auto-join the chat room.
                    </Text>
                </View>
            )}

            {/* ── Scan tab ── */}
            {tab === 'scan' && (
                <View style={styles.scanPane}>
                    {!permission?.granted ? (
                        <View style={styles.center}>
                            <Text style={styles.permText}>Camera access needed to scan QR codes</Text>
                            <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                                <Text style={styles.permBtnText}>Allow Camera</Text>
                            </TouchableOpacity>
                        </View>
                    ) : scanned ? (
                        <View style={styles.center}>
                            <Text style={{ fontSize: 40 }}>🔗</Text>
                            <Text style={styles.connectingText}>Connecting…</Text>
                            <ActivityIndicator color={colors.cobalt} style={{ marginTop: 16 }} />
                        </View>
                    ) : (
                        <>
                            <CameraView
                                style={styles.camera}
                                onBarcodeScanned={handleScan}
                                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}>
                                <View style={styles.scanOverlay}>
                                    <View style={styles.scanFrame} />
                                </View>
                            </CameraView>
                            <Text style={styles.scanHint}>Point at the other person's QR code</Text>
                        </>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    loadingText: { color: colors.text3, marginTop: 16, fontFamily: 'monospace', fontSize: 12 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    back: { fontSize: 28, fontWeight: '300' },
    title: { fontSize: 17, fontWeight: '700', color: colors.text1 },
    statusBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 11, fontFamily: 'monospace' },
    proximityBox: {
        marginHorizontal: 16,
        marginTop: -4,
        marginBottom: 12,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    proximityLabel: { color: colors.text2, fontSize: 12, fontWeight: '600' },
    proximityInput: {
        width: 64,
        textAlign: 'center',
        color: colors.text1,
        backgroundColor: colors.surface2,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingVertical: 6,
        fontSize: 14,
        fontWeight: '600',
    },
    tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
    tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabActive: { borderBottomColor: colors.cobalt },
    tabText: { fontSize: 13, fontWeight: '600', color: colors.text3 },
    showPane: { flex: 1, alignItems: 'center', padding: 24 },
    qrCard: { backgroundColor: colors.surface1, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: 'center', width: '100%', marginBottom: 20 },
    qrBox: { padding: 16, backgroundColor: '#000', borderRadius: 12, borderWidth: 1, borderColor: colors.cobalt + '44', marginBottom: 16 },
    nodeLabel: { fontSize: 9, letterSpacing: 2, color: colors.text3, fontFamily: 'monospace', marginBottom: 4 },
    nodeId: { fontSize: 11, color: colors.cobalt, fontFamily: 'monospace', marginBottom: 12 },
    waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    waitingText: { fontSize: 11, color: colors.text3, fontFamily: 'monospace' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
    nameDisplay: { fontSize: 16, fontWeight: '600', color: colors.text1 },
    editBtn: { fontSize: 13, color: colors.text3 },
    nameInput: { flex: 1, backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, color: colors.text1, fontSize: 15 },
    saveBtn: { backgroundColor: colors.cobalt, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    hint: { textAlign: 'center', fontSize: 12, color: colors.text3, fontFamily: 'monospace', lineHeight: 20 },
    scanPane: { flex: 1 },
    camera: { flex: 1 },
    scanOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
    scanFrame: { width: 220, height: 220, borderRadius: 16, borderWidth: 3, borderColor: colors.cobalt },
    scanHint: { textAlign: 'center', fontSize: 12, color: colors.text3, fontFamily: 'monospace', padding: 14, backgroundColor: colors.bg },
    permText: { color: colors.text2, textAlign: 'center', marginBottom: 20, lineHeight: 22 },
    permBtn: { backgroundColor: colors.cobalt, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
    permBtnText: { color: '#fff', fontWeight: '700' },
    connectingText: { color: colors.text1, fontSize: 18, fontWeight: '600', marginTop: 16 },
});
