import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

class NotificationService {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  static const String _enabledKey = 'notifications_enabled';
  static const String _mutedContactsKey = 'muted_contacts';

  Future<void> init() async {
    if (_initialized) return;

    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    const settings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _plugin.initialize(settings);
    _initialized = true;
  }

  Future<void> requestPermission() async {
    final android = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    if (android != null) {
      await android.requestNotificationsPermission();
    }
  }

  Future<bool> isEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_enabledKey) ?? true;
  }

  Future<void> setEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_enabledKey, enabled);
  }

  Future<Set<int>> getMutedContactIds() async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(_mutedContactsKey) ?? [];
    return list.map((s) => int.parse(s)).toSet();
  }

  Future<void> setContactMuted(int contactId, bool muted) async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(_mutedContactsKey) ?? [];
    final set = list.map((s) => int.parse(s)).toSet();
    if (muted) {
      set.add(contactId);
    } else {
      set.remove(contactId);
    }
    await prefs.setStringList(
        _mutedContactsKey, set.map((i) => i.toString()).toList());
  }

  Future<bool> isContactMuted(int contactId) async {
    final muted = await getMutedContactIds();
    return muted.contains(contactId);
  }

  Future<void> showOnlineNotification({
    required int contactId,
    required String contactName,
  }) async {
    final enabled = await isEnabled();
    if (!enabled) return;

    final muted = await isContactMuted(contactId);
    if (muted) return;

    const androidDetails = AndroidNotificationDetails(
      'wa_online_channel',
      'Online Alerts',
      channelDescription: 'Notifications when tracked contacts come online',
      importance: Importance.high,
      priority: Priority.high,
      icon: '@mipmap/ic_launcher',
      color: Color(0xFF25D366),
      enableVibration: true,
      playSound: true,
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _plugin.show(
      contactId,
      '$contactName is Online',
      '$contactName just came online on WhatsApp',
      details,
    );

    debugPrint('[Notifications] Sent online alert for $contactName');
  }

  Future<void> showStatusChangeNotification({
    required int contactId,
    required String contactName,
    required String status,
    String? lastSeen,
  }) async {
    final enabled = await isEnabled();
    if (!enabled) return;

    final muted = await isContactMuted(contactId);
    if (muted) return;

    String title;
    String body;

    switch (status) {
      case 'online':
        title = '$contactName is Online';
        body = '$contactName just came online on WhatsApp';
        break;
      case 'offline':
        title = '$contactName went Offline';
        body = lastSeen ?? '$contactName is no longer online';
        break;
      default:
        return;
    }

    const androidDetails = AndroidNotificationDetails(
      'wa_status_channel',
      'Status Changes',
      channelDescription: 'Notifications when contact status changes',
      importance: Importance.defaultImportance,
      priority: Priority.defaultPriority,
      icon: '@mipmap/ic_launcher',
      color: Color(0xFF25D366),
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: DarwinNotificationDetails(),
    );

    await _plugin.show(
      contactId + 10000,
      title,
      body,
      details,
    );
  }
}
