import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Animated, Easing, Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { getOrCreatePeerId, getDisplayName } from '../utils/peer';
import { colors } from '../theme';

const { width } = Dimensions.get('window');
const scanFrameSize = 250;

export default function ScanQRScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [loading, setLoading] = useState(true);
    const [myPeerId, setMyPeerId] = useState(null);
    const [myName, setMyName] = useState('');
    const hasScanned = useRef(false);
    
    const animatedVal = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        (async () => {
            const pid = await getOrCreatePeerId();
            const dn = await getDisplayName();
            setMyPeerId(pid);
            setMyName(dn);
            setLoading(false);
        })();
    }, []);

    useEffect(() => {
        if (permission?.granted && !scanned) {
            startAnimation();
        }
    }, [permission, scanned]);

    const startAnimation = () => {
        animatedVal.setValue(0);
        Animated.loop(
            Animated.sequence([
                Animated.timing(animatedVal, {
                    toValue: 1,
                    duration: 2500,
                    easing: Easing.linear,
                    useNativeDriver: true,
                }),
                Animated.timing(animatedVal, {
                    toValue: 0,
                    duration: 2500,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            ])
        ).start();
    };

    const handleBarcodeScanned = ({ data }) => {
        if (hasScanned.current || scanned) return;
        hasScanned.current = true;
        setScanned(true);

        const parts = data.split(':');
        if (parts[0] !== 'CIPHER' || !parts[1] || parts.length < 4) {
            Alert.alert('Invalid QR Code', 'The scanned code is not a valid CipherNode peer QR.', [
                {
                    text: 'Scan Again',
                    onPress: () => {
                        hasScanned.current = false;
                        setScanned(false);
                    }
                },
                {
                    text: 'Cancel',
                    onPress: () => {
                        navigation.goBack();
                    }
                }
            ]);
            return;
        }

        const theirId = parts[1];
        const theirKey = parts[parts.length - 1];
        const theirName = parts.slice(2, parts.length - 1).join(':') || 'Unknown';
        const roomId = [myPeerId, theirId].sort().join('::');

        // Navigation parameters match PeerConnectScreen's scan handler
        navigation.replace('Conversation', {
            contact: { id: theirId, alias: theirName, hue: 220, online: true, isVault: false },
            isP2P: true,
            myPeerId: myPeerId,
            myDisplayName: myName,
            roomId: roomId,
            sessionKey: theirKey,
        });
    };

    if (loading || !permission) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color={colors.cobalt} size="large" />
                <Text style={styles.loadingText}>Initializing scanner…</Text>
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={styles.center}>
                <Text style={styles.iconLarge}>📷</Text>
                <Text style={styles.permTitle}>Camera Access Required</Text>
                <Text style={styles.permText}>We need camera access to scan CipherNode secure pairing QR codes.</Text>
                <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                    <Text style={styles.permBtnText}>Grant Camera Permission</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.backBtnText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Translate 0-1 animated value to vertical Y coordinates inside the scanning box
    const translateY = animatedVal.interpolate({
        inputRange: [0, 1],
        outputRange: [10, scanFrameSize - 10],
    });

    return (
        <View style={styles.container}>
            <CameraView
                style={StyleSheet.absoluteFillObject}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            >
                {/* Custom glowing glassmorphic scan overlay */}
                <View style={styles.overlay}>
                    <View style={[styles.topOverlay, { paddingTop: Math.max(insets.top, 20), height: 80 + insets.top }]}>
                        <TouchableOpacity style={[styles.closeBtn, { top: Math.max(insets.top, 16) + 10 }]} onPress={() => navigation.goBack()}>
                            <Text style={styles.closeText}>✕ Close</Text>
                        </TouchableOpacity>
                        <Text style={styles.instructionTitle}>Secure Scan</Text>
                    </View>

                    <View style={styles.middleRow}>
                        <View style={styles.sideOverlay} />
                        <View style={styles.frameContainer}>
                            <View style={styles.scanFrame}>
                                <Animated.View style={[styles.laser, { transform: [{ translateY }] }]} />
                                {/* Glowing corners */}
                                <View style={[styles.corner, styles.topLeft]} />
                                <View style={[styles.corner, styles.topRight]} />
                                <View style={[styles.corner, styles.bottomLeft]} />
                                <View style={[styles.corner, styles.bottomRight]} />
                            </View>
                        </View>
                        <View style={styles.sideOverlay} />
                    </View>

                    <View style={styles.bottomOverlay}>
                        <Text style={styles.scanHint}>Align QR code inside the frame to pair</Text>
                        {scanned && <ActivityIndicator color={colors.cobalt} style={{ marginTop: 12 }} />}
                    </View>
                </View>
            </CameraView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
    loadingText: { color: colors.text3, marginTop: 16, fontFamily: 'monospace', fontSize: 12 },
    iconLarge: { fontSize: 56, marginBottom: 16 },
    permTitle: { fontSize: 20, fontWeight: '700', color: colors.text1, marginBottom: 12 },
    permText: { fontSize: 14, color: colors.text2, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
    permBtn: { backgroundColor: colors.cobalt, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginBottom: 12 },
    permBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    backBtn: { paddingVertical: 12 },
    backBtnText: { color: colors.text3, fontSize: 14 },
    overlay: { flex: 1, justifyContent: 'space-between' },
    topOverlay: { backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
    closeBtn: { position: 'absolute', left: 16, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    closeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    instructionTitle: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
    middleRow: { flex: 1, flexDirection: 'row' },
    sideOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
    frameContainer: { width: scanFrameSize, height: scanFrameSize, justifyContent: 'center', alignItems: 'center' },
    scanFrame: { width: scanFrameSize, height: scanFrameSize, position: 'relative', overflow: 'hidden' },
    laser: { height: 2.5, backgroundColor: '#FF3B30', width: '90%', alignSelf: 'center', position: 'absolute', shadowColor: '#FF3B30', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4, elevation: 4 },
    corner: { position: 'absolute', width: 20, height: 20, borderColor: colors.cobalt, borderWidth: 4 },
    topLeft: { left: 0, top: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 12 },
    topRight: { right: 0, top: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 12 },
    bottomLeft: { left: 0, bottom: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 12 },
    bottomRight: { right: 0, bottom: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 12 },
    bottomOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', padding: 24 },
    scanHint: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'monospace', textAlign: 'center', marginTop: 12 },
});
