import 'dart:convert';

import 'last_seen_log.dart';

enum LiveUpdateEventType {
  connected,
  contactsChanged,
  contactPresence,
  unknown,
}

class LiveUpdateEvent {
  final LiveUpdateEventType type;
  final int? contactId;
  final String? action;
  final String? status;
  final String? lastSeen;
  final DateTime? checkedAt;
  final DateTime? timestamp;
  final bool changed;

  const LiveUpdateEvent({
    required this.type,
    this.contactId,
    this.action,
    this.status,
    this.lastSeen,
    this.checkedAt,
    this.timestamp,
    this.changed = false,
  });

  bool get isPresence => type == LiveUpdateEventType.contactPresence;
  bool get isContactsChanged => type == LiveUpdateEventType.contactsChanged;

  LastSeenLog? toLogEntry() {
    if (!changed || contactId == null || status == null || checkedAt == null) {
      return null;
    }

    return LastSeenLog(
      id: -checkedAt!.millisecondsSinceEpoch,
      contactId: contactId!,
      status: status!,
      lastSeen: lastSeen,
      checkedAt: checkedAt!,
    );
  }

  static LiveUpdateEvent? tryParse(String? eventName, List<String> dataLines) {
    if ((eventName == null || eventName.isEmpty) && dataLines.isEmpty) {
      return null;
    }

    final data = dataLines.join('\n');
    Map<String, dynamic> payload = const {};

    if (data.isNotEmpty) {
      final decoded = jsonDecode(data);
      if (decoded is Map<String, dynamic>) {
        payload = decoded;
      }
    }

    switch (eventName) {
      case 'connected':
        return LiveUpdateEvent(
          type: LiveUpdateEventType.connected,
          timestamp: _parseDateTime(payload['timestamp']),
        );
      case 'contacts_changed':
        return LiveUpdateEvent(
          type: LiveUpdateEventType.contactsChanged,
          action: payload['action'] as String?,
          contactId: payload['contactId'] as int?,
          timestamp: _parseDateTime(payload['timestamp']),
        );
      case 'contact_presence':
        return LiveUpdateEvent(
          type: LiveUpdateEventType.contactPresence,
          contactId: payload['contactId'] as int?,
          status: payload['status'] as String?,
          lastSeen: payload['lastSeen'] as String?,
          checkedAt: _parseDateTime(payload['checkedAt']),
          changed: payload['changed'] == true,
        );
      default:
        return const LiveUpdateEvent(type: LiveUpdateEventType.unknown);
    }
  }

  static DateTime? _parseDateTime(Object? raw) {
    if (raw is String && raw.isNotEmpty) {
      return DateTime.tryParse(raw);
    }
    return null;
  }
}
