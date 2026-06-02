// src/screens/PeerConnectScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View, Text, TouchableOpacity, TextInput,
    StyleSheet, ActivityIndicator, Alert,
    PermissionsAndroid, Platform, ScrollView, FlatList
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getOrCreatePeerId, getDisplayName, setDisplayName, getPhoneNumber } from '../utils/peer';
import { getSocket } from '../utils/socket';
import { generateSecureKey } from '../utils/encryption';
import { colors } from '../theme';
import CryptoJS from 'crypto-js';

// Transports
import BluetoothTransport from '../utils/transports/BluetoothTransport';
import TransportCoordinator from '../utils/transports/TransportCoordinator';

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
    const insets = useSafeAreaInsets();
    const [tab, setTab] = useState('show');
    const [peerId, setPeerId] = useState(null);
    const [name, setName] = useState('');
    const [myPhone, setMyPhone] = useState('');
    const [editingName, setEditing] = useState(false);
    
    // Proximity pairing states
    const [targetPhone, setTargetPhone] = useState('');
    const [proximityMsg, setProximityMsg] = useState('');
    const [isPairing, setIsPairing] = useState(false);
    const [nearbyDevices, setNearbyDevices] = useState([]);

    const [socketReady, setReady] = useState(true); // Showcase always active
    const [sessionKey, setSessionKey] = useState('');

    // Re-fetch phone number every time screen comes into focus (e.g. after saving in Settings)
    useFocusEffect(
        useCallback(() => {
            getPhoneNumber().then(phone => setMyPhone(phone));
            getDisplayName().then(n => setName(n));
        }, [])
    );

    useEffect(() => {
        let isMounted = true;
        let unsubscribeConnected = () => {};
        let unsubscribeOutOfRange = () => {};
        let unsubscribeDiscovered = () => {};

        (async () => {
            // Request Bluetooth permissions dynamically
            await requestBluetoothPermissions();

            const id = await getOrCreatePeerId();
            const n = await getDisplayName();
            const phone = await getPhoneNumber();
            
            if (!isMounted) return;
            setPeerId(id);
            setName(n);
            setMyPhone(phone);

            // Generate an ephemeral strong 256-bit key for QR code pairing fallback
            const key = generateSecureKey();
            setSessionKey(key);

            // ── Bluetooth Native Listener (Symmetric Pairing Connection) ──
            unsubscribeConnected = BluetoothTransport.subscribeConnected((data) => {
                if (!isMounted) return;
                console.log('[PeerConnectScreen] Native peer connected over Bluetooth P2P:', data);
                
                const theirId = data.peerId || 'nearby_peer_id';
                const theirPhone = data.phoneNumber || targetPhone || 'Unknown';
                const theirName = data.displayName || (data.peerName ? data.peerName.split('_')[0] : 'Nearby Peer');
                
                // Construct stable P2P Room ID
                const rid = [id, theirId].sort().join('::');
                
                // Derive identical AES key deterministically using SHA-256 of sorted phone numbers
                const finalPhoneA = phone || '0000000000';
                const finalPhoneB = theirPhone;
                const derivedKey = CryptoJS.SHA256([finalPhoneA, finalPhoneB].sort().join('::')).toString();
                
                setIsPairing(false);
                setProximityMsg('Bluetooth Connection Handshake Successful! Opening chat...');

                navigation.replace('Conversation', {
                    contact: { id: theirId, alias: theirName, hue: 160, online: true, isVault: false },
                    isP2P: true,
                    myPeerId: id,
                    myDisplayName: n,
                    roomId: rid,
                    sessionKey: derivedKey,
                });
            });

            // Listen for native signal strength proximity alerts
            unsubscribeOutOfRange = BluetoothTransport.subscribeOutOfRange((data) => {
                if (!isMounted) return;
                setProximityMsg(`Proximity Guard active: Signal too weak (RSSI: ${data.rssi} dBm). Move devices closer together!`);
            });

            // Listen for broad Bluetooth scans
            unsubscribeDiscovered = BluetoothTransport.subscribeDeviceDiscovered((device) => {
                if (!isMounted) return;
                setNearbyDevices(prev => {
                    const idx = prev.findIndex(d => d.peerId === device.peerId);
                    if (idx > -1) {
                        const next = [...prev];
                        next[idx] = { ...next[idx], rssi: device.rssi, displayName: device.displayName };
                        return next;
                    }
                    return [...prev, device];
                });
            });

            // Start RFCOMM Server socket immediately in background so others can active-connect to us!
            if (phone) {
                BluetoothTransport.startServer(id, phone, n || 'Anonymous');
            }
        })();

        return () => {
            isMounted = false;
            unsubscribeConnected();
            unsubscribeOutOfRange();
            unsubscribeDiscovered();
        };
    }, [targetPhone]);

    const saveName = async () => {
        await setDisplayName(name);
        setEditing(false);
    };

    const handleBluetoothPair = async () => {
        const trimmed = (targetPhone || '').trim();
        if (!trimmed || trimmed.length < 10) {
            Alert.alert('Invalid Number', 'Please enter a valid 10-digit phone number.');
            return;
        }
        if (!myPhone) {
            Alert.alert('Configuration Required', 'Please set your phone number in Settings first to enable discovery.', [
                { text: 'Go Settings', onPress: () => navigation.navigate('Settings') },
                { text: 'Cancel' }
            ]);
            return;
        }
        if (trimmed === myPhone) {
            Alert.alert('Invalid Pair', 'Cannot pair with your own phone number.');
            return;
        }

        setProximityMsg('Searching nearby space for target device...');
        setIsPairing(true);

        // Symmetric Proximity Connect: sets name and starts discovery scanning
        await TransportCoordinator.startBluetoothSession(peerId, myPhone, trimmed);
    };

    const handleCancelPair = async () => {
        setIsPairing(false);
        setProximityMsg('');
        await TransportCoordinator.stopBluetoothSession();
        // Restart server socket
        if (peerId && myPhone) {
            await BluetoothTransport.startServer(peerId, myPhone, name || 'Anonymous');
        }
    };

    const handleTabChange = async (nextTab) => {
        setTab(nextTab);
        if (nextTab === 'proximity') {
            setNearbyDevices([]);
            setIsPairing(false);
            setProximityMsg('Scanning for nearby CipherNodes (AirDrop)...');
            if (peerId && myPhone) {
                // Discover broadly by scanning for empty target (gets all CipherNode advertisements)
                await BluetoothTransport.startDiscovery("");
            }
        } else {
            await handleCancelPair();
        }
    };

    const handleConnectNearbyDevice = async (device) => {
        setTargetPhone(device.phoneNumber);
        setProximityMsg(`Pairing with ${device.displayName} (${device.phoneNumber})...`);
        setIsPairing(true);
        await TransportCoordinator.startBluetoothSession(peerId, myPhone, device.phoneNumber);
    };



    const qrValue = peerId && myPhone ? `CIPHER:${peerId}:${name}:${sessionKey}` : '';

    if (!peerId) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color={colors.cobalt} size="large" />
                <Text style={styles.loadingText}>Generating node identity…</Text>
            </View>
        );
    }

    return (
        <ScrollView 
            style={styles.container} 
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
            {/* Header */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={[styles.back, { color: colors.cobalt }]}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Connect Peer</Text>
                <View style={{ width: 32 }} />
            </View>

            {/* Showcase status */}
            <View style={[
                styles.statusBar,
                {
                    backgroundColor: 'rgba(0,230,118,0.1)',
                    borderColor: colors.emerald + '44'
                }
            ]}>
                <View style={[styles.statusDot, { backgroundColor: colors.emerald }]} />
                <Text style={[styles.statusText, { color: colors.emerald }]}>
                    🧅 Tor Showcase Circuit Enabled · Ready to pair
                </Text>
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
                <TouchableOpacity style={[styles.tab, tab === 'show' && styles.tabActive]} onPress={() => handleTabChange('show')}>
                    <Text style={[styles.tabText, tab === 'show' && { color: colors.cobalt }]}>📱 Identity QR</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, tab === 'scan' && styles.tabActive]} onPress={() => handleTabChange('scan')}>
                    <Text style={[styles.tabText, tab === 'scan' && { color: colors.cobalt }]}>📷 QR Scan</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, tab === 'proximity' && styles.tabActive]} onPress={() => handleTabChange('proximity')}>
                    <Text style={[styles.tabText, tab === 'proximity' && { color: colors.cobalt }]}>⚡ Proximity Pair</Text>
                </TouchableOpacity>
            </View>
 
            {/* ── Show QR Tab ── */}
            {tab === 'show' && (
                <View style={styles.showPane}>
                    <View style={styles.qrCard}>
                        {myPhone ? (
                            <TouchableOpacity 
                                activeOpacity={0.7}
                                onPress={async () => {
                                    await Clipboard.setStringAsync(qrValue);
                                    Alert.alert('Copied', 'Pairing identity string copied to clipboard!');
                                }}
                                style={styles.qrBox}
                            >
                                <QRCode value={qrValue} size={200} color="#fff" backgroundColor="#000" />
                            </TouchableOpacity>
                        ) : (
                            <View style={[styles.qrBox, { height: 232, width: 232, justifyContent: 'center', alignItems: 'center' }]}>
                                <Text style={{ color: '#fff', fontSize: 40, marginBottom: 12 }}>📱</Text>
                                <Text style={{ color: colors.danger, fontSize: 11, textAlign: 'center', paddingHorizontal: 12, fontFamily: 'monospace' }}>
                                    Set your Phone Number in Settings to unlock pairing QR code!
                                </Text>
                            </View>
                        )}
                        <Text style={styles.nodeLabel}>YOUR IDENTITY (TAP TO COPY)</Text>
                        <TouchableOpacity 
                            activeOpacity={0.7}
                            onPress={async () => {
                                if (myPhone) {
                                    await Clipboard.setStringAsync(myPhone);
                                    Alert.alert('Copied', 'Phone number copied to clipboard!');
                                }
                            }}
                            style={{ marginVertical: 2 }}
                        >
                            <Text style={styles.nodeId}>Phone: {myPhone || 'NOT CONFIGURED'} 📋</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            activeOpacity={0.7}
                            onPress={async () => {
                                await Clipboard.setStringAsync(peerId);
                                Alert.alert('Copied', 'Node ID copied to clipboard!');
                            }}
                            style={{ marginVertical: 2 }}
                        >
                            <Text style={[styles.nodeId, { fontSize: 9, color: colors.text3 }]}>Node ID: {peerId.slice(0, 18)}… 📋</Text>
                        </TouchableOpacity>
                        <View style={styles.waitingRow}>
                            <ActivityIndicator color={colors.cobalt} size="small" />
                            <Text style={styles.waitingText}>Symmetric advertising active…</Text>
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
                </View>
            )}

            {/* ── Scan QR Tab ── */}
            {tab === 'scan' && (
                <View style={styles.scanPane}>
                    <View style={styles.qrCard}>
                        <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text1, marginBottom: 12 }}>
                            Secure Camera Scanner
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.text2, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16, marginBottom: 24, fontFamily: 'monospace' }}>
                            Scan your peer's CipherNode identity QR code to perform a secure zero-knowledge key derivation handshake and start chatting locally.
                        </Text>
                        <TouchableOpacity 
                            activeOpacity={0.7}
                            onPress={() => navigation.navigate('ScanQR')}
                            style={[styles.permBtn, { width: '100%', alignItems: 'center', backgroundColor: colors.cobalt }]}
                        >
                            <Text style={styles.permBtnText}>⚡ Open Secure Camera Scanner</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* ── Nearby Proximity Phone Pairing Tab ── */}
            {tab === 'proximity' && (
                <View style={styles.proximityPane}>
                    <View style={styles.proxCard}>
                        <Text style={styles.proxTitle}>⚡ AirDrop Proximity Pairing</Text>
                        <Text style={styles.proxDescription}>
                            Pair instantaneously in a defined space. Signal strength is strictly validated using a Bluetooth RSSI threshold range to ensure close physical proximity.
                        </Text>
                        
                        {!myPhone ? (
                            <View style={styles.warningContainer}>
                                <Text style={styles.warningText}>
                                    ⚠️ Action Needed: You must set your Phone Number in Settings before initiating proximity pairing.
                                </Text>
                                <TouchableOpacity style={styles.permBtn} onPress={() => navigation.navigate('Settings')}>
                                    <Text style={styles.permBtnText}>Go to Settings</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.pairingContainer}>
                                {isPairing ? (
                                    <View style={styles.pairingStatusBox}>
                                        <ActivityIndicator color={colors.emerald} style={{ marginBottom: 12 }} />
                                        <Text style={styles.pairingStatusText}>{proximityMsg}</Text>
                                        <TouchableOpacity style={styles.cancelPairBtn} onPress={handleCancelPair}>
                                            <Text style={styles.cancelPairText}>Cancel Search / Scan</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <>
                                        {/* Nearby Devices List */}
                                        <Text style={styles.pairingLabel}>⚡ NEARBY DISCOVERED DEVICES (TAP TO CONNECT):</Text>
                                        {nearbyDevices.length > 0 ? (
                                            <View style={styles.deviceList}>
                                                {nearbyDevices.map((device, idx) => (
                                                    <TouchableOpacity 
                                                        key={device.peerId || idx}
                                                        onPress={() => handleConnectNearbyDevice(device)}
                                                        style={styles.deviceRow}
                                                    >
                                                        <View>
                                                            <Text style={styles.deviceName}>🟢 {device.displayName}</Text>
                                                            <Text style={styles.devicePhone}>Phone: {device.phoneNumber}</Text>
                                                        </View>
                                                        <Text style={styles.deviceRssi}>{device.rssi} dBm 📶</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        ) : (
                                            <View style={styles.emptyNearby}>
                                                <ActivityIndicator color={colors.emerald} size="small" style={{ marginBottom: 8 }} />
                                                <Text style={styles.emptyNearbyText}>Scanning for nearby CipherNodes (AirDrop)...</Text>
                                            </View>
                                        )}

                                        <View style={styles.proximitySeparator} />

                                        <Text style={styles.pairingLabel}>Or Enter Phone Number Manually:</Text>
                                        <TextInput
                                            style={styles.pairingInput}
                                            value={targetPhone}
                                            onChangeText={setTargetPhone}
                                            placeholder="Enter 10-digit number"
                                            placeholderTextColor={colors.text3}
                                            keyboardType="phone-pad"
                                            maxLength={15}
                                        />
                                        <TouchableOpacity style={styles.pairSubmitBtn} onPress={handleBluetoothPair}>
                                            <Text style={styles.pairSubmitText}>Discover &amp; Connect P2P</Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        )}
                    </View>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, marginTop: 40 },
    loadingText: { color: colors.text3, marginTop: 16, fontFamily: 'monospace', fontSize: 12 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    back: { fontSize: 28, fontWeight: '300' },
    title: { fontSize: 17, fontWeight: '700', color: colors.text1 },
    statusBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 11, fontFamily: 'monospace' },
    tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
    tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabActive: { borderBottomColor: colors.cobalt },
    tabText: { fontSize: 11, fontWeight: '600', color: colors.text3 },
    showPane: { flex: 1, alignItems: 'center', padding: 24 },
    qrCard: { backgroundColor: colors.surface1, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: 'center', width: '100%', marginBottom: 20 },
    qrBox: { padding: 16, backgroundColor: '#000', borderRadius: 12, borderWidth: 1, borderColor: colors.cobalt + '44', marginBottom: 16 },
    nodeLabel: { fontSize: 9, letterSpacing: 2, color: colors.text3, fontFamily: 'monospace', marginBottom: 4 },
    nodeId: { fontSize: 12, color: colors.cobalt, fontFamily: 'monospace', marginBottom: 6 },
    waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    waitingText: { fontSize: 11, color: colors.text3, fontFamily: 'monospace' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
    nameDisplay: { fontSize: 16, fontWeight: '600', color: colors.text1 },
    editBtn: { fontSize: 13, color: colors.text3 },
    nameInput: { width: 180, backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, color: colors.text1, fontSize: 15 },
    saveBtn: { backgroundColor: colors.cobalt, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    scanPane: { flex: 1 },
    camera: { flex: 1 },
    scanOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
    scanFrame: { width: 220, height: 220, borderRadius: 16, borderWidth: 3, borderColor: colors.cobalt },
    scanHint: { textAlign: 'center', fontSize: 12, color: colors.text3, fontFamily: 'monospace', padding: 14, backgroundColor: colors.bg },
    permText: { color: colors.text2, textAlign: 'center', marginBottom: 20, lineHeight: 22 },
    permBtn: { backgroundColor: colors.cobalt, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 12 },
    permBtnText: { color: '#fff', fontWeight: '700' },
    connectingText: { color: colors.text1, fontSize: 18, fontWeight: '600', marginTop: 16 },

    // Proximity Styling
    proximityPane: { flex: 1, padding: 20 },
    proxCard: { backgroundColor: colors.surface1, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 20, width: '100%' },
    proxTitle: { fontSize: 17, fontWeight: '700', color: '#00E676', marginBottom: 12 },
    proxDescription: { fontSize: 12, color: colors.text2, lineHeight: 18, marginBottom: 20, fontFamily: 'monospace' },
    warningContainer: { alignItems: 'center', padding: 12, backgroundColor: 'rgba(255,59,48,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,59,48,0.2)' },
    warningText: { fontSize: 12, color: colors.danger, textAlign: 'center', lineHeight: 18, fontFamily: 'monospace' },
    pairingContainer: { marginTop: 8 },
    pairingLabel: { fontSize: 13, color: colors.text1, fontWeight: '600', marginBottom: 10 },
    pairingInput: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: colors.text1, fontSize: 15, marginBottom: 16 },
    pairSubmitBtn: { backgroundColor: '#00E676', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    pairSubmitText: { color: '#000', fontWeight: '800', fontSize: 14 },
    pairingStatusBox: { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: 'center' },
    pairingStatusText: { fontSize: 12, color: '#FF9500', textAlign: 'center', lineHeight: 18, fontFamily: 'monospace', marginBottom: 16 },
    cancelPairBtn: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: 'rgba(255,59,48,0.1)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,59,48,0.2)' },
    cancelPairText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
    deviceList: { marginBottom: 16 },
    deviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: colors.surface2, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    deviceName: { color: colors.text1, fontSize: 14, fontWeight: '700' },
    devicePhone: { color: colors.text3, fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
    deviceRssi: { color: '#00E676', fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold' },
    emptyNearby: { paddingVertical: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
    emptyNearbyText: { color: colors.text3, fontSize: 12, fontFamily: 'monospace', textAlign: 'center' },
    proximitySeparator: { height: 1, backgroundColor: colors.border, marginVertical: 20 },
});
