import 'package:flutter_test/flutter_test.dart';
import 'package:mobichat_flutter_widget/main.dart';
import 'package:mobichat_flutter_widget/mobichat_settings.dart';

void main() {
  test('Mobichat application widget is available', () {
    expect(MobichatApp, isA<Type>());
  });

  test('settings serialize to window.mobichatSettings keys', () {
    const settings = MobichatSettings(
      appId: 'ww_example',
      userId: 'user-1',
      fcmToken: 'fcm-token',
      sourceId: '620000000000',
      visitorId: '00000000-0000-4000-8000-000000000000',
      metadata: {'name': 'Jane', 'company': 'Example Inc', 'membership': 'Gold'},
    );
    expect(settings.toJson(), {
      'app_id': 'ww_example',
      'user_id': 'user-1',
      'fcm_token': 'fcm-token',
      'source_id': '620000000000',
      'visitor_id': '00000000-0000-4000-8000-000000000000',
      'metadata': {
        'name': 'Jane',
        'company': 'Example Inc',
        'membership': 'Gold',
      },
    });
  });

  test('empty optional settings are left out and survive a round trip', () {
    const settings = MobichatSettings(appId: 'ww_x', userId: 'u1');
    expect(settings.toJson(), {'app_id': 'ww_x', 'user_id': 'u1'});

    final restored =
        MobichatSettings.fromJson(MobichatSettings.defaults.toJson());
    expect(restored.toJson(), MobichatSettings.defaults.toJson());
  });

  test('submitted identity takes name and email from metadata', () {
    const settings = MobichatSettings(
      appId: 'ww_x',
      userId: 'u1',
      metadata: {'Name': 'Jane', 'EMAIL': 'a@example.com', 'company': ''},
    );
    final identity = settings.toIdentity();
    expect(identity['name'], 'Jane');
    expect(identity['email'], 'a@example.com');
    expect(identity['metadata'], settings.metadata);

    expect(MobichatSettings.defaults.copyWith(visitorId: 'v2').visitorId, 'v2');
  });

  test('identify result is saved only when Mobichat kept the identity', () {
    expect(
        MobichatIdentifyResult.fromJson(
            {'anonymous': false, 'verified': false, 'user_id': 'u1'}).saved,
        isTrue);
    expect(
        MobichatIdentifyResult.fromJson(
            {'anonymous': true, 'reason': 'require_verified'}).saved,
        isFalse);
    expect(
        MobichatIdentifyResult.fromJson(
            {'anonymous': true, 'rateLimited': true}).saved,
        isFalse);
  });

  test('generated visitor IDs are UUID v4', () {
    expect(
      generateVisitorId(),
      matches(RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')),
    );
  });
}
