import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_service.dart';

class InsightsService {
  InsightsService();

  Future<dynamic> _get(String path) async {
    final baseUrl = await ApiService.getBaseUrl();
    final token = await ApiService.getToken();
    final response = await http.get(
      Uri.parse('$baseUrl/api$path'),
      headers: {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      },
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

  Future<WeeklyInsightSummary> getWeeklySummary(DateTime weekStart) async {
    final encodedDate = Uri.encodeComponent(weekStart.toIso8601String());
    final response = await _get('/insights/weekly/$encodedDate');
    return WeeklyInsightSummary.fromJson(response as Map<String, dynamic>);
  }

  Future<RoutineInsight?> getRoutineInsight(int contactId) async {
    final response = await _get('/insights/routine/$contactId');
    return RoutineInsight.fromJson(response as Map<String, dynamic>);
  }

  Future<ConfidenceAssessment> getConfidenceAssessment(int contactId) async {
    final response = await _get('/insights/confidence/$contactId');
    return ConfidenceAssessment.fromJson(response as Map<String, dynamic>);
  }
}

class WeeklyInsightSummary {
  final String summary;
  final InsightOverview insights;

  WeeklyInsightSummary({
    required this.summary,
    required this.insights,
  });

  factory WeeklyInsightSummary.fromJson(Map<String, dynamic> json) {
    return WeeklyInsightSummary(
      summary: (json['summary'] as String?) ?? 'No summary available.',
      insights: InsightOverview.fromJson(
        (json['insights'] as Map<String, dynamic>?) ?? const {},
      ),
    );
  }
}

class InsightOverview {
  final int totalAnomalies;
  final int healthScore;
  final int routineChanges;

  InsightOverview({
    required this.totalAnomalies,
    required this.healthScore,
    required this.routineChanges,
  });

  factory InsightOverview.fromJson(Map<String, dynamic> json) {
    return InsightOverview(
      totalAnomalies: (json['totalAnomalies'] as int?) ?? 0,
      healthScore: (json['healthScore'] as int?) ?? 0,
      routineChanges: (json['routineChanges'] as int?) ?? 0,
    );
  }
}

class RoutineInsight {
  final RoutineSummary? summary;
  final double confidence;

  RoutineInsight({
    required this.summary,
    required this.confidence,
  });

  factory RoutineInsight.fromJson(Map<String, dynamic> json) {
    final summaryJson = json['summary'] as Map<String, dynamic>?;
    return RoutineInsight(
      summary:
          summaryJson == null ? null : RoutineSummary.fromJson(summaryJson),
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
    );
  }
}

class RoutineSummary {
  final int? overallWakeHour;
  final int? overallSleepHour;
  final String? mostCommonPeakWindow;
  final double avgConfidence;
  final int routineCount;

  RoutineSummary({
    required this.overallWakeHour,
    required this.overallSleepHour,
    required this.mostCommonPeakWindow,
    required this.avgConfidence,
    required this.routineCount,
  });

  factory RoutineSummary.fromJson(Map<String, dynamic> json) {
    return RoutineSummary(
      overallWakeHour: json['overallWakeHour'] as int?,
      overallSleepHour: json['overallSleepHour'] as int?,
      mostCommonPeakWindow: json['mostCommonPeakWindow'] as String?,
      avgConfidence: (json['avgConfidence'] as num?)?.toDouble() ?? 0,
      routineCount: (json['routineCount'] as int?) ?? 0,
    );
  }

  String? get wakeTimeDisplay =>
      overallWakeHour == null ? null : _formatHour(overallWakeHour!);

  String? get sleepTimeDisplay =>
      overallSleepHour == null ? null : _formatHour(overallSleepHour!);

  String? get peakWindowDisplay {
    if (mostCommonPeakWindow == null) {
      return null;
    }

    final parts = mostCommonPeakWindow!.split('-');
    if (parts.length != 2) {
      return mostCommonPeakWindow;
    }

    final start = int.tryParse(parts[0]);
    final end = int.tryParse(parts[1]);
    if (start == null || end == null) {
      return mostCommonPeakWindow;
    }

    return '${_formatHour(start)} - ${_formatHour(end)}';
  }

  static String _formatHour(int hour) {
    final normalizedHour = hour % 24;
    final suffix = normalizedHour >= 12 ? 'PM' : 'AM';
    final hour12 = normalizedHour % 12 == 0 ? 12 : normalizedHour % 12;
    return '$hour12 $suffix';
  }
}

class ConfidenceAssessment {
  final double confidence;
  final String label;
  final int sampleSize;
  final bool hasGaps;
  final bool routineAvailable;

  ConfidenceAssessment({
    required this.confidence,
    required this.label,
    required this.sampleSize,
    required this.hasGaps,
    required this.routineAvailable,
  });

  factory ConfidenceAssessment.fromJson(Map<String, dynamic> json) {
    return ConfidenceAssessment(
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
      label: (json['label'] as String?) ?? 'unknown',
      sampleSize: (json['sampleSize'] as int?) ?? 0,
      hasGaps: (json['hasGaps'] as bool?) ?? false,
      routineAvailable: (json['routineAvailable'] as bool?) ?? false,
    );
  }

  String get displayLabel {
    switch (label) {
      case 'exact':
        return 'Exact';
      case 'approximate':
        return 'Approximate';
      case 'incomplete due to data gap':
        return 'Incomplete';
      default:
        return label;
    }
  }
}
