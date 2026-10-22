# Mobichat Flutter Integration

This guide explains how to embed the Mobichat Web Widget in a Flutter application and how to configure Firebase Cloud Messaging (FCM) push notifications.

> The public Mobichat site ID is safe to include in a client app. Do **not** put a Mobichat identity-signing secret, Firebase service-account key, APNs key, or other server secret in Flutter source code.

## 1. Prerequisites

- A Mobichat Web Widget site ID.
- Flutter application targeting iOS and/or Android.
- A Firebase project when push notifications are required.
- An Apple Developer account for iOS push delivery.

## 2. Add Flutter dependencies

Add these packages to `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  webview_flutter: ^4.8.0
  firebase_core: ^4.7.0
  firebase_messaging: ^16.2.0
  flutter_local_notifications: ^19.5.0
```

Fetch them with `flutter pub get`.

## 3. Configure the Mobichat Web Widget

The Web Widget is loaded inside a `WebView`. Define the widget script URL, site ID, and the signed-in application user.

```dart
const widgetScriptUrl =
    'https://app.mobichat.id/js/mobichat-web-widget.js';
const siteId = 'YOUR_MOBICHAT_SITE_ID';

const userId = 'YOUR_AUTHENTICATED_USER_ID';
const userName = 'User name';
const userEmail = 'user@example.com';
```

Create an HTML document that configures Mobichat before loading the script:

```dart
String widgetHtml() => '''<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
  </style>
</head>
<body>
<script>
  window.Mobichat = window.Mobichat || function() {
    (window.Mobichat.q = window.Mobichat.q || []).push(arguments);
  };

  window.mobichatSettings = {
    app_id: ${jsonEncode(siteId)},
    user_id: ${jsonEncode(userId)},
    name: ${jsonEncode(userName)},
    email: ${jsonEncode(userEmail)}
  };

  window.__mobichatSendFcmToken = function(token) {
    return window.Mobichat('identify', Object.assign(
      {}, window.mobichatSettings, { fcm_token: token }
    ));
  };
</script>
<script async src="$widgetScriptUrl"></script>
</body>
</html>''';
```

### Important iOS origin setting

Always set `baseUrl` when loading the HTML. Without it, iOS WebKit can assign an opaque origin and the widget API calls may fail or be repeatedly retried.

```dart
final controller = WebViewController()
  ..setJavaScriptMode(JavaScriptMode.unrestricted)
  ..loadHtmlString(
    widgetHtml(),
    baseUrl: 'https://app.mobichat.id/',
  );
```

### Make the widget fit a phone screen

The normal web widget is a floating panel. On a phone, make the panel full-screen inside its Shadow DOM after the widget has loaded:

```dart
await controller.runJavaScript('''
(function () {
  var root = document.getElementById('mobichat-web-widget-root');
  if (!root || !root.shadowRoot) return;

  var style = document.createElement('style');
  style.textContent = `
    .panel {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100dvh !important;
      max-width: 100vw !important;
      max-height: 100dvh !important;
      border-radius: 0 !important;
    }
  `;
  root.shadowRoot.appendChild(style);
  window.Mobichat('open');
})();
''');
```

Because the loader is asynchronous, invoke this after the widget root exists. Polling briefly for `#mobichat-web-widget-root`, or providing an app-specific readiness event, is more reliable than calling it immediately after `onPageFinished`.

## 4. Identify authenticated users securely

Use a stable ID from the user authenticated in the Flutter application. Do not use a constant test ID in production.

If Mobichat secure identity/HMAC verification is enabled:

1. Flutter authenticates to your application backend.
2. Your backend creates the signed identity payload or `identity_hash`.
3. Flutter passes **only the resulting signature** with the user profile to `window.mobichatSettings`.

```dart
window.mobichatSettings = {
  app_id: 'YOUR_MOBICHAT_SITE_ID',
  user_id: 'YOUR_USER_ID',
  name: 'Jhon Doe',
  email: 'jhon@doe.com',
  identity_hash: 'SIGNATURE_RETURNED_BY_YOUR_BACKEND'
};
```

Never calculate the signature in the mobile app because that would expose the secret.

### Source ID, visitor ID and visitor screening info

`window.mobichatSettings` also accepts:

```js
window.mobichatSettings = {
  app_id: "YOUR_MOBICHAT_SITE_ID",
  user_id: "YOUR_USER_ID",
  fcm_token: "FCM_TOKEN",
  source_id: "YOUR_SOURCE_ID_OR_PHONE",
  visitor_id: "YOUR_VISITOR_ID",
  metadata: {
    name: "YOUR_NAME",
    company: "YOUR_COMPANY",
    membership: "YOUR_MEMBERSHIP",
  },
};
```

- `source_id`: host-defined identifier for where the user comes from, such as a phone number or account ID.
- `metadata`: visitor screening info. The widget fills each screening field whose id, type or title matches a key, ignoring case. When every required field has a value, the screening form is skipped. Otherwise the form opens with the matched values filled in. The widget keeps at most 10 keys.
- `visitor_id`: the widget reads its visitor ID from `localStorage` key `mobichat_visitor_<app_id>`, not from the settings object. Set that key before loading the widget script to reuse a visitor ID.
- `fcm_token`: when present it is registered with the identity. The sample app sends the device's Firebase token instead when this is empty.

The sample app builds these from `MobichatSettings` (`lib/mobichat_settings.dart`). It also removes the saved screening answers (`mobichat_screening_<app_id>`) before each load, so the current `metadata` is always used.

### Changing source_id, name and metadata

Where each value comes from:

| Value          | Set it in                   | Shown in Mobichat as                                      |
| -------------- | --------------------------- | --------------------------------------------------------- |
| `source_id`    | `MobichatSettings.sourceId` | the contact's `source_id`                                 |
| name           | `metadata` key `name`       | the contact name and the screening **Name** field         |
| other metadata | `MobichatSettings.metadata` | the contact's host metadata and matching screening fields |

The sample app has no separate name setting. `MobichatSettings.toIdentity()` copies the `name` and `email` metadata keys (any letter case) to top-level `name` and `email`, which is where Mobichat reads the contact name from. Both `window.mobichatSettings` and the submit call use `toIdentity()`.

There are four ways to change the values.

**1. In code, before the chat opens.** Build the settings from your signed-in user and pass them to `LiveChatPage`:

```dart
final settings = MobichatSettings(
  appId: 'YOUR_MOBICHAT_SITE_ID',
  userId: currentUser.id,
  sourceId: currentUser.phoneNumber,   // e.g. '6281234567891'
  visitorId: savedVisitorId,           // optional, see "visitor_id" above
  metadata: {
    'name': currentUser.fullName,      // contact name + screening Name
    'company': currentUser.company,
    'membership': currentUser.tier,
  },
);
await settings.save(); // optional: the sample's chat buttons open with the saved values
Navigator.of(context).push(MaterialPageRoute(
  builder: (_) => LiveChatPage(settings: settings),
));
```

To change the sample's built-in example values, edit `MobichatSettings.defaults` in `lib/mobichat_settings.dart`.

**2. In the sample app.** On the home screen, tap **Edit & submit mobichatSettings**, change the fields and metadata rows, then tap **Save only** (used the next time the chat opens) or **Submit to Mobichat** (also sent to Mobichat now). The reset button in the app bar restores `MobichatSettings.defaults`.

**3. Without opening the chat.** Send the values to the widget's identify API. Mobichat creates or updates the visitor's contact and starts no conversation:

```dart
final result = await submitMobichatSettings('https://app.mobichat.id', settings);
if (!result.saved) {
  // Ignored by Mobichat: result.reason is e.g. 'hash_mismatch', 'require_verified' or 'rate_limited'.
}
```

This is `POST /api/public/web-widget/identify?siteId=<app_id>` with body `{ siteId, visitorId, identity }`, where `identity` is `settings.toIdentity()`. `visitorId` is required. Use the same visitor ID that the chat injects later, so both update the same contact.

**4. While the chat is open.** Call `identify` in the WebView:

```dart
final identity = settings.toIdentity(); // the full, updated settings
await webViewController.runJavaScript(
  "window.Mobichat('identify', ${jsonEncode(identity)});",
);
```

The contact updates straight away. The screening answers for this chat are already set, so changed screening values apply the next time the chat loads.

Rules for every update:

- **Always send the full set of values.** Mobichat replaces the stored metadata instead of merging keys, so a missing key is deleted. An identify call without `name` resets the contact name to the visitor's session ID.
- **Keep `user_id` and the visitor ID the same** to update the same contact. A different visitor ID (without `identity_hash`) creates a different contact.
- **Limits:** at most 10 metadata keys. Keys longer than 64 characters, values and `source_id` longer than 255 characters are cut off. Empty values are allowed, but an empty value doesn't satisfy a required screening field.
- **Trust:** `identity_hash` signs only `user_id`. `name`, `source_id` and `metadata` are unverified, so don't use them for authorization.

## 5. Add Firebase to Flutter

Initialize Firebase before calling `runApp`:

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  await Firebase.initializeApp();
  runApp(const MyApp());
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}
```

The background handler must be a top-level function.

## 6. Request permission and collect the FCM token

On iOS, call `requestPermission` before expecting alerts. Get the FCM token and send it to the Web Widget once the WebView page is ready.

```dart
Future<void> configurePush(WebViewController controller) async {
  final messaging = FirebaseMessaging.instance;
  final settings = await messaging.requestPermission(
    alert: true,
    badge: true,
    sound: true,
  );

  if (settings.authorizationStatus == AuthorizationStatus.denied) {
    return;
  }

  Future<void> sendToken(String token) {
    return controller.runJavaScript(
      'window.__mobichatSendFcmToken(${jsonEncode(token)});',
    );
  }

  final token = await messaging.getToken();
  if (token != null) await sendToken(token);

  FirebaseMessaging.instance.onTokenRefresh.listen(sendToken);
}
```

Wait until both conditions are true before calling `sendToken`:

- `onPageFinished` has run for the widget page.
- An FCM registration token is available.

The application must resend the token whenever it refreshes.

## 7. Show notifications while the app is open

iOS does not automatically display incoming notification alerts while the app is in the foreground. Listen to `FirebaseMessaging.onMessage` and use `flutter_local_notifications` to show a local alert.

```dart
FirebaseMessaging.onMessage.listen((RemoteMessage message) async {
  final notification = message.notification;
  if (notification == null) return;

  await localNotifications.show(
    notification.hashCode,
    notification.title ?? 'New message',
    notification.body ?? '',
    const NotificationDetails(
      iOS: DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
      ),
    ),
  );
});
```

Initialize `FlutterLocalNotificationsPlugin` before subscribing to this stream.

## 8. iOS Firebase and APNs setup

### Firebase configuration file

1. Register the exact iOS bundle ID in Firebase.
2. Download `GoogleService-Info.plist`.
3. Put it at `ios/Runner/GoogleService-Info.plist`.
4. In Xcode, ensure it is included in the **Runner** target's **Copy Bundle Resources** build phase.

The Firebase app bundle ID and `PRODUCT_BUNDLE_IDENTIFIER` must match exactly.

### Enable push in Apple Developer

1. In Apple Developer, enable **Push Notifications** for the exact App ID/bundle ID.
2. Create or refresh the provisioning profile after enabling the capability.
3. In Xcode, add the **Push Notifications** capability to the Runner target.
4. Add **Background Modes** and enable **Remote notifications**.
5. Create an APNs authentication key (`.p8`) in Apple Developer.
6. Firebase Console → **Project settings** → **Cloud Messaging** → upload the APNs key, then enter its Key ID and Apple Team ID.

The app entitlement should contain an APNs environment:

```xml
<key>aps-environment</key>
<string>development</string>
```

Use a real signed device for final validation. The Simulator can request notification permission and supports some notification testing on current runtimes, but physical hardware is the reliable test of the full APNs → FCM → app delivery path.

## 9. Android Firebase setup

1. Register the Android package name in Firebase.
2. Download `google-services.json` to `android/app/google-services.json`.
3. Apply the Google Services Gradle plugin in the Android project.
4. Declare Android 13 notification permission where applicable and request it through `firebase_messaging`.

Refer to the current Firebase Flutter setup documentation for the Gradle syntax appropriate to the project's Android Gradle Plugin version.

## 10. Verification checklist

### Chat widget

- [ ] Correct Mobichat site ID is configured.
- [ ] WebView JavaScript is unrestricted.
- [ ] HTML is loaded with `baseUrl: 'https://app.mobichat.id/'`.
- [ ] Chat panel fits the device viewport.
- [ ] Production user identity comes from authenticated app state.
- [ ] No signing secret is shipped in the app.

### Push notifications

- [ ] User accepted the notification permission prompt.
- [ ] Firebase initialization succeeds before `runApp`.
- [ ] `GoogleService-Info.plist` is bundled in the iOS Runner target.
- [ ] iOS bundle ID matches Firebase configuration.
- [ ] Apple Push Notifications capability and remote-notification background mode are enabled.
- [ ] Firebase has a valid APNs `.p8` authentication key.
- [ ] A token is received and sent to Mobichat after the widget is loaded.
- [ ] FCM token refreshes are also sent to Mobichat.
- [ ] A test is sent with the target app in the background on a physical iPhone.

## 11. Troubleshooting

| Symptom                                            | Likely cause                                                              | Resolution                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Widget header shows but chat content is blank      | The embedded HTML has an opaque/no origin, so API calls do not finish     | Load HTML with the Mobichat host as `baseUrl`.                                                     |
| Widget is wider/taller than the phone              | Desktop floating-panel styles are used in the WebView                     | Use the full-screen Shadow DOM override shown above.                                               |
| No FCM token                                       | Firebase configuration or APNs registration is incomplete                 | Confirm plist inclusion, matching bundle ID, entitlement, signed profile, and Firebase/APNs setup. |
| Notification arrives only when app is backgrounded | Foreground presentation is not automatic                                  | Handle `FirebaseMessaging.onMessage` and show a local notification.                                |
| Messages arrive but no notification appears        | Token was not sent to Mobichat or Mobichat push channel is not configured | Check the token handoff and Mobichat channel configuration.                                        |
| Push works on Android but not iOS                  | APNs key/capability/profile is missing or mismatched                      | Enable Push Notifications, refresh signing, and upload a valid APNs key to Firebase.               |

## Security notes

- Treat FCM tokens as user/device identifiers; transmit them only over HTTPS.
- Keep Firebase service-account credentials and APNs `.p8` files out of the repository.
- Add `GoogleService-Info.plist` and `google-services.json` to version control only if that matches the organization’s policy; they are configuration files, but should still be reviewed according to the project’s secret-management rules.
- Never embed backend credentials or identity-signing secrets in Dart, JavaScript, Android resources, or iOS resources.
