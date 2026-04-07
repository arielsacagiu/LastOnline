import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../models/contact.dart';
import '../models/last_seen_log.dart';
import '../models/live_update_event.dart';
import '../services/api_service.dart';
import '../services/live_updates_service.dart';
import '../services/notification_service.dart';

class ContactsProvider extends ChangeNotifier {
  List<Contact> _contacts = [];
  bool _loading = false;
  String? _error;
  LiveUpdatesService? _liveUpdatesService;
  StreamSubscription<LiveUpdateEvent>? _liveUpdatesSubscription;
  final StreamController<LiveUpdateEvent> _liveUpdatesController =
      StreamController<LiveUpdateEvent>.broadcast();
  bool _liveUpdatesStarted = false;

  List<Contact> get contacts => _contacts;
  bool get loading => _loading;
  String? get error => _error;
  Stream<LiveUpdateEvent> get liveUpdates => _liveUpdatesController.stream;

  Future<void> loadContacts({bool silent = false}) async {
    if (!silent) {
      _loading = true;
      _error = null;
      notifyListeners();
    }
    try {
      _contacts = await ApiService.getContacts();
    } catch (e) {
      if (!silent || _contacts.isEmpty) {
        _error = e.toString();
      }
    }
    _loading = false;
    notifyListeners();
  }

  Future<bool> addContact(String name, String phone, {String? circle}) async {
    try {
      final contact = await ApiService.addContact(name, phone, circle: circle);
      _contacts.insert(0, contact);
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> deleteContact(int id) async {
    try {
      await ApiService.deleteContact(id);
      _contacts.removeWhere((c) => c.id == id);
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<List<LastSeenLog>> getLogs(int contactId) async {
    return await ApiService.getLogs(contactId);
  }

  Contact? findById(int id) {
    for (final contact in _contacts) {
      if (contact.id == id) {
        return contact;
      }
    }
    return null;
  }

  void startLiveUpdates() {
    if (_liveUpdatesStarted) {
      return;
    }

    _liveUpdatesStarted = true;
    _liveUpdatesService = LiveUpdatesService();
    _liveUpdatesSubscription = _liveUpdatesService!.events.listen(
      _handleLiveUpdate,
      onError: (Object error, StackTrace stackTrace) {
        debugPrint('Live updates error: $error');
      },
    );
    _liveUpdatesService!.start();
  }

  Future<void> stopLiveUpdates() async {
    _liveUpdatesStarted = false;
    await _liveUpdatesSubscription?.cancel();
    _liveUpdatesSubscription = null;
    await _liveUpdatesService?.dispose();
    _liveUpdatesService = null;
  }

  void _handleLiveUpdate(LiveUpdateEvent event) {
    if (event.isPresence && event.contactId != null) {
      final index = _contacts.indexWhere(
        (contact) => contact.id == event.contactId,
      );
      if (index != -1) {
        final current = _contacts[index];
        final logEntry = event.toLogEntry();

        if (event.changed && event.status == 'online') {
          NotificationService().showOnlineNotification(
            contactId: current.id,
            contactName: current.name,
          );
        } else if (event.changed && event.status != null) {
          NotificationService().showStatusChangeNotification(
            contactId: current.id,
            contactName: current.name,
            status: event.status!,
            lastSeen: event.lastSeen,
          );
        }

        _contacts[index] = current.copyWith(
          currentStatus: event.status,
          currentLastSeen: event.lastSeen,
          lastCheckedAt: event.checkedAt,
          logs: logEntry != null ? [logEntry] : current.logs,
        );
        notifyListeners();
      }
    } else if (event.isContactsChanged) {
      unawaited(loadContacts(silent: true));
    }

    if (!_liveUpdatesController.isClosed) {
      _liveUpdatesController.add(event);
    }
  }

  void clear() {
    _contacts = [];
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  @override
  void dispose() {
    unawaited(stopLiveUpdates());
    unawaited(_liveUpdatesController.close());
    super.dispose();
  }
}
