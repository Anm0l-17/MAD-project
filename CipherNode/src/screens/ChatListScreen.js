// src/screens/ChatListScreen.js
import React, { useState, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    StyleSheet, StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CONTACTS, INITIAL_MESSAGES, MY_NODE } from '../data/mockData';
import { isTorActive } from '../utils/socket';
import { colors } from '../theme';

function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short' });
}

function getAvatarColor(hue) {
    return `hsl(${hue}, 50%, 30%)`;
}

function getInitials(alias) {
    return alias.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function ContactRow({ contact, lastMsg, onPress }) {
    const accentColor = colors.cobalt;
    return (
        <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
            <View style={[styles.avatar, { backgroundColor: getAvatarColor(contact.hue) }]}>
                <Text style={styles.avatarText}>{getInitials(contact.alias)}</Text>
                <View style={[
                    styles.onlineDot,
                    { backgroundColor: contact.online ? accentColor : '#333' }
                ]} />
            </View>
            <View style={styles.rowInfo}>
                <View style={styles.rowTop}>
                    <Text style={styles.contactName}>{contact.alias}</Text>
                    <Text style={styles.rowTime}>
                        {lastMsg ? formatTime(lastMsg.timestamp) : ''}
                    </Text>
                </View>
                <View style={styles.rowBottom}>
                    <Text style={styles.preview} numberOfLines={1}>
                        {lastMsg
                            ? (lastMsg.burned ? '🔥 Message burned' : lastMsg.text)
                            : 'No messages — tap to start'}
                    </Text>
                    {lastMsg?.burnDuration && !lastMsg.burned && !lastMsg.isOutgoing && (
                        <Text style={styles.burnTag}>⏱ BURN</Text>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
}

export default function ChatListScreen({ navigation }) {
    const [messages, setMessages] = useState(INITIAL_MESSAGES);
    const [torConnected, setTorConnected] = useState(isTorActive());

    useFocusEffect(
        useCallback(() => {
            StatusBar.setBarStyle('light-content');
            setTorConnected(isTorActive());
        }, [])
    );

    const getLastMsg = (contactId) => {
        const msgs = messages[contactId] || [];
        const active = msgs.filter(m => !m.burned);
        return active[active.length - 1];
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />

            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>CipherNode</Text>
                    <Text style={[styles.headerSub, { color: torConnected ? colors.emerald : colors.danger }]}>
                        {torConnected ? '● Tor Circuit Active' : '● Tor Disconnected'}
                    </Text>
                </View>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        style={[styles.headerBtn, { backgroundColor: 'rgba(0,230,118,0.1)', borderColor: colors.emerald + '66' }]}
                        onPress={() => navigation.navigate('PeerConnect')}>
                        <Text style={[styles.headerBtnText, { color: colors.emerald }]}>🔗 Connect</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Node ID pill */}
            <View style={[styles.nodePill, { borderColor: accentColor + '44' }]}>
                <View style={[styles.nodeDot, { backgroundColor: accentColor }]} />
                <Text style={styles.nodeText} numberOfLines={1}>{MY_NODE.onion}</Text>
                <Text style={styles.nodeIcon}>›</Text>
            </View>

            {/* Section label */}
            <Text style={styles.sectionLabel}>
                ACTIVE NODES
            </Text>

            <FlatList
                data={CONTACTS}
                keyExtractor={c => c.id}
                renderItem={({ item }) => (
                    <ContactRow
                        contact={item}
                        lastMsg={getLastMsg(item.id)}
                        onPress={() => navigation.navigate('Conversation', {
                            contact: item, vaultMode: false,
                        })}
                    />
                )}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                ListEmptyComponent={() => (
                    <View style={styles.empty}>
                        <Text style={styles.emptyText}>No contacts found</Text>
                    </View>
                )}
            />

            {/* Bottom tab bar */}
            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tab, { borderTopColor: accentColor }]}
                    onPress={() => null}>
                    <Text style={[styles.tabIcon, { color: accentColor }]}>💬</Text>
                    <Text style={[styles.tabLabel, { color: accentColor }]}>Chats</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.tab}
                    onPress={() => navigation.navigate('Settings')}>
                    <Text style={styles.tabIcon}>⚙️</Text>
                    <Text style={styles.tabLabel}>Settings</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
    },
    headerTitle: { fontSize: 22, fontWeight: '800', color: colors.text1 },
    headerSub: { fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
    headerActions: { flexDirection: 'row', gap: 8 },
    headerBtn: {
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 20, borderWidth: 1,
    },
    headerBtnText: { fontSize: 12, fontWeight: '600' },
    nodePill: {
        marginHorizontal: 20, marginBottom: 10,
        backgroundColor: colors.surface1,
        borderWidth: 1, borderRadius: 999,
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 9, gap: 8,
    },
    nodeDot: { width: 7, height: 7, borderRadius: 99 },
    nodeText: { flex: 1, fontFamily: 'monospace', fontSize: 10, color: colors.text2 },
    nodeIcon: { color: colors.text3, fontSize: 16 },
    sectionLabel: {
        fontSize: 10, fontFamily: 'monospace', color: colors.text3,
        letterSpacing: 2, paddingHorizontal: 20, paddingBottom: 6,
    },
    row: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 13,
    },
    avatar: {
        width: 48, height: 48, borderRadius: 24,
        alignItems: 'center', justifyContent: 'center',
        marginRight: 14, position: 'relative',
    },
    avatarText: { fontSize: 16, fontWeight: '700', color: '#fff' },
    onlineDot: {
        position: 'absolute', bottom: 1, right: 1,
        width: 10, height: 10, borderRadius: 5,
        borderWidth: 2, borderColor: colors.bg,
    },
    rowInfo: { flex: 1, minWidth: 0 },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
    contactName: { fontSize: 15, fontWeight: '600', color: colors.text1 },
    rowTime: { fontSize: 11, color: colors.text3, fontFamily: 'monospace' },
    rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    preview: { fontSize: 13, color: colors.text3, flex: 1 },
    burnTag: { fontSize: 10, color: '#FF9500', fontFamily: 'monospace' },
    separator: { height: 1, marginLeft: 82, backgroundColor: colors.border },
    empty: { flex: 1, alignItems: 'center', paddingTop: 60 },
    emptyText: { color: colors.text3, fontFamily: 'monospace', fontSize: 12 },
    tabBar: {
        flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border,
        backgroundColor: colors.bg,
    },
    tab: {
        flex: 1, alignItems: 'center', paddingVertical: 12,
        borderTopWidth: 2, borderTopColor: 'transparent',
    },
    tabIcon: { fontSize: 20, marginBottom: 3 },
    tabLabel: { fontSize: 10, color: colors.text3 },
});
