import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_service.dart';

class MonitorService {
  MonitorService();

  Future<dynamic> _get(
    String path, {
    Map<String, String>? queryParameters,
  }) async {
    final baseUrl = await _getBaseUrl();
    final token = await _getToken();
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
    final baseUrl = await _getBaseUrl();
    final token = await _getToken();
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

  Future<String> _getBaseUrl() async {
    return ApiService.getBaseUrl();
  }

  Future<String?> _getToken() async {
    return ApiService.getToken();
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

  /// Get monitor health status
  Future<MonitorHealthStatus> getHealthStatus() async {
    final response = await _get('/monitor/health');
    return MonitorHealthStatus.fromJson(response);
  }

  /// Get WhatsApp Web session status
  Future<WhatsAppSessionStatus> getSessionStatus() async {
    final response = await _get('/monitor/session');
    return WhatsAppSessionStatus.fromJson(response);
  }

  /// Get unresolved anomalies
  Future<List<AnomalyEvent>> getAnomalies({int limit = 20}) async {
    final response = await _get('/monitor/anomalies', queryParameters: {
      'limit': limit.toString(),
    });

    final anomalies = <AnomalyEvent>[];
    for (final anomaly in response) {
      anomalies.add(AnomalyEvent.fromJson(anomaly));
    }
    return anomalies;
  }

  /// Resolve an anomaly
  Future<void> resolveAnomaly(int anomalyId) async {
    await _post('/monitor/anomalies/$anomalyId/resolve', {});
  }

  /// Get anomaly statistics
  Future<AnomalyStats> getAnomalyStats({int days = 30}) async {
    final response = await _get('/monitor/anomalies/stats', queryParameters: {
      'days': days.toString(),
    });
    return AnomalyStats.fromJson(response);
  }

  /// Trigger anomaly detection
  Future<AnomalyDetectionResult> detectAnomalies({int days = 7}) async {
    final response = await _post('/monitor/anomalies/detect', {
      'days': days,
    });
    return AnomalyDetectionResult.fromJson(response);
  }

  /// Get detailed uptime history
  Future<UptimeHistory> getUptimeHistory({int days = 30}) async {
    final response = await _get('/monitor/uptime', queryParameters: {
      'days': days.toString(),
    });
    return UptimeHistory.fromJson(response);
  }
}

class WhatsAppSessionStatus {
  final String status;
  final bool connected;
  final String message;
  final DateTime? checkedAt;

  WhatsAppSessionStatus({
    required this.status,
    required this.connected,
    required this.message,
    this.checkedAt,
  });

  factory WhatsAppSessionStatus.fromJson(Map<String, dynamic> json) {
    return WhatsAppSessionStatus(
      status: json['status'] as String? ?? 'unknown',
      connected: json['connected'] as bool? ?? false,
      message: json['message'] as String? ?? 'Unknown session state',
      checkedAt: json['checkedAt'] != null
          ? DateTime.parse(json['checkedAt'] as String)
          : null,
    );
  }

  bool get requiresLogin => status == 'login_required';
  bool get isLoading => status == 'loading';
  bool get profileInUse => status == 'profile_in_use';

  String get statusDisplay {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'login_required':
        return 'Login Required';
      case 'loading':
        return 'Loading';
      case 'profile_in_use':
        return 'Browser Open';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  }
}

/// Monitor health status
class MonitorHealthStatus {
  final HealthSummary summary;
  final HealthStatus current;
  final String status;
  final int healthScore;

  MonitorHealthStatus({
    required this.summary,
    required this.current,
    required this.status,
    required this.healthScore,
  });

  factory MonitorHealthStatus.fromJson(Map<String, dynamic> json) {
    return MonitorHealthStatus(
      summary: HealthSummary.fromJson(json['summary']),
      current: HealthStatus.fromJson(json['current']),
      status: json['status'] as String,
      healthScore: json['healthScore'] as int,
    );
  }
}

class HealthSummary {
  final int totalChecks;
  final int totalOk;
  final int totalGaps;
  final double avgUptime;
  final int avgGapSec;
  final List<DailyHealthRecord> dailyRecords;
  final int healthScore;

  HealthSummary({
    required this.totalChecks,
    required this.totalOk,
    required this.totalGaps,
    required this.avgUptime,
    required this.avgGapSec,
    required this.dailyRecords,
    required this.healthScore,
  });

  factory HealthSummary.fromJson(Map<String, dynamic> json) {
    final records = <DailyHealthRecord>[];
    if (json['dailyRecords'] != null) {
      for (final record in json['dailyRecords']) {
        records.add(DailyHealthRecord.fromJson(record));
      }
    }

    return HealthSummary(
      totalChecks: json['totalChecks'] as int,
      totalOk: json['totalOk'] as int,
      totalGaps: json['totalGaps'] as int,
      avgUptime: (json['avgUptime'] as num).toDouble(),
      avgGapSec: json['avgGapSec'] as int,
      dailyRecords: records,
      healthScore: json['healthScore'] as int,
    );
  }
}

class DailyHealthRecord {
  final DateTime date;
  final double uptime;
  final int checksRun;
  final int checksOk;
  final int gapsDetected;
  final int? avgGapSec;

  DailyHealthRecord({
    required this.date,
    required this.uptime,
    required this.checksRun,
    required this.checksOk,
    required this.gapsDetected,
    this.avgGapSec,
  });

  factory DailyHealthRecord.fromJson(Map<String, dynamic> json) {
    return DailyHealthRecord(
      date: DateTime.parse(json['date'] as String),
      uptime: (json['uptime'] as num).toDouble(),
      checksRun: json['checksRun'] as int,
      checksOk: json['checksOk'] as int,
      gapsDetected: json['gapsDetected'] as int,
      avgGapSec: json['avgGapSec'] as int?,
    );
  }

  String get uptimePercentage => '${uptime.toStringAsFixed(1)}%';
  String get uptimeStatus {
    if (uptime >= 95) return 'Excellent';
    if (uptime >= 80) return 'Good';
    if (uptime >= 50) return 'Fair';
    return 'Poor';
  }
}

class HealthStatus {
  final String status;
  final int uptime;
  final int checksRun;
  final int gapsDetected;
  final int? avgGapSec;

  HealthStatus({
    required this.status,
    required this.uptime,
    required this.checksRun,
    required this.gapsDetected,
    this.avgGapSec,
  });

  factory HealthStatus.fromJson(Map<String, dynamic> json) {
    return HealthStatus(
      status: json['status'] as String,
      uptime: json['uptime'] as int,
      checksRun: json['checksRun'] as int,
      gapsDetected: json['gapsDetected'] as int,
      avgGapSec: json['avgGapSec'] as int?,
    );
  }

  String get uptimeDisplay => '$uptime%';
  String get statusDisplay => status[0].toUpperCase() + status.substring(1);
}

/// Anomaly event
class AnomalyEvent {
  final int id;
  final int? contactId;
  final String type;
  final String severity;
  final String title;
  final String? description;
  final Map<String, dynamic>? metadata;
  final bool resolved;
  final DateTime createdAt;
  final ContactInfo? contact;

  AnomalyEvent({
    required this.id,
    this.contactId,
    required this.type,
    required this.severity,
    required this.title,
    this.description,
    this.metadata,
    required this.resolved,
    required this.createdAt,
    this.contact,
  });

  factory AnomalyEvent.fromJson(Map<String, dynamic> json) {
    return AnomalyEvent(
      id: json['id'] as int,
      contactId: json['contactId'] as int?,
      type: json['type'] as String,
      severity: json['severity'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      metadata: json['metadata'] as Map<String, dynamic>?,
      resolved: json['resolved'] as bool,
      createdAt: DateTime.parse(json['createdAt'] as String),
      contact: json['contact'] != null 
          ? ContactInfo.fromJson(json['contact'] as Map<String, dynamic>)
          : null,
    );
  }

  String get severityDisplay => severity[0].toUpperCase() + severity.substring(1);
  String get typeDisplay {
    switch (type) {
      case 'late_night':
        return 'Late Night Activity';
      case 'unusual_pattern':
        return 'Unusual Pattern';
      case 'unusual_gap':
        return 'Activity Gap';
      case 'group_anomaly':
        return 'Group Activity';
      case 'recurring_pattern':
        return 'Recurring Pattern';
      default:
        return type.split('_').map((word) => 
            word[0].toUpperCase() + word.substring(1)).join(' ');
    }
  }

  Duration get timeAgo => DateTime.now().difference(createdAt);
  String get timeAgoDisplay {
    final hours = timeAgo.inHours;
    if (hours < 1) {
      final minutes = timeAgo.inMinutes;
      return '$minutes minute${minutes == 1 ? '' : 's'} ago';
    } else if (hours < 24) {
      return '$hours hour${hours == 1 ? '' : 's'} ago';
    } else {
      final days = timeAgo.inDays;
      return '$days day${days == 1 ? '' : 's'} ago';
    }
  }
}

class ContactInfo {
  final int id;
  final String name;

  ContactInfo({
    required this.id,
    required this.name,
  });

  factory ContactInfo.fromJson(Map<String, dynamic> json) {
    return ContactInfo(
      id: json['id'] as int,
      name: json['name'] as String,
    );
  }
}

/// Anomaly statistics
class AnomalyStats {
  final int total;
  final int resolved;
  final int unresolved;
  final Map<String, int> byType;
  final Map<String, int> bySeverity;
  final List<DailyAnomalyTrend> recentTrend;

  AnomalyStats({
    required this.total,
    required this.resolved,
    required this.unresolved,
    required this.byType,
    required this.bySeverity,
    required this.recentTrend,
  });

  factory AnomalyStats.fromJson(Map<String, dynamic> json) {
    final trend = <DailyAnomalyTrend>[];
    if (json['recentTrend'] != null) {
      for (final item in json['recentTrend']) {
        trend.add(DailyAnomalyTrend.fromJson(item));
      }
    }

    return AnomalyStats(
      total: json['total'] as int,
      resolved: json['resolved'] as int,
      unresolved: json['unresolved'] as int,
      byType: Map<String, int>.from(json['byType'] as Map),
      bySeverity: Map<String, int>.from(json['bySeverity'] as Map),
      recentTrend: trend,
    );
  }

  double get resolutionRate => total > 0 ? (resolved / total) * 100 : 0;
  String get resolutionRateDisplay => '${resolutionRate.toStringAsFixed(1)}%';
}

class DailyAnomalyTrend {
  final String date;
  final int count;

  DailyAnomalyTrend({
    required this.date,
    required this.count,
  });

  factory DailyAnomalyTrend.fromJson(Map<String, dynamic> json) {
    return DailyAnomalyTrend(
      date: json['date'] as String,
      count: json['count'] as int,
    );
  }
}

/// Anomaly detection result
class AnomalyDetectionResult {
  final int detected;
  final List<AnomalyEvent> anomalies;

  AnomalyDetectionResult({
    required this.detected,
    required this.anomalies,
  });

  factory AnomalyDetectionResult.fromJson(Map<String, dynamic> json) {
    final anomalies = <AnomalyEvent>[];
    if (json['anomalies'] != null) {
      for (final anomaly in json['anomalies']) {
        anomalies.add(AnomalyEvent.fromJson(anomaly));
      }
    }

    return AnomalyDetectionResult(
      detected: json['detected'] as int,
      anomalies: anomalies,
    );
  }
}

/// Uptime history
class UptimeHistory {
  final String period;
  final double overallUptime;
  final int healthScore;
  final int totalChecks;
  final int successfulChecks;
  final int totalGaps;
  final int averageGapSec;
  final List<DailyUptimeRecord> dailyBreakdown;

  UptimeHistory({
    required this.period,
    required this.overallUptime,
    required this.healthScore,
    required this.totalChecks,
    required this.successfulChecks,
    required this.totalGaps,
    required this.averageGapSec,
    required this.dailyBreakdown,
  });

  factory UptimeHistory.fromJson(Map<String, dynamic> json) {
    final breakdown = <DailyUptimeRecord>[];
    if (json['dailyBreakdown'] != null) {
      for (final record in json['dailyBreakdown']) {
        breakdown.add(DailyUptimeRecord.fromJson(record));
      }
    }

    return UptimeHistory(
      period: json['period'] as String,
      overallUptime: (json['overallUptime'] as num).toDouble(),
      healthScore: json['healthScore'] as int,
      totalChecks: json['totalChecks'] as int,
      successfulChecks: json['successfulChecks'] as int,
      totalGaps: json['totalGaps'] as int,
      averageGapSec: json['averageGapSec'] as int,
      dailyBreakdown: breakdown,
    );
  }

  String get overallUptimeDisplay => '${overallUptime.toStringAsFixed(1)}%';
  String get successRate {
    final rate = totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 0;
    return '${rate.toStringAsFixed(1)}%';
  }
}

class DailyUptimeRecord {
  final DateTime date;
  final double uptime;
  final int checksRun;
  final int checksOk;
  final int gapsDetected;
  final int? avgGapSec;

  DailyUptimeRecord({
    required this.date,
    required this.uptime,
    required this.checksRun,
    required this.checksOk,
    required this.gapsDetected,
    this.avgGapSec,
  });

  factory DailyUptimeRecord.fromJson(Map<String, dynamic> json) {
    return DailyUptimeRecord(
      date: DateTime.parse(json['date'] as String),
      uptime: (json['uptime'] as num).toDouble(),
      checksRun: json['checksRun'] as int,
      checksOk: json['checksOk'] as int,
      gapsDetected: json['gapsDetected'] as int,
      avgGapSec: json['avgGapSec'] as int?,
    );
  }

  String get uptimeDisplay => '${uptime.toStringAsFixed(1)}%';
  String get dateDisplay => '${date.month}/${date.day}';
}
