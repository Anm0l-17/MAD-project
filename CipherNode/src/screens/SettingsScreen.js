// src/screens/SettingsScreen.js
import React, { useState, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, Switch, TextInput,
    StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { colors } from '../theme';
import { MY_NODE } from '../data/mockData';
import { getRelayUrl, setRelayUrl, connectSocket, DEFAULT_SERVER_URL } from '../utils/socket';

export default function SettingsScreen({ navigation }) {
    const [burnEnabled, setBurnEnabled] = useState(true);
    const [exifStrip, setExifStrip] = useState(true);
    const [deadman, setDeadman] = useState(false);
    
    const [relayInput, setRelayInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        getRelayUrl().then(url => setRelayInput(url));
    }, []);

    const handleSaveRelay = async () => {
        setIsSaving(true);
        await setRelayUrl(relayInput || DEFAULT_SERVER_URL);
        await connectSocket(); // Reconnect immediately with new URL
        setIsSaving(false);
        Alert.alert('Saved', 'Relay Server URL updated and reconnected.');
    };

    const SettingRow = ({ icon, iconBg, label, value, children }) => (
        <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: iconBg }]}>
                <Text>{icon}</Text>
            </View>
            <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>{label}</Text>
                {value ? <Text style={styles.rowValue}>{value}</Text> : null}
            </View>
            {children}
        </View>
    );

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={[styles.backText, { color: colors.cobalt }]}>‹</Text>
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerTitle}>Settings</Text>
                    <Text style={styles.headerSub}>Node configuration &amp; security</Text>
                </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Node banner */}
                <View style={styles.nodeBanner}>
                    <Text style={styles.nodeBannerText}>OPERATOR: {MY_NODE.onion}</Text>
                    <Text style={styles.nodeBannerSub}>RSA-4096:3A9F...C72E · Last rotate: 01 Apr 2026</Text>
                </View>

                {/* Tor circuit / Network */}
                <Text style={styles.groupLabel}>NETWORK & RELAY</Text>
                <View style={styles.card}>
                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Relay Server URL (Orbot/Tor/IP)</Text>
                        <TextInput
                            style={styles.textInput}
                            value={relayInput}
                            onChangeText={setRelayInput}
                            placeholder={DEFAULT_SERVER_URL}
                            placeholderTextColor={colors.text3}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity 
                            style={[styles.saveBtn, isSaving && { opacity: 0.5 }]} 
                            onPress={handleSaveRelay}
                            disabled={isSaving}
                        >
                            <Text style={styles.saveBtnText}>{isSaving ? 'Saving...' : 'Save & Reconnect'}</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.separator} />
                    <SettingRow icon="♾️" iconBg={colors.surface3} label="Circuit Rotation" value="Every 10 min">
                        <Text style={styles.chevron}>›</Text>
                    </SettingRow>
                </View>

                {/* Security */}
                <Text style={styles.groupLabel}>SECURITY</Text>
                <View style={styles.card}>
                    <SettingRow icon="🔐" iconBg={colors.cobaltDim} label="End-to-End Encryption">
                        <Switch value={true} disabled thumbColor="#fff" trackColor={{ true: colors.cobalt }} />
                    </SettingRow>
                    <View style={styles.separator} />
                    <SettingRow icon="⏱" iconBg="rgba(255,149,0,0.12)" label="Burn-on-Read">
                        <Switch
                            value={burnEnabled} onValueChange={setBurnEnabled}
                            thumbColor="#fff" trackColor={{ true: colors.cobalt }} />
                    </SettingRow>
                    <View style={styles.separator} />
                    <SettingRow icon="🗂️" iconBg={colors.cobaltDim} label="Strip EXIF Metadata">
                        <Switch
                            value={exifStrip} onValueChange={setExifStrip}
                            thumbColor="#fff" trackColor={{ true: colors.cobalt }} />
                    </SettingRow>
                    <View style={styles.separator} />
                    <SettingRow icon="💀" iconBg="rgba(255,59,48,0.12)" label="Dead Man's Switch">
                        <Switch
                            value={deadman} onValueChange={setDeadman}
                            thumbColor="#fff" trackColor={{ true: colors.danger }} />
                    </SettingRow>
                </View>

                {/* Danger */}
                <TouchableOpacity
                    style={styles.dangerBtn}
                    onPress={() => Alert.alert('Emergency Lock', 'Wipe session and lock all chats?',
                        [{ text: 'Cancel' }, { text: 'Lock', style: 'destructive', onPress: () => navigation.navigate('ChatList') }]
                    )}>
                    <Text style={{ fontSize: 24 }}>🚨</Text>
                    <View>
                        <Text style={styles.dangerLabel}>Emergency Lock</Text>
                        <Text style={styles.dangerSub}>Wipe session · Lock app</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.versionTap}>
                    <Text style={styles.versionText}>CipherNode v1.0.0</Text>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingTop: 52, paddingHorizontal: 14, paddingBottom: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backBtn: { padding: 6, marginRight: 4 },
    backText: { fontSize: 28, fontWeight: '300' },
    headerTitle: { fontSize: 20, fontWeight: '700', color: colors.text1 },
    headerSub: { fontSize: 11, color: colors.text3, fontFamily: 'monospace' },
    nodeBanner: {
        margin: 16,
        backgroundColor: colors.cobaltDim,
        borderWidth: 1, borderColor: colors.cobalt + '33',
        borderRadius: 12, padding: 14,
    },
    nodeBannerText: { fontSize: 10, color: colors.cobalt, fontFamily: 'monospace' },
    nodeBannerSub: { fontSize: 9, color: colors.text3, fontFamily: 'monospace', marginTop: 4 },
    groupLabel: {
        fontSize: 10, fontFamily: 'monospace', color: colors.text3,
        letterSpacing: 2, paddingHorizontal: 20, marginBottom: 6, marginTop: 4,
    },
    card: {
        marginHorizontal: 16, marginBottom: 20,
        backgroundColor: colors.surface1, borderRadius: 14,
        borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    },
    row: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 13,
    },
    inputRow: {
        paddingHorizontal: 14, paddingVertical: 13,
    },
    inputLabel: {
        fontSize: 12, color: colors.text2, marginBottom: 8, fontWeight: '600'
    },
    textInput: {
        backgroundColor: colors.surface2,
        borderWidth: 1, borderColor: colors.border,
        borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
        color: colors.text1, fontSize: 14, marginBottom: 12,
    },
    saveBtn: {
        backgroundColor: colors.cobalt,
        paddingVertical: 10, borderRadius: 8, alignItems: 'center',
    },
    saveBtnText: {
        color: '#fff', fontWeight: 'bold', fontSize: 13,
    },
    icon: {
        width: 32, height: 32, borderRadius: 8,
        alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    rowContent: { flex: 1 },
    rowLabel: { fontSize: 14, color: colors.text1 },
    rowValue: { fontSize: 11, color: colors.text3, fontFamily: 'monospace', marginTop: 1 },
    chevron: { color: colors.text3, fontSize: 18 },
    separator: { height: 1, marginLeft: 58, backgroundColor: colors.border },
    dangerBtn: {
        marginHorizontal: 16, marginBottom: 12,
        backgroundColor: 'rgba(255,59,48,0.08)',
        borderWidth: 1, borderColor: 'rgba(255,59,48,0.2)',
        borderRadius: 14, padding: 16,
        flexDirection: 'row', alignItems: 'center', gap: 14,
    },
    dangerLabel: { fontSize: 15, fontWeight: '600', color: colors.danger },
    dangerSub: { fontSize: 11, color: colors.danger + '88', marginTop: 2 },
    versionTap: { paddingVertical: 20, alignItems: 'center' },
    versionText: { fontSize: 11, color: colors.text3, fontFamily: 'monospace' },
});
