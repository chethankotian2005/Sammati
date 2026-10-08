// Phone notifications (W-11, trd.md §6.12). Two ways one gets raised, and they are the same notification:
//  - live: an alert arrived over the WebSocket while the app is running;
//  - scheduled: the wallet already knows when a consent expires, so it asks the phone to raise the reminder at that
//    moment, which works with the app closed.
// What this is not: push to a closed app for things a company sends (renewal requests, erasure and acknowledgement
// confirmations). That needs Firebase and is not built; those wait on the Alerts tab until the app is next open.
// Neither path has been tested on a real phone yet.

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:timezone/data/latest_all.dart' as tz;
import 'package:timezone/timezone.dart' as tz;

abstract interface class LocalNotifier {
  /// Raises a notification now. The same [id] again replaces the earlier one.
  Future<void> show({required int id, required String title, required String body, required String channel});

  /// Asks the phone to raise it at [at], even if the app is closed by then.
  Future<void> schedule({required int id, required DateTime at, required String title, required String body, required String channel});

  /// Forgets everything scheduled: the caller then schedules what is still true.
  Future<void> cancelAll();
}

/// A stable 31-bit id for a notification key, so the live and the scheduled copy of one alert share an id.
int notificationIdOf(String key) {
  var h = 0x811c9dc5; // FNV-1a
  for (final unit in key.codeUnits) {
    h = ((h ^ unit) * 0x01000193) & 0x7fffffff;
  }
  return h;
}

/// Web, tests and anything without a notification plugin: nothing is raised, nothing fails.
class NoopNotifier implements LocalNotifier {
  const NoopNotifier();

  @override
  Future<void> show({required int id, required String title, required String body, required String channel}) async {}

  @override
  Future<void> schedule({required int id, required DateTime at, required String title, required String body, required String channel}) async {}

  @override
  Future<void> cancelAll() async {}
}

class PluginNotifier implements LocalNotifier {
  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;

  Future<void> _init() async {
    if (_ready) return;
    tz.initializeTimeZones();
    await _plugin.initialize(const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')));
    _ready = true;
  }

  NotificationDetails _details(String channel) => NotificationDetails(
        android: AndroidNotificationDetails('consent_alerts', channel, importance: Importance.high, priority: Priority.high),
      );

  @override
  Future<void> show({required int id, required String title, required String body, required String channel}) async {
    await _init();
    await _plugin.show(id, title, body, _details(channel));
  }

  @override
  Future<void> schedule({required int id, required DateTime at, required String title, required String body, required String channel}) async {
    await _init();
    await _plugin.zonedSchedule(
      id,
      title,
      body,
      tz.TZDateTime.from(at, tz.local),
      _details(channel),
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.absoluteTime,
    );
  }

  @override
  Future<void> cancelAll() async {
    await _init();
    await _plugin.cancelAll();
  }
}

final localNotifierProvider = Provider<LocalNotifier>((ref) => kIsWeb ? const NoopNotifier() : PluginNotifier());
