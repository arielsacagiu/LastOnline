import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_service.dart';

class AnalyticsService {
  AnalyticsService();

  Future<dynamic> _get(
    String path, {
    Map<String, String>? queryParameters,
  }) async {
    final baseUrl = await ApiService.getBaseUrl();
    final token = await ApiService.getToken();
    final response = await http.get(
      Uri.parse('$baseUrl/api$path').replace(queryParameters: queryParameters),
      headers: {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      },
    );

    return _decodeResponse(response);
  }

  Future<dynamic> _post(String path, Map<String, dynamic> body) async {
    final baseUrl = await ApiService.getBaseUrl();
    final token = await ApiService.getToken();
    final response = await http.post(
      Uri.parse('$baseUrl/api$path'),
      headers: {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      },
      body: jsonEncode(body),
    );

    return _decodeResponse(response);
  }

  dynamic _decodeResponse(http.Response response) {
    final body = response.body.isEmpty ? null : jsonDecode(response.body);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    }

    if (body is Map<String, dynamic> && body['error'] is String) {
      throw Exception(body['error']);
    }

    throw Exception('Request failed (${response.statusCode})');
  }

  /// Get analytics for a specific contact
  Future<ContactAnalytics> getContactAnalytics(
    int contactId,
    DateTime startDate,
    DateTime endDate,
  ) async {
    final response = await _get(
      '/analytics/contact/$contactId',
      queryParameters: {
        'startDate': startDate.toIso8601String(),
        'endDate': endDate.toIso8601String(),
      },
    );

    if (response['totalOnlineSec'] == null) {
      throw Exception('Invalid analytics response');
    }

    return ContactAnalytics.fromJson(response);
  }

  /// Create sessions for a contact from logs
  Future<SessionCreationResult> createSessions(
    int contactId, {
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    final body = {
      if (startDate != null) 'startDate': startDate.toIso8601String(),
      if (endDate != null) 'endDate': endDate.toIso8601String(),
    };

    final response = await _post('/analytics/sessions/$contactId', body);
    return SessionCreationResult.fromJson(response);
  }

  /// Detect overlapping sessions between contacts
  Future<OverlapDetectionResult> detectOverlaps({
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    final body = {
      if (startDate != null) 'startDate': startDate.toIso8601String(),
      if (endDate != null) 'endDate': endDate.toIso8601String(),
    };

    final response = await _post('/analytics/overlaps', body);
    return OverlapDetectionResult.fromJson(response);
  }

  /// Get weekly reports for the user
  Future<List<WeeklyReport>> getWeeklyReports({int weeks = 4}) async {
    final response = await _get(
      '/analytics/weekly',
      queryParameters: {'weeks': weeks.toString()},
    );

    final reports = <WeeklyReport>[];
    for (final report in response) {
      reports.add(WeeklyReport.fromJson(report));
    }
    return reports;
  }

  /// Generate weekly report for a specific week
  Future<WeeklyReport> generateWeeklyReport(DateTime weekStart) async {
    final response = await _post('/analytics/weekly/generate', {
      'weekStart': weekStart.toIso8601String(),
    });
    return WeeklyReport.fromJson(response);
  }
}

/// Contact analytics data model
class ContactAnalytics {
  final int totalOnlineSec;
  final int averageSessionSec;
  final int sessionCount;
  final Map<String, DailyStats> dailyStats;
  final List<Session> sessions;

  ContactAnalytics({
    required this.totalOnlineSec,
    required this.averageSessionSec,
    required this.sessionCount,
    required this.dailyStats,
    required this.sessions,
  });

  factory ContactAnalytics.fromJson(Map<String, dynamic> json) {
    final dailyStats = <String, DailyStats>{};
    if (json['dailyStats'] != null) {
      (json['dailyStats'] as Map).forEach((key, value) {
        dailyStats[key] = DailyStats.fromJson(value as Map<String, dynamic>);
      });
    }

    final sessions = <Session>[];
    if (json['sessions'] != null) {
      for (final session in json['sessions']) {
        sessions.add(Session.fromJson(session as Map<String, dynamic>));
      }
    }

    return ContactAnalytics(
      totalOnlineSec: json['totalOnlineSec'] as int,
      averageSessionSec: json['averageSessionSec'] as int,
      sessionCount: json['sessionCount'] as int,
      dailyStats: dailyStats,
      sessions: sessions,
    );
  }

  /// Get total online time as formatted string
  String get totalOnlineTime {
    final hours = totalOnlineSec ~/ 3600;
    final minutes = (totalOnlineSec % 3600) ~/ 60;
    return '${hours}h ${minutes}m';
  }

  /// Get average session duration as formatted string
  String get averageSessionTime {
    final minutes = averageSessionSec ~/ 60;
    final seconds = averageSessionSec % 60;
    return '${minutes}m ${seconds}s';
  }
}

/// Daily statistics for a contact
class DailyStats {
  final int durationSec;
  final int sessionCount;

  DailyStats({
    required this.durationSec,
    required this.sessionCount,
  });

  factory DailyStats.fromJson(Map<String, dynamic> json) {
    return DailyStats(
      durationSec: json['durationSec'] as int,
      sessionCount: json['sessionCount'] as int,
    );
  }

  /// Get duration as formatted string
  String get duration {
    final hours = durationSec ~/ 3600;
    final minutes = (durationSec % 3600) ~/ 60;
    if (hours > 0) {
      return '${hours}h ${minutes}m';
    }
    return '${minutes}m';
  }
}

/// Individual session data
class Session {
  final DateTime startedAt;
  final DateTime? endedAt;
  final int? durationSec;

  Session({
    required this.startedAt,
    this.endedAt,
    this.durationSec,
  });

  factory Session.fromJson(Map<String, dynamic> json) {
    return Session(
      startedAt: DateTime.parse(json['startedAt'] as String),
      endedAt: json['endedAt'] != null ? DateTime.parse(json['endedAt'] as String) : null,
      durationSec: json['durationSec'] as int?,
    );
  }

  /// Get duration as formatted string
  String get duration {
    if (durationSec == null) return 'Ongoing';
    final minutes = durationSec! ~/ 60;
    final seconds = durationSec! % 60;
    return '${minutes}m ${seconds}s';
  }
}

/// Result of session creation
class SessionCreationResult {
  final int created;
  final List<Session> sessions;

  SessionCreationResult({
    required this.created,
    required this.sessions,
  });

  factory SessionCreationResult.fromJson(Map<String, dynamic> json) {
    final sessions = <Session>[];
    if (json['sessions'] != null) {
      for (final session in json['sessions']) {
        sessions.add(Session.fromJson(session as Map<String, dynamic>));
      }
    }
    return SessionCreationResult(
      created: json['created'] as int,
      sessions: sessions,
    );
  }
}

/// Result of overlap detection
class OverlapDetectionResult {
  final int detected;
  final List<SessionOverlap> overlaps;
  final List<OverlapStat> pairStats;
  final List<GroupOverlapStat> groupOverlaps;
  final int groupsDetected;
  final int maxGroupSize;

  OverlapDetectionResult({
    required this.detected,
    required this.overlaps,
    required this.pairStats,
    required this.groupOverlaps,
    required this.groupsDetected,
    required this.maxGroupSize,
  });

  factory OverlapDetectionResult.fromJson(Map<String, dynamic> json) {
    final overlaps = <SessionOverlap>[];
    if (json['overlaps'] != null) {
      for (final overlap in json['overlaps']) {
        overlaps.add(SessionOverlap.fromJson(overlap as Map<String, dynamic>));
      }
    }

    final pairStats = <OverlapStat>[];
    if (json['pairStats'] != null) {
      for (final overlap in json['pairStats']) {
        pairStats.add(OverlapStat.fromJson(overlap as Map<String, dynamic>));
      }
    }

    final groupOverlaps = <GroupOverlapStat>[];
    if (json['groupOverlaps'] != null) {
      for (final overlap in json['groupOverlaps']) {
        groupOverlaps.add(GroupOverlapStat.fromJson(overlap as Map<String, dynamic>));
      }
    }

    return OverlapDetectionResult(
      detected: json['detected'] as int,
      overlaps: overlaps,
      pairStats: pairStats,
      groupOverlaps: groupOverlaps,
      groupsDetected: (json['groupsDetected'] as int?) ?? groupOverlaps.length,
      maxGroupSize: (json['maxGroupSize'] as int?) ?? 0,
    );
  }
}

/// Session overlap between two contacts
class SessionOverlap {
  final int session1Id;
  final int session2Id;
  final DateTime startedAt;
  final DateTime? endedAt;
  final int? durationSec;

  SessionOverlap({
    required this.session1Id,
    required this.session2Id,
    required this.startedAt,
    this.endedAt,
    this.durationSec,
  });

  factory SessionOverlap.fromJson(Map<String, dynamic> json) {
    return SessionOverlap(
      session1Id: json['session1Id'] as int,
      session2Id: json['session2Id'] as int,
      startedAt: DateTime.parse(json['startedAt'] as String),
      endedAt: json['endedAt'] != null ? DateTime.parse(json['endedAt'] as String) : null,
      durationSec: json['durationSec'] as int?,
    );
  }

  /// Get duration as formatted string
  String get duration {
    if (durationSec == null) return 'Ongoing';
    final minutes = durationSec! ~/ 60;
    final seconds = durationSec! % 60;
    return '${minutes}m ${seconds}s';
  }
}

/// Weekly report data model
class WeeklyReport {
  final int id;
  final int userId;
  final DateTime weekStart;
  final DateTime weekEnd;
  final int totalOnlineSec;
  final WeeklyReportData reportData;
  final DateTime createdAt;

  WeeklyReport({
    required this.id,
    required this.userId,
    required this.weekStart,
    required this.weekEnd,
    required this.totalOnlineSec,
    required this.reportData,
    required this.createdAt,
  });

  factory WeeklyReport.fromJson(Map<String, dynamic> json) {
    return WeeklyReport(
      id: json['id'] as int,
      userId: json['userId'] as int,
      weekStart: DateTime.parse(json['weekStart'] as String),
      weekEnd: DateTime.parse(json['weekEnd'] as String),
      totalOnlineSec: json['totalOnlineSec'] as int,
      reportData: WeeklyReportData.fromJson(json['reportData'] as Map<String, dynamic>),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  /// Get total online time as formatted string
  String get totalOnlineTime {
    final hours = totalOnlineSec ~/ 3600;
    final minutes = (totalOnlineSec % 3600) ~/ 60;
    return '${hours}h ${minutes}m';
  }

  /// Get week range as formatted string
  String get weekRange {
    final start = '${weekStart.month}/${weekStart.day}';
    final end = '${weekEnd.month}/${weekEnd.day}';
    return '$start - $end';
  }
}

/// Weekly report detailed data
class WeeklyReportData {
  final List<ContactStat> topContacts;
  final int totalContacts;
  final List<OverlapStat> overlaps;
  final List<GroupOverlapStat> groupOverlaps;
  final int averageSessionDuration;
  final int maxGroupSize;

  WeeklyReportData({
    required this.topContacts,
    required this.totalContacts,
    required this.overlaps,
    required this.groupOverlaps,
    required this.averageSessionDuration,
    required this.maxGroupSize,
  });

  factory WeeklyReportData.fromJson(Map<String, dynamic> json) {
    final topContacts = <ContactStat>[];
    if (json['topContacts'] != null) {
      for (final contact in json['topContacts']) {
        topContacts.add(ContactStat.fromJson(contact as Map<String, dynamic>));
      }
    }

    final overlaps = <OverlapStat>[];
    if (json['overlaps'] != null) {
      for (final overlap in json['overlaps']) {
        overlaps.add(OverlapStat.fromJson(overlap as Map<String, dynamic>));
      }
    }

    final groupOverlaps = <GroupOverlapStat>[];
    if (json['groupOverlaps'] != null) {
      for (final overlap in json['groupOverlaps']) {
        groupOverlaps.add(GroupOverlapStat.fromJson(overlap as Map<String, dynamic>));
      }
    }

    return WeeklyReportData(
      topContacts: topContacts,
      totalContacts: json['totalContacts'] as int,
      overlaps: overlaps,
      groupOverlaps: groupOverlaps,
      averageSessionDuration: json['averageSessionDuration'] as int,
      maxGroupSize: (json['maxGroupSize'] as int?) ?? 0,
    );
  }
}

/// Contact statistics for weekly report
class ContactStat {
  final int contactId;
  final String name;
  final int totalOnlineSec;
  final int sessionCount;

  ContactStat({
    required this.contactId,
    required this.name,
    required this.totalOnlineSec,
    required this.sessionCount,
  });

  factory ContactStat.fromJson(Map<String, dynamic> json) {
    return ContactStat(
      contactId: json['contactId'] as int,
      name: json['name'] as String,
      totalOnlineSec: json['totalOnlineSec'] as int,
      sessionCount: json['sessionCount'] as int,
    );
  }

  /// Get online time as formatted string
  String get onlineTime {
    final hours = totalOnlineSec ~/ 3600;
    final minutes = (totalOnlineSec % 3600) ~/ 60;
    if (hours > 0) {
      return '${hours}h ${minutes}m';
    }
    return '${minutes}m';
  }
}

/// Overlap statistics for weekly report
class OverlapStat {
  final String pair;
  final int durationSec;
  final int count;

  OverlapStat({
    required this.pair,
    required this.durationSec,
    required this.count,
  });

  factory OverlapStat.fromJson(Map<String, dynamic> json) {
    return OverlapStat(
      pair: json['pair'] as String,
      durationSec: json['durationSec'] as int,
      count: json['count'] as int,
    );
  }

  /// Get duration as formatted string
  String get duration {
    final hours = durationSec ~/ 3600;
    final minutes = (durationSec % 3600) ~/ 60;
    if (hours > 0) {
      return '${hours}h ${minutes}m';
    }
    return '${minutes}m';
  }
}

/// Exact overlap statistics for 3+ contacts
class GroupOverlapStat {
  final List<String> contacts;
  final List<int> contactIds;
  final int groupSize;
  final int durationSec;
  final int count;

  GroupOverlapStat({
    required this.contacts,
    required this.contactIds,
    required this.groupSize,
    required this.durationSec,
    required this.count,
  });

  factory GroupOverlapStat.fromJson(Map<String, dynamic> json) {
    return GroupOverlapStat(
      contacts: List<String>.from(json['contacts'] as List? ?? const []),
      contactIds: List<int>.from(json['contactIds'] as List? ?? const []),
      groupSize: json['groupSize'] as int,
      durationSec: json['durationSec'] as int,
      count: json['count'] as int,
    );
  }

  String get label => contacts.join(' + ');

  String get duration {
    final hours = durationSec ~/ 3600;
    final minutes = (durationSec % 3600) ~/ 60;
    if (hours > 0) {
      return '${hours}h ${minutes}m';
    }
    return '${minutes}m';
  }
}
