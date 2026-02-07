import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { StyleSheet, Text, View, TouchableOpacity, Platform, Alert, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// Check if running in web environment
const isWeb = Platform.OS === 'web';

// Configure how notifications are handled when app is in foreground (mobile only)
if (!isWeb) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// Use network IP instead of localhost for mobile device connectivity
const BULL_QUEUE_SERVER = process.env.EXPO_PUBLIC_PUSH_API_ENDPOINT?.replace('/api/push-messages', '') || 'http://192.168.5.221:3001';
const API_ENDPOINT = `${BULL_QUEUE_SERVER}/api/push-messages`;
const DEVICE_REGISTER_ENDPOINT = `${BULL_QUEUE_SERVER}/api/device/register`;

console.log('🔗 Mobile app connecting to Bull Queue server:', BULL_QUEUE_SERVER);

export default function App() {
  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tokenRegistered, setTokenRegistered] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const notificationListener = useRef();
  const responseListener = useRef();
  const shownNotifications = useRef(new Set()); // Track IDs of messages already shown as local notifications
  const pollingTimer = useRef(null);

  useEffect(() => {
    if (isWeb) {
      // For web, simulate a token and register as web device
      const webToken = 'web-simulator-token-' + Date.now();
      setExpoPushToken(webToken);
      registerWebDevice(webToken);
    } else {
      // Mobile device registration
      registerForPushNotificationsAsync().then(token => {
        setExpoPushToken(token);
        // Register token with backend
        if (token) {
          registerTokenWithBackend(token);
        }
      });

      // Listener for notifications received while app is foregrounded
      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        setNotification(notification);
      });

      // Listener for when user taps on notification
      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('Notification tapped:', response);
      });
    }

    // Fetch messages on mount
    fetchMessages();

    // Start auto-polling (every 60 seconds) to bypass Expo Go remote notification limitation
    if (!isWeb) {
      console.log('🔄 Starting auto-polling for "Sent" messages (60s interval)...');
      pollingTimer.current = setInterval(() => {
        fetchMessages(true); // pass true to indicate it's a background poll
      }, 60000);
    }

    // Socket.io for faster real-time updates
    const socket = io(BULL_QUEUE_SERVER);

    socket.on('connect', () => {
      console.log('🔌 Real-time Socket.io connected to:', BULL_QUEUE_SERVER);
    });

    socket.on('statusUpdate', (update) => {
      console.log('🚀 Real-time update received:', update.messageId, update.status);

      // Update local state immediately
      setMessages(prev => prev.map(msg =>
        msg._id === update.messageId
          ? { ...msg, status: update.status, deliveredAt: update.deliveredAt }
          : msg
      ));

      // If it's a new "Sent" message, trigger a quick poll to get details and show notification
      if (update.status === 'Sent' && !shownNotifications.current.has(update.messageId)) {
        console.log('🔔 Status changed to Sent, triggering immediate content fetch...');
        fetchMessages(true);
      }
    });

    socket.on('connect_error', (err) => {
      console.log('⚠️ Socket.io connection error:', err.message);
    });

    return () => {
      if (!isWeb) {
        Notifications.removeNotificationSubscription(notificationListener.current);
        Notifications.removeNotificationSubscription(responseListener.current);
        if (pollingTimer.current) clearInterval(pollingTimer.current);
      }
      socket.disconnect();
    };
  }, []);

  const registerWebDevice = async (token) => {
    try {
      console.log('🌐 Registering web device with Bull Queue server...');

      const response = await fetch(DEVICE_REGISTER_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pushToken: token,
          platform: 'web',
          appVersion: '1.0.0',
          userId: null,
          healthProfile: {}
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ Web device registered successfully');
        setTokenRegistered(true);
      } else {
        console.error('❌ Failed to register web device:', result.error);
      }
    } catch (error) {
      console.error('❌ Network error registering web device:', error);
      Alert.alert('Connection Error', 'Could not connect to Bull Queue server');
    }
  };

  const registerTokenWithBackend = async (token) => {
    try {
      console.log('� Attempting to register token with backend:', DEVICE_REGISTER_ENDPOINT);
      setLoading(true);

      const deviceInfo = {
        brand: Device.brand,
        modelName: Device.modelName,
        osName: Device.osName,
        osVersion: Device.osVersion,
        deviceName: Device.deviceName
      };

      const response = await fetch(DEVICE_REGISTER_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pushToken: token,
          platform: Platform.OS,
          appVersion: '1.0.0',
          userId: null, // Could link to SEPHealth user if available
          healthProfile: {} // Could be populated with user health preferences
        }),
      });

      console.log('📡 Response received from backend:', response.status);
      const result = await response.json();
      console.log('📦 Backend response result:', result);

      if (result.success) {
        console.log('✅ Device registered successfully with Bull Queue server');
        console.log('   Device ID:', result.deviceId);
        setTokenRegistered(true);
        Alert.alert('Success', 'Device registered successfully!');
      } else {
        console.error('❌ Failed to register device:', result.error);
        Alert.alert('Registration Error', result.error || 'Failed to register device');
      }
    } catch (error) {
      console.error('❌ Network error registering device:', error);
      Alert.alert('Connection Error', `Could not reach backend at ${BULL_QUEUE_SERVER}. Check Wi-Fi/Firewall.`);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (isPoll = false) => {
    if (!isPoll) {
      console.log('📥 Fetching messages from:', API_ENDPOINT);
      setLoading(true);
    }

    // Use AbortController for compatible timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (isPoll) {
        // console.log(`🔍 Polling: Fetched ${result.data?.length || 0} messages`);
      } else {
        console.log('📨 Messages response:', result);
      }
      if (result.success && result.data) {
        const fetchedMessages = result.data;
        setMessages(fetchedMessages);

        // On first load, mark all existing 'Sent' messages as "already shown" 
        // to prevent a notification explosion from the backlog
        if (!isPoll) {
          fetchedMessages.forEach(msg => {
            if (msg.status === 'Sent') {
              shownNotifications.current.add(msg._id);
            }
          });
          console.log(`🧊 Initialized: ${shownNotifications.current.size} messages marked as seen.`);
        }

        // Check for newly "Sent" messages to trigger local notifications
        // Only alert if sent in the last 2 minutes to prevent duplicates/backlog
        if (!isWeb && isPoll) {
          const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
          fetchedMessages.forEach(msg => {
            const sentAt = msg.deliveredAt ? new Date(msg.deliveredAt) : new Date(msg.updatedAt);
            if (msg.status === 'Sent' && !shownNotifications.current.has(msg._id) && sentAt > twoMinutesAgo) {
              console.log('🔔 Polling found new "Sent" message, triggering local alert:', msg.title);
              sendNotificationFromMessage(msg);
              shownNotifications.current.add(msg._id);
            }
          });
        }
      } else if (result.success && Array.isArray(result)) {
        setMessages(result);
      }
    } catch (error) {
      if (!isPoll) {
        console.error('❌ Error fetching messages:', error);
        Alert.alert('Connection Error', 'Could not connect to Bull Queue server.');
      }
    } finally {
      if (!isPoll) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchMessages();
  };

  const sendNotificationFromMessage = async (message) => {
    if (isWeb) {
      Alert.alert('Test Notification', `${message.title}\n\n${message.content || message.body}`);
    } else {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: message.title,
          body: message.content || message.body,
          data: { messageId: message._id },
        },
        trigger: { seconds: 1 },
      });
    }
  };

  const sendTestNotification = async () => {
    if (!expoPushToken) {
      Alert.alert('Error', 'No push token available');
      return;
    }

    setTestingNotification(true);

    try {
      console.log('🧪 Sending test notification via Bull Queue...');

      const response = await fetch(`${BULL_QUEUE_SERVER}/api/push-messages/immediate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'SEPHealth Test',
          body: isWeb
            ? 'This is a test notification from the web app! (Push notifications don\'t work in browsers, but the API call succeeded)'
            : 'This is a test notification from your mobile app!',
          category: 'Test',
          deviceId: expoPushToken.includes('web-simulator') ? null : undefined
        }),
      });

      const result = await response.json();
      console.log('📋 Test notification result:', result);

      if (result.success) {
        console.log('✅ Test notification created successfully');

        // Refresh messages to see the new test message
        await fetchMessages();

        if (isWeb) {
          Alert.alert('Success!', `Test notification created successfully!\n\nCreated ${result.results?.length || 1} notification(s). Check the message list below.`);
        } else {
          Alert.alert('Success', 'Test notification sent via Bull Queue!');
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to send test notification');
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
      Alert.alert('Error', 'Failed to send test notification. Make sure Bull Queue server is running.');
    } finally {
      setTestingNotification(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';

    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Push Notifications</Text>

      <View style={styles.tokenSection}>
        <Text style={styles.tokenLabel}>Connection Status</Text>
        <Text style={styles.serverInfo}>Server: {BULL_QUEUE_SERVER}</Text>
        <Text style={styles.platformInfo}>Platform: {Platform.OS} {isWeb ? '(Browser)' : '(Native)'}</Text>
        <Text style={styles.tokenStatus}>
          {tokenRegistered ? '✅ Device Registered' : (loading ? '⏳ Registering...' : '❌ Not Registered')}
        </Text>
        {isWeb && (
          <Text style={styles.webNotice}>
            ⚠️ Web Mode: Push notifications don't work in browsers, but you can test the API
          </Text>
        )}
        <Text style={styles.token} numberOfLines={2}>
          Token: {expoPushToken ? expoPushToken.substring(0, 30) + '...' : 'Getting token...'}
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        {/* <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#FF9500' }]}
          onPress={() => {
            if (isWeb) {
              const webToken = 'web-simulator-token-' + Date.now();
              setExpoPushToken(webToken);
              registerWebDevice(webToken);
            } else {
              registerForPushNotificationsAsync().then(token => {
                if (token) {
                  setExpoPushToken(token);
                  registerTokenWithBackend(token);
                } else {
                  Alert.alert('Error', 'Could not get push token');
                }
              });
            }
          }}
          disabled={loading}
        >
          <Text style={styles.actionButtonText}>🔑 Register</Text>
        </TouchableOpacity> */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onRefresh}
          disabled={loading}
        >
          <Text style={styles.actionButtonText}>🔄 Refresh</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.testButton]}
          onPress={sendTestNotification}
          disabled={!expoPushToken || testingNotification}
        >
          <Text style={styles.actionButtonText}>
            {testingNotification ? '⏳ Testing...' : '📨 Test'}
          </Text>
        </TouchableOpacity>
      </View>

      {notification && (
        <View style={styles.lastNotification}>
          <Text style={styles.lastNotificationTitle}>
            {notification.request.content.title}
          </Text>
          <Text style={styles.lastNotificationBody}>
            {notification.request.content.body}
          </Text>
        </View>
      )}

      <View style={styles.messagesHeader}>
        <Text style={styles.messagesTitle}>Messages ({messages.length})</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <Text style={styles.refreshText}>↻</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <ScrollView
          style={styles.messagesList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {messages.map((message) => (
            <View key={message._id} style={styles.messageCard}>
              <View style={styles.messageHeader}>
                <Text style={styles.messageTitle}>{message.title}</Text>
                <Text style={styles.messageStatus}>{message.status}</Text>
              </View>
              <Text style={styles.messageContent}>{message.content || message.body}</Text>
              <Text style={styles.messageDate}>
                {formatDate(message.scheduledDateTime || message.createdAt)}
              </Text>
              <Text style={styles.messageCategory}>
                {message.category} • {message.priority || 'normal'} • {message.healthCategory}
              </Text>
              <TouchableOpacity
                style={styles.testButton}
                onPress={() => sendNotificationFromMessage(message)}
              >
                <Text style={styles.testButtonText}>Test</Text>
              </TouchableOpacity>
            </View>
          ))}

          {messages.length === 0 && !loading && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No scheduled messages</Text>
              <Text style={styles.emptyStateSubtext}>Pull down to refresh</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

async function registerForPushNotificationsAsync() {
  let token;

  console.log('🛡️ Starting push notification permission check...');
  // Don't try to register for push notifications on web
  if (isWeb) {
    console.log('🌐 Web mode detected, skipping native notifications');
    return null;
  }

  if (Platform.OS === 'android') {
    console.log('🤖 Configuring Android notification channel...');
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  console.log('📱 Checking if device is physical:', Device.isDevice);
  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    console.log('🔐 Current permission status:', existingStatus);

    if (existingStatus !== 'granted') {
      console.log('🔓 Requesting permissions...');
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('⛔ Permissions denied');
      Alert.alert('Failed to get push token for push notification!');
      return;
    }

    console.log('🎟️ Fetching Expo Push Token...');
    try {
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? '83d4b978-dc73-495d-9af4-64d054ca3b95';
      console.log('🆔 Using projectId:', projectId);

      token = (await Notifications.getExpoPushTokenAsync({
        projectId: projectId
      })).data;
      console.log('🎫 Token received:', token);
    } catch (e) {
      console.error('❌ Error fetching push token:', e);
      Alert.alert('Token Error', 'Failed to get Expo push token. Are you logged into Expo?');
    }
  } else {
    console.log('⚠️ Using emulator - falling back to dummy token');
    token = 'emulator-token-' + Device.modelName + '-' + Date.now();
  }

  return token;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
  },
  tokenSection: {
    marginHorizontal: 20,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 15,
  },
  tokenLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  serverInfo: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  platformInfo: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  tokenStatus: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
  },
  webNotice: {
    fontSize: 11,
    color: '#FF8C00',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  token: {
    fontSize: 9,
    color: '#555',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 20,
    marginBottom: 15,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  lastNotification: {
    marginHorizontal: 20,
    padding: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4caf50',
    marginBottom: 15,
  },
  lastNotificationTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  lastNotificationBody: {
    fontSize: 12,
    color: '#555',
  },
  messagesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 10,
  },
  messagesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  refreshButton: {
    padding: 5,
  },
  refreshText: {
    fontSize: 24,
    color: '#007AFF',
  },
  loader: {
    marginTop: 50,
  },
  messagesList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  messageCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 15,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  messageStatus: {
    fontSize: 11,
    color: '#666',
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  messageContent: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  messageDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 5,
  },
  messageCategory: {
    fontSize: 11,
    color: '#777',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  testButton: {
    backgroundColor: '#28a745',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  testButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
  },
});