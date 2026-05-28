// src/screens/SplashScreen.js
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors } from '../theme';

const LOGS = [
    'Starting Tor daemon...',
    'Generating RSA-4096 keypair...',
    'Onion address assigned ✓',
    'Building circuit (3 hops)...',
    'Guard node: DE-Frankfurt-01',
    'Relay node: NL-Amsterdam-07',
    'Bootstrap complete (100%)',
    'Unlocking SQLCipher vault...',
    'CipherNode ready.',
];

export default function SplashScreen({ navigation }) {
    const [logs, setLogs] = useState([]);
    const [progress, setProgress] = useState(0);
    const progressAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();

        let logIndex = 0;
        const interval = setInterval(() => {
            if (logIndex < LOGS.length) {
                setLogs(prev => [...prev, LOGS[logIndex]]);
                const pct = Math.round(((logIndex + 1) / LOGS.length) * 100);
                setProgress(pct);
                Animated.timing(progressAnim, {
                    toValue: pct / 100, duration: 400, useNativeDriver: false,
                }).start();
                logIndex++;
            } else {
                clearInterval(interval);
                setTimeout(() => navigation.replace('ChatList'), 800);
            }
        }, 600);
        return () => clearInterval(interval);
    }, []);

    const progressWidth = progressAnim.interpolate({
        inputRange: [0, 1], outputRange: ['0%', '100%'],
    });

    return (
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
            <View style={styles.logoRow}>
                <Text style={styles.logoIcon}>🔵</Text>
                <View>
                    <Text style={styles.appName}>CipherNode</Text>
                    <Text style={styles.tagline}>ENCRYPTED · P2P · ONION</Text>
                </View>
            </View>

            <View style={styles.terminal}>
                {logs.map((log, i) => (
                    <Text key={i} style={styles.logLine}>
                        <Text style={styles.logOk}>[+] </Text>{log}
                    </Text>
                ))}
            </View>

            <View style={styles.progressWrap}>
                <View style={styles.progressTrack}>
                    <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
                </View>
                <View style={styles.progressLabels}>
                    <Text style={styles.progressLabel}>BOOTSTRAPPING TOR CIRCUIT</Text>
                    <Text style={[styles.progressLabel, { color: colors.cobalt }]}>{progress}%</Text>
                </View>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1, backgroundColor: '#000',
        justifyContent: 'center', alignItems: 'center', padding: 32,
    },
    logoRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 40,
    },
    logoIcon: { fontSize: 40 },
    appName: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
    tagline: { fontSize: 10, color: '#555', letterSpacing: 2, marginTop: 2, fontFamily: 'monospace' },
    terminal: {
        width: '100%', backgroundColor: '#0a0a0a', borderRadius: 12,
        borderWidth: 1, borderColor: '#1a1a1a', padding: 16, minHeight: 200,
    },
    logLine: { fontSize: 11, color: '#666', fontFamily: 'monospace', lineHeight: 20 },
    logOk: { color: colors.cobalt },
    progressWrap: { width: '100%', marginTop: 20 },
    progressTrack: {
        height: 2, backgroundColor: '#1a1a1a', borderRadius: 99, overflow: 'hidden',
    },
    progressFill: {
        height: '100%', backgroundColor: colors.cobalt, borderRadius: 99,
    },
    progressLabels: {
        flexDirection: 'row', justifyContent: 'space-between', marginTop: 8,
    },
    progressLabel: { fontSize: 9, color: '#444', fontFamily: 'monospace' },
});
