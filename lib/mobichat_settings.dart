import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

class MobichatSettings {
  const MobichatSettings({
    required this.appId,
    required this.userId,
    this.fcmToken = '',
    this.sourceId = '',
    this.visitorId = '',
    this.identityHash = '',
    this.metadata = const {},
  });

  static const defaults = MobichatSettings(
    appId: 'YOUR_APP_ID',
    userId: 'YOUR_USER_ID',
    fcmToken: 'YOUR_FCM_TOKEN',
    sourceId: 'YOUR_SOURCE_ID_OR_PHONE_NUMBER',
    visitorId: 'VISITOR_ID_TO_REUSE',
    identityHash: String.fromEnvironment('MOBICHAT_IDENTITY_HASH'),
    metadata: {
      'name': 'VISITOR_NAME',
      'company': 'VISITOR_COMPANY',
      'membership': 'VISITOR_MEMBERSHIP',
    },
  );

  final String appId;

  final String userId;

  final String fcmToken;

  final String sourceId;

  final String visitorId;

  final String identityHash;

  final Map<String, String> metadata;

  Map<String, Object> toJson() => {
        'app_id': appId,
        'user_id': userId,
        if (fcmToken.isNotEmpty) 'fcm_token': fcmToken,
        if (sourceId.isNotEmpty) 'source_id': sourceId,
        if (visitorId.isNotEmpty) 'visitor_id': visitorId,
        if (identityHash.isNotEmpty) 'identity_hash': identityHash,
        if (metadata.isNotEmpty) 'metadata': metadata,
      };

  MobichatSettings copyWith({String? visitorId}) => MobichatSettings(
        appId: appId,
        userId: userId,
        fcmToken: fcmToken,
        sourceId: sourceId,
        visitorId: visitorId ?? this.visitorId,
        identityHash: identityHash,
        metadata: metadata,
      );

  Map<String, Object> toIdentity() {
    String? fromMetadata(String key) => metadata.entries
        .where((entry) =>
            entry.key.trim().toLowerCase() == key && entry.value.isNotEmpty)
        .map((entry) => entry.value)
        .firstOrNull;
    final name = fromMetadata('name');
    final email = fromMetadata('email');
    return {
      ...toJson(),
      if (name != null) 'name': name,
      if (email != null) 'email': email,
    };
  }

  factory MobichatSettings.fromJson(Map<String, dynamic> json) =>
      MobichatSettings(
        appId: json['app_id'] as String? ?? defaults.appId,
        userId: json['user_id'] as String? ?? defaults.userId,
        fcmToken: json['fcm_token'] as String? ?? '',
        sourceId: json['source_id'] as String? ?? '',
        visitorId: json['visitor_id'] as String? ?? '',
        identityHash: json['identity_hash'] as String? ?? '',
        metadata: (json['metadata'] as Map?)
                ?.map((key, value) => MapEntry('$key', '$value')) ??
            const {},
      );

  static const _prefsKey = 'mobichat_settings';

  static Future<MobichatSettings> load() async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_prefsKey);
      if (raw != null) {
        return MobichatSettings.fromJson(
            jsonDecode(raw) as Map<String, dynamic>);
      }
    } catch (_) {}
    return defaults;
  }

  Future<void> save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, jsonEncode(toJson()));
  }

  static Future<void> clearSaved() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_prefsKey);
  }
}

class MobichatIdentifyResult {
  MobichatIdentifyResult.fromJson(Map<String, dynamic> json)
      : verified = json['verified'] == true,
        anonymous = json['anonymous'] == true,
        blocked = json['blocked'] == true,
        rateLimited = json['rateLimited'] == true,
        userId = json['user_id'] as String?,
        reason = json['reason'] as String?;

  final bool verified;
  final bool anonymous;
  final bool blocked;
  final bool rateLimited;
  final String? userId;
  final String? reason;

  bool get saved => !anonymous && !blocked && !rateLimited;
}

Future<MobichatIdentifyResult> submitMobichatSettings(
    String host, MobichatSettings settings) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
  try {
    final uri = Uri.parse('$host/api/public/web-widget/identify')
        .replace(queryParameters: {'siteId': settings.appId});
    final request = await client.postUrl(uri);
    request.headers.contentType = ContentType.json;
    request.add(utf8.encode(jsonEncode({
      'siteId': settings.appId,
      'visitorId': settings.visitorId,
      'identity': settings.toIdentity(),
    })));
    final response = await request.close().timeout(const Duration(seconds: 30));
    final body = await response.transform(utf8.decoder).join();
    final json = body.isEmpty
        ? const <String, dynamic>{}
        : jsonDecode(body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw HttpException(
          json['error'] as String? ?? 'HTTP ${response.statusCode}',
          uri: uri);
    }
    return MobichatIdentifyResult.fromJson(json);
  } finally {
    client.close();
  }
}

String generateVisitorId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-'
      '${hex.substring(16, 20)}-${hex.substring(20)}';
}
