import React, { useEffect } from 'react';
import { preventScreenCaptureAsync } from 'expo-screen-capture';
import * as Clipboard from 'expo-clipboard';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Screens
import ChatListScreen from './src/screens/ChatListScreen';
import ConversationScreen from './src/screens/ConversationScreen';
import PeerConnectScreen from './src/screens/PeerConnectScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ScanQRScreen from './src/screens/ScanQRScreen';

// Socket
import { connectSocket } from './src/utils/socket';

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    // Connect to relay on launch (Tor runtime is disabled)
    const initSocket = async () => {
      const socket = await connectSocket();
      if (!socket) {
        console.warn('[App] Relay connection unavailable. Running in offline/local mode.');
      }
    };
    initSocket();

    // Hardening 1: Prevent Screen Capture
    const disableCapture = async () => {
      try {
        await preventScreenCaptureAsync();
      } catch (e) {
        console.log('Screen capture prevention unsupported on this device', e);
      }
    };
    disableCapture();

    // Hardening 2: Clear Clipboard every 5 minutes
    const interval = setInterval(async () => {
      await Clipboard.setStringAsync('');
      console.log('Clipboard wiped automatically.');
    }, 300000);

    return () => clearInterval(interval);
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="ChatList"
          screenOptions={{
            headerShown: false,
            animation: 'fade',
          }}
        >
          <Stack.Screen name="ChatList" component={ChatListScreen} />
          <Stack.Screen name="Conversation" component={ConversationScreen} />
          <Stack.Screen name="PeerConnect" component={PeerConnectScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="ScanQR" component={ScanQRScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
