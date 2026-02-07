# Push Notification App

A minimal React Native app with Expo for receiving and testing push notifications from your backend API.

## Setup

1. **Install dependencies:**
   ```bash
   cd push-notification-app
   npm install
   ```

2. **Get your Expo Project ID:**
   - Run `npx expo login` (if not already logged in)
   - Run `npx expo whoami` to confirm login
   - The project ID will be generated when you first start the app
   - Or create a project at https://expo.dev

3. **Update App.js:**
   - Replace `'your-project-id'` in App.js with your actual Expo project ID
   - You can find this in your Expo dashboard or in the app.json after first run

## Running the App

### Start the development server:
```bash
npx expo start
```

### Run on specific platform:
```bash
npx expo start --android  # For Android
npx expo start --ios      # For iOS (Mac only)
```

### Using Expo Go App:
1. Install "Expo Go" app on your physical device from App Store or Play Store
2. Scan the QR code shown in the terminal
3. **Note:** Push notifications require a physical device, not an emulator

## Features

- **Automatic Permission Request:** App requests notification permissions on launch
- **Push Token Display:** Shows your Expo push token (needed for sending remote notifications)
- **API Integration:** Fetches scheduled messages from `https://sephealthinformatics.com/api/push-messages`
- **Message List:** Displays all scheduled messages with title, content, status, and scheduled time
- **Pull to Refresh:** Swipe down to refresh messages from the API
- **Test Button:** Each message has a "Test" button to send it as a local notification immediately
- **Last Notification:** Shows the most recently received notification at the top

## API Integration

The app connects to your backend API endpoint:
```
GET https://sephealthinformatics.com/api/push-messages
```

Expected response format:
```json
{
  "success": true,
  "data": [
    {
      "_id": "68daaf16e56e41ba5df60759",
      "title": "test messages",
      "content": "test message content",
      "sendDate": "2025-09-30",
      "sendTime": "09:00",
      "status": "Scheduled",
      "scheduledDateTime": "2025-09-30T09:00:00.000Z"
    }
  ],
  "count": 2
}
```

## Testing Push Notifications

### Local Notifications (works immediately):
Press the "Test" button on any message card to trigger that notification locally after 1 second.

### Remote Notifications (from your backend):
1. Copy your push token from the app
2. Send it to your backend API
3. Use Expo's Push API from your backend:

```bash
curl -H "Content-Type: application/json" \
     -X POST https://exp.host/--/api/v2/push/send \
     -d '{
       "to": "EXPO_PUSH_TOKEN_FROM_APP",
       "title": "Your Message Title",
       "body": "Your message content"
     }'
```

## Important Notes

- **Physical Device Required:** Push notifications don't work on iOS Simulator or most Android emulators
- **iOS Additional Setup:** For standalone builds, you'll need Apple Developer account and proper certificates
- **Android 13+:** Notification permissions are required (handled automatically by the app)
- **API Connection:** Ensure your device has internet access to fetch messages

## Troubleshooting

- If you don't see notifications, check device notification settings
- Make sure Expo Go app has notification permissions
- For iOS, ensure "Allow Notifications" is enabled in Settings > Expo Go
- For Android, ensure notification permissions are granted
- If messages don't load, check your internet connection and API endpoint availability

## Next Steps

1. Save user push tokens to your database when they register
2. Implement backend logic to send notifications using Expo Push API
3. Track delivery and open rates in your backend
4. Add user preferences for notification types