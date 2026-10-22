import 'dart:convert';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import 'mobichat_settings.dart';
import 'settings_page.dart';

const _mobichatHost = String.fromEnvironment('MOBICHAT_HOST',
    defaultValue: 'https://app.mobichat.id');
const _useLocalRuntime = bool.fromEnvironment('MOBICHAT_LOCAL_RUNTIME');
const _localRuntimeAsset = 'assets/dev/mobichat-web-widget-runtime.js';

final _localNotifications = FlutterLocalNotificationsPlugin();

String _scriptJson(Object? value) =>
    jsonEncode(value).replaceAll('<', r'\u003c');

Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  String? startupError;
  try {
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
    await Firebase.initializeApp();
    await _localNotifications.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      ),
    );
  } catch (error) {
    startupError = 'Firebase startup failed: $error';
  }

  runApp(MobichatApp(startupError: startupError));
}

class MobichatApp extends StatelessWidget {
  const MobichatApp({super.key, this.startupError});

  final String? startupError;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Mobi Live Chat',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
            colorSchemeSeed: const Color(0xFF4F46E5), useMaterial3: true),
        home: startupError == null
            ? const HostHomePage()
            : _StartupErrorPage(message: startupError!),
      );
}

class _StartupErrorPage extends StatelessWidget {
  const _StartupErrorPage({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Mobi Live Chat')),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Center(child: SelectableText(message)),
        ),
      );
}

class HostHomePage extends StatelessWidget {
  const HostHomePage({super.key});

  Future<void> _openChat(BuildContext context,
      {bool freshVisitor = false}) async {
    final settings = await MobichatSettings.load();
    if (!context.mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) =>
          LiveChatPage(settings: settings, freshVisitor: freshVisitor),
    ));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Mobi Live Chat')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: ListTile(
                leading: const Icon(Icons.chat_bubble_outline),
                title: const Text('Customer Live Chat'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _openChat(context),
              ),
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.manage_accounts_outlined),
                title: const Text('Edit & submit mobichatSettings'),
                subtitle: const Text(
                    'Send visitor data to Mobichat without starting a chat'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) =>
                      const MobichatSettingsPage(host: _mobichatHost),
                )),
              ),
            ),
            // Clears the widget's saved visitor first, like a fresh install or another device.
            TextButton.icon(
              icon: const Icon(Icons.restart_alt),
              label: const Text('Open chat as a new device'),
              onPressed: () => _openChat(context, freshVisitor: true),
            ),
            const SizedBox(height: 8),
            Text(
              'Host: $_mobichatHost\n'
              'Runtime: ${_useLocalRuntime ? 'bundled ($_localRuntimeAsset)' : 'from host'}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      );
}

class LiveChatPage extends StatefulWidget {
  const LiveChatPage(
      {super.key, required this.settings, this.freshVisitor = false});

  /// Injected into the page as `window.mobichatSettings`.
  final MobichatSettings settings;

  /// Clears the WebView's local storage before loading, so the widget starts with a new visitor id.
  final bool freshVisitor;

  @override
  State<LiveChatPage> createState() => _LiveChatPageState();
}

class _LiveChatPageState extends State<LiveChatPage> {
  late final WebViewController _webViewController;
  String? _fcmToken;
  bool _pageLoaded = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _webViewController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setOnConsoleMessage((message) {
        debugPrint('[WebView ${message.level.name}] ${message.message}');
      })
      ..addJavaScriptChannel(
        'MobichatNativeError',
        onMessageReceived: (message) {
          debugPrint('[Mobichat error] ${message.message}');
          if (mounted) setState(() => _error = message.message);
        },
      )
      ..addJavaScriptChannel(
        'MobichatNativeClose',
        onMessageReceived: (_) {
          if (mounted) Navigator.of(context).maybePop();
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (url) async {
            debugPrint('[WebView] page finished: $url');
            _pageLoaded = true;
            await _sendFcmTokenToWidget();
            await _openWidgetAndVerify();
          },
          onWebResourceError: (error) {
            debugPrint('[WebView resource error] ${error.errorCode} '
                '${error.description} (${error.url})');
            if (mounted) setState(() => _error = error.description);
          },
        ),
      );
    final platformController = _webViewController.platform;
    if (kDebugMode && platformController is WebKitWebViewController) {
      platformController.setInspectable(true);
    }
    _loadWidget();
    _configureNotifications();
  }

  Future<void> _loadWidget() async {
    if (widget.freshVisitor) await _webViewController.clearLocalStorage();
    final localRuntime = _useLocalRuntime
        ? await rootBundle.loadString(_localRuntimeAsset)
        : null;
    // The widget API permits same-origin requests from its own host.
    // An HTML string without this base URL has an opaque origin on iOS.
    await _webViewController.loadHtmlString(
      _widgetHtml(localRuntime),
      baseUrl: '$_mobichatHost/',
    );
  }

  Future<void> _openWidgetAndVerify() async {
    try {
      await _webViewController.runJavaScript('''
        (function () {
          var attempts = 0;
          var timer = setInterval(function () {
            var root = document.getElementById('mobichat-web-widget-root');
            if (root && root.shadowRoot && typeof window.Mobichat === 'function') {
              clearInterval(timer);
              document.documentElement.style.cssText += ';width:100%;height:100%;overflow:hidden';
              document.body.style.cssText += ';width:100%;height:100%;overflow:hidden';

              var mobileLayout = document.createElement('style');
              mobileLayout.textContent = '.panel { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100dvh !important; max-width: 100vw !important; max-height: 100dvh !important; border-radius: 0 !important; } .launcher { display: none !important; }';
              root.shadowRoot.appendChild(mobileLayout);

              var closeButton = root.shadowRoot.querySelector('.header-close');
              if (closeButton) {
                closeButton.addEventListener('click', function () {
                  window.MobichatNativeClose.postMessage('close');
                });
              }
              window.Mobichat('open');

              setTimeout(function () {
                var error = root.shadowRoot.querySelector('.error.show');
                if (error && error.textContent.trim()) {
                  window.MobichatNativeError.postMessage(error.textContent.trim());
                }
              }, 1500);
            } else if (++attempts >= 100) {
              clearInterval(timer);
              window.MobichatNativeError.postMessage('Mobichat widget did not load.');
            }
          }, 100);
        })();
      ''');
    } catch (_) {
      // The navigation delegate reports any web resource failure to the UI.
    }
  }

  Future<void> _configureNotifications() async {
    try {
      final permission = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (Platform.isIOS &&
          permission.authorizationStatus == AuthorizationStatus.denied) {
        throw StateError('Notifications are disabled for this app.');
      }
      _fcmToken = await FirebaseMessaging.instance.getToken();
      FirebaseMessaging.instance.onTokenRefresh.listen((token) {
        _fcmToken = token;
        _sendFcmTokenToWidget();
      });
      FirebaseMessaging.onMessage.listen(_showForegroundNotification);
      await _sendFcmTokenToWidget();
    } catch (error) {
      if (mounted) setState(() => _error = 'Push setup failed: $error');
    }
  }

  Future<void> _sendFcmTokenToWidget() async {
    final token = _fcmToken;
    // A token typed on the home screen is already in mobichatSettings and takes precedence.
    if (widget.settings.fcmToken.isNotEmpty) return;
    if (!_pageLoaded || token == null || token.isEmpty) return;
    try {
      await _webViewController.runJavaScript(
          'window.__mobichatSendFcmToken(${jsonEncode(token)});');
    } catch (_) {
      // A later FCM token refresh retries if the async widget loader is still starting.
    }
  }

  Future<void> _showForegroundNotification(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;
    await _localNotifications.show(
      notification.hashCode,
      notification.title ?? 'New message',
      notification.body ?? '',
      const NotificationDetails(
        android: AndroidNotificationDetails(
            'mobichat_messages', 'Mobichat messages',
            channelDescription: 'Messages received from Mobichat',
            importance: Importance.high,
            priority: Priority.high),
        iOS: DarwinNotificationDetails(
            presentAlert: true, presentBadge: true, presentSound: true),
      ),
    );
  }

  String _widgetHtml(String? localRuntime) {
    const loaderUrl = '$_mobichatHost/js/mobichat-web-widget.js';
    final widgetScripts = localRuntime == null
        ? '<script async src="$loaderUrl"></script>'
        : '<script data-mobichat-widget-runtime="true" type="text/plain"></script>'
            '<script src="$loaderUrl"></script>'
            '<script>$localRuntime</script>';
    final settings = widget.settings;
    final visitorStorageKey = 'mobichat_visitor_${settings.appId}';
    final screeningStorageKey = 'mobichat_screening_${settings.appId}';
    return '''<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<style>
html,body{width:100%;height:100%;margin:0;padding:0;overflow:hidden;background:#fff!important}
#mobichat-web-widget-boot{display:none!important}
</style>
<script>
window.addEventListener('error',function(e){console.error('Uncaught '+(e.message||e)+' at '+(e.filename||'')+':'+(e.lineno||''));});
window.addEventListener('unhandledrejection',function(e){console.error('Unhandled rejection: '+(e.reason&&e.reason.message||e.reason));});
</script>
</head><body><script>
window.Mobichat=window.Mobichat||function(){(window.Mobichat.q=window.Mobichat.q||[]).push(arguments);};
window.mobichatSettings=${_scriptJson(settings.toIdentity())};
try {
  ${settings.visitorId.isEmpty ? '' : 'localStorage.setItem(${_scriptJson(visitorStorageKey)},${_scriptJson(settings.visitorId)});'}
  ${settings.metadata.isEmpty ? '' : 'localStorage.removeItem(${_scriptJson(screeningStorageKey)});'}
} catch (error) {
  console.warn('[Mobichat] Unable to inject visitor data',error);
}
window.__mobichatSendFcmToken=function(token){return window.Mobichat('identify',Object.assign({},window.mobichatSettings,{fcm_token:token}));};
</script>$widgetScripts</body></html>''';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Live Chat')),
      body: Stack(children: [
        WebViewWidget(controller: _webViewController),
        if (_error != null)
          Align(
              alignment: Alignment.topCenter,
              child: MaterialBanner(content: Text(_error!), actions: [
                TextButton(
                    onPressed: () => setState(() => _error = null),
                    child: const Text('Dismiss'))
              ])),
      ]),
    );
  }
}
