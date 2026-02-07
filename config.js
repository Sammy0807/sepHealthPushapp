// config.js - Environment Configuration Helper
// This file helps manage different environment configurations

const isDev = process.env.EXPO_PUBLIC_NODE_ENV === 'development';
const isDebug = process.env.EXPO_PUBLIC_DEBUG === 'true';

// Default URLs (fallbacks)
const DEFAULT_PROD_URL = 'https://sephealthbackend.onrender.com';
const DEFAULT_DEV_URL = 'http://192.168.5.221:3001';

// API Configuration
export const API_CONFIG = {
  // Base URL
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_PROD_URL,

  // Individual endpoints (with fallbacks)
  endpoints: {
    pushMessages: process.env.EXPO_PUBLIC_PUSH_API_ENDPOINT ||
      `${process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_PROD_URL}/api/push-messages`,

    deviceRegister: process.env.EXPO_PUBLIC_DEVICE_REGISTER_ENDPOINT ||
      `${process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_PROD_URL}/api/device/register`,

    immediateNotification: process.env.EXPO_PUBLIC_IMMEDIATE_NOTIFICATION_ENDPOINT ||
      `${process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_PROD_URL}/api/push-messages/immediate`,

    health: `${process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_PROD_URL}/api/health`,
    devices: `${process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_PROD_URL}/api/devices`,
    stats: `${process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_PROD_URL}/api/push-messages/stats`
  }
};

// App Configuration
export const APP_CONFIG = {
  isDevelopment: isDev,
  isDebug: isDebug,
  environment: process.env.EXPO_PUBLIC_NODE_ENV || 'production',
  projectId: process.env.EXPO_PUBLIC_PROJECT_ID || '191ff6fe-8518-4b0f-92dc-b5ab3e8b0e92',

  // Timeout settings
  requestTimeout: isDev ? 10000 : 15000, // 10s for dev, 15s for prod

  // Logging
  enableConsoleLog: isDev || isDebug,

  // UI settings
  showDebugInfo: isDev || isDebug
};

// Helper function to log configuration on app start
export const logConfiguration = () => {
  if (APP_CONFIG.enableConsoleLog) {
    console.log('🔧 App Configuration:');
    console.log(`   Environment: ${APP_CONFIG.environment}`);
    console.log(`   Debug Mode: ${APP_CONFIG.isDebug}`);
    console.log(`   Backend URL: ${API_CONFIG.baseUrl}`);
    console.log(`   Project ID: ${APP_CONFIG.projectId}`);
    console.log('\n📡 API Endpoints:');
    Object.entries(API_CONFIG.endpoints).forEach(([key, url]) => {
      console.log(`   ${key}: ${url}`);
    });
  }
};

// Helper function to test backend connectivity
export const testBackendConnection = async () => {
  try {
    console.log('🔍 Testing backend connection...');

    // Longer timeout for potential cold starts
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), 30000)
    );

    const fetchPromise = fetch(API_CONFIG.endpoints.health, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    const response = await Promise.race([fetchPromise, timeoutPromise]);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Backend connection successful:', data.status);
      return { success: true, data };
    } else {
      console.log('❌ Backend connection failed:', response.status);
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.log('❌ Backend connection error:', error.message);
    return { success: false, error: error.message };
  }
};

export default { API_CONFIG, APP_CONFIG, logConfiguration, testBackendConnection };