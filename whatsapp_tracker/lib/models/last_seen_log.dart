class LastSeenLog {
  final int id;
  final int contactId;
  final String status;
  final String? lastSeen;
  final DateTime checkedAt;

  LastSeenLog({
    required this.id,
    required this.contactId,
    required this.status,
    this.lastSeen,
    required this.checkedAt,
  });

  factory LastSeenLog.fromJson(Map<String, dynamic> json) {
    return LastSeenLog(
      id: json['id'],
      contactId: json['contactId'],
      status: json['status'],
      lastSeen: json['lastSeen'],
      checkedAt: DateTime.parse(json['checkedAt']),
    );
  }

  bool get isOnline => status == 'online';
  bool get isOffline => status == 'offline';
  bool get isHidden => status == 'hidden';
  bool get hasError => status == 'error';
}
