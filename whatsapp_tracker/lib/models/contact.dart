import 'last_seen_log.dart';

const Object _unset = Object();

class Contact {
  final int id;
  final int userId;
  final String name;
  final String phone;
  final List<String> tags;
  final String? circle;
  final String? currentStatus;
  final String? currentLastSeen;
  final DateTime? lastCheckedAt;
  final DateTime createdAt;
  final List<LastSeenLog> logs;

  Contact({
    required this.id,
    required this.userId,
    required this.name,
    required this.phone,
    this.tags = const [],
    this.circle,
    this.currentStatus,
    this.currentLastSeen,
    this.lastCheckedAt,
    required this.createdAt,
    this.logs = const [],
  });

  factory Contact.fromJson(Map<String, dynamic> json) {
    return Contact(
      id: json['id'],
      userId: json['userId'],
      name: json['name'],
      phone: json['phone'],
      tags: _parseTags(json['tags']),
      circle: json['circle'],
      currentStatus: json['currentStatus'],
      currentLastSeen: json['currentLastSeen'],
      lastCheckedAt: json['lastCheckedAt'] != null
          ? DateTime.parse(json['lastCheckedAt'])
          : null,
      createdAt: DateTime.parse(json['createdAt']),
      logs:
          (json['logs'] as List<dynamic>?)
              ?.map((l) => LastSeenLog.fromJson(l))
              .toList() ??
          [],
    );
  }

  static List<String> _parseTags(dynamic raw) {
    if (raw == null) return [];
    if (raw is List) return raw.map((e) => e.toString()).toList();
    if (raw is String && raw.isNotEmpty) {
      try {
        return raw
            .replaceAll('[', '')
            .replaceAll(']', '')
            .replaceAll('"', '')
            .split(',')
            .map((e) => e.trim())
            .where((e) => e.isNotEmpty)
            .toList();
      } catch (_) {
        return [raw];
      }
    }
    return [];
  }

  Contact copyWith({
    String? name,
    String? phone,
    List<String>? tags,
    Object? circle = _unset,
    Object? currentStatus = _unset,
    Object? currentLastSeen = _unset,
    Object? lastCheckedAt = _unset,
    List<LastSeenLog>? logs,
  }) {
    return Contact(
      id: id,
      userId: userId,
      name: name ?? this.name,
      phone: phone ?? this.phone,
      tags: tags ?? this.tags,
      circle: identical(circle, _unset)
          ? this.circle
          : circle as String?,
      currentStatus: identical(currentStatus, _unset)
          ? this.currentStatus
          : currentStatus as String?,
      currentLastSeen: identical(currentLastSeen, _unset)
          ? this.currentLastSeen
          : currentLastSeen as String?,
      lastCheckedAt: identical(lastCheckedAt, _unset)
          ? this.lastCheckedAt
          : lastCheckedAt as DateTime?,
      createdAt: createdAt,
      logs: logs ?? this.logs,
    );
  }

  LastSeenLog? get latestLog => logs.isNotEmpty ? logs.first : null;
  String? get status => currentStatus ?? latestLog?.status;
  String? get lastSeenValue => currentLastSeen ?? latestLog?.lastSeen;
  DateTime? get lastActivityAt => lastCheckedAt ?? latestLog?.checkedAt;
}
