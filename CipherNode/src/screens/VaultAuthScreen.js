// src/screens/VaultAuthScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    Animated, Alert, Platform,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { colors } from '../theme';

export default function VaultAuthScreen({ navigation }) {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [bioAvailable, setBioAvailable] = useState(false);
    const CORRECT_PIN = '1337';
    const ringAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        LocalAuthentication.hasHardwareAsync().then(has => {
            if (has) LocalAuthentication.isEnrolledAsync().then(setBioAvailable);
        });
        // Pulse animation for bio ring
        Animated.loop(
            Animated.sequence([
                Animated.timing(ringAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
                Animated.timing(ringAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    const ringOpacity = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

    const handleBiometric = async () => {
        const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Authenticate to access Vault',
            fallbackLabel: 'Use PIN',
        });
        if (result.success) {
            unlockVault();
        } else {
            setError('Biometric authentication failed.');
        }
    };

    const unlockVault = () => {
        navigation.replace('ChatList', { vaultMode: true });
    };

    const handlePin = (digit) => {
        if (pin.length >= 4) return;
        const newPin = pin + digit;
        setPin(newPin);
        setError('');
        if (newPin.length === 4) {
            setTimeout(() => {
                if (newPin === CORRECT_PIN) {
                    unlockVault();
                } else {
                    setError('Incorrect PIN. Access denied.');
                    setPin('');
                }
            }, 200);
        }
    };

    const handleDelete = () => setPin(p => p.slice(0, -1));

    return (
        <View style={styles.container}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.cancelText}>✕ Cancel</Text>
            </TouchableOpacity>

            <View style={styles.iconWrap}>
                <Animated.View style={[styles.ringOuter, { opacity: ringOpacity }]} />
                <View style={styles.ringInner}>
                    <Text style={styles.lockIcon}>🔒</Text>
                </View>
            </View>

            <Text style={styles.title}>Vault Access</Text>
            <Text style={styles.subtitle}>Biometric or PIN required</Text>

            {/* PIN dots */}
            <View style={styles.pinDots}>
                {[0, 1, 2, 3].map(i => (
                    <View
                        key={i}
                        style={[styles.dot, i < pin.length && styles.dotFilled]}
                    />
                ))}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Biometric button */}
            {bioAvailable && (
                <TouchableOpacity style={styles.bioBtn} onPress={handleBiometric}>
                    <Text style={styles.bioBtnText}>👁️ Use Biometric</Text>
                </TouchableOpacity>
            )}

            {/* PIN Pad */}
            <View style={styles.pinPad}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, i) => (
                    <TouchableOpacity
                        key={i}
                        style={[styles.pinKey, key === '' && { opacity: 0 }]}
                        onPress={() => key === '⌫' ? handleDelete() : key && handlePin(key)}
                        disabled={key === ''}>
                        <Text style={styles.pinKeyText}>{key}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={styles.hint}>Hint: 1-3-3-7</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1, backgroundColor: '#000',
        alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40,
    },
    cancelBtn: { position: 'absolute', top: 56, right: 24 },
    cancelText: { color: colors.text3, fontSize: 14 },
    iconWrap: {
        width: 100, height: 100,
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    },
    ringOuter: {
        position: 'absolute',
        width: 100, height: 100, borderRadius: 50,
        borderWidth: 3, borderColor: colors.cobalt,
    },
    ringInner: {
        width: 68, height: 68, borderRadius: 34,
        backgroundColor: colors.surface2,
        alignItems: 'center', justifyContent: 'center',
    },
    lockIcon: { fontSize: 28 },
    title: { fontSize: 20, fontWeight: '700', color: colors.text1, marginBottom: 6 },
    subtitle: { fontSize: 12, color: colors.text3, fontFamily: 'monospace', marginBottom: 32 },
    pinDots: { flexDirection: 'row', gap: 16, marginBottom: 16 },
    dot: {
        width: 14, height: 14, borderRadius: 7,
        borderWidth: 2, borderColor: colors.cobalt, backgroundColor: 'transparent',
    },
    dotFilled: { backgroundColor: colors.cobalt },
    errorText: { fontSize: 12, color: colors.danger, fontFamily: 'monospace', marginBottom: 12 },
    bioBtn: {
        borderWidth: 1, borderColor: colors.cobalt + '66',
        borderRadius: 22, paddingHorizontal: 24, paddingVertical: 10, marginBottom: 28,
        backgroundColor: colors.cobaltDim,
    },
    bioBtnText: { color: colors.cobalt, fontSize: 13, fontWeight: '600' },
    pinPad: {
        flexDirection: 'row', flexWrap: 'wrap', width: 240,
        justifyContent: 'space-between', gap: 12,
    },
    pinKey: {
        width: 68, height: 68, borderRadius: 34,
        backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
        alignItems: 'center', justifyContent: 'center',
    },
    pinKeyText: { fontSize: 22, fontWeight: '500', color: colors.text1 },
    hint: { marginTop: 20, fontSize: 11, color: colors.text3, fontFamily: 'monospace' },
});
