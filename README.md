# Mobi Live Chat Flutter Widget

Flutter iOS/Android wrapper for the Mobichat Web Widget with Firebase Cloud Messaging.

For the complete WebView, user identity, Firebase Cloud Messaging, APNs, Android, testing, and troubleshooting instructions, see [Mobichat Flutter Integration](MOBICHAT_FLUTTER_INTEGRATION.md).

## Configuration

1. The example `window.mobichatSettings` values (`app_id`, `user_id`, `fcm_token`, `source_id`, `visitor_id`, `metadata`) are `MobichatSettings.defaults` in `lib/mobichat_settings.dart`. **Edit & submit mobichatSettings** on the home screen opens a page where you can edit them. **Save only** stores them for the chat. **Submit to Mobichat** also sends them to the widget's identify API (`POST /api/public/web-widget/identify`), which creates or updates the visitor's contact without starting a conversation. If visitor_id is empty, Submit generates one and saves it, so the chat reuses that contact. In a real app, build `MobichatSettings` from the signed-in user and pass it to `LiveChatPage`. If HMAC identity is enabled, set `identity_hash` (or `--dart-define=MOBICHAT_IDENTITY_HASH=<hex>`). The host defaults to `https://app.mobichat.id`; override it with `--dart-define=MOBICHAT_HOST=<url>`.
2. The iOS target is configured for bundle ID `mobichat.MobiLiveChat`. Register that exact ID in the existing Firebase project, then add the downloaded `GoogleService-Info.plist` to `ios/Runner/` and include it in the Runner target in Xcode.
3. Register Android in Firebase as applicable, add `android/app/google-services.json`, and apply the Google Services Gradle plugin before attempting Android FCM delivery.
4. In Apple Developer, enable Push Notifications for the app identifier and upload an APNs authentication key to Firebase Cloud Messaging. The project contains `Runner.entitlements` and the `remote-notification` background mode; select a valid signing team/profile in Xcode so the final profile contains the push entitlement.
5. Enable and configure Firebase push notifications for this Web Widget channel in Mobichat.

The app requests notification permission, obtains the FCM token, calls `window.__mobichatSendFcmToken(token)` after the embedded widget page loads, and repeats that call on every FCM token refresh. Foreground notifications are shown locally; background notifications are handled by iOS/Android through FCM. Test remote notifications using a physical iOS device after APNs is configured.

## Security

The public Mobichat site ID may be included in the app. Never include an HMAC signing secret in Flutter. When secure identity is enabled, obtain `identity_hash` from an authenticated application backend and pass that returned value in `window.mobichatSettings`.

## Run

```text
flutter pub get
flutter run
```
