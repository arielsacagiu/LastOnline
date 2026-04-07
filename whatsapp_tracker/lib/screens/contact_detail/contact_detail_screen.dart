import 'dart:async';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../models/contact.dart';
import '../../models/last_seen_log.dart';
import '../../models/live_update_event.dart';
import '../../providers/contacts_provider.dart';
import '../../services/api_service.dart';
import '../../services/analytics_service.dart';
import '../../services/insights_service.dart';
import '../../theme/app_theme.dart';

class ContactDetailScreen extends StatefulWidget {
  final Contact contact;

  const ContactDetailScreen({super.key, required this.contact});

  @override
  State<ContactDetailScreen> createState() => _ContactDetailScreenState();
}

class _ContactDetailScreenState extends State<ContactDetailScreen> {
  late Contact _contact;
  List<LastSeenLog> _logs = [];
  bool _loading = true;
  String? _error;
  StreamSubscription<LiveUpdateEvent>? _liveUpdatesSubscription;
  final AnalyticsService _analyticsService = AnalyticsService();
  final InsightsService _insightService = InsightsService();
  ContactAnalytics? _analytics;
  bool _analyticsLoading = false;
  RoutineInsight? _routineInsight;
  ConfidenceAssessment? _confidenceAssessment;
  bool _insightsLoading = false;

  @override
  void initState() {
    super.initState();
    _contact = widget.contact;
    _loadLogs();
    _liveUpdatesSubscription = context
        .read<ContactsProvider>()
        .liveUpdates
        .listen(_handleLiveUpdate);
  }

  Future<void> _loadLogs() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final logs = await ApiService.getLogs(_contact.id);
      setState(() {
        _logs = logs;
        _loading = false;
      });
      _loadAnalytics();
      _loadInsights();
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadAnalytics() async {
    if (_logs.isEmpty) return;

    setState(() {
      _analyticsLoading = true;
    });

    try {
      final endDate = DateTime.now();
      final startDate = endDate.subtract(const Duration(days: 30));
      
      final analytics = await _analyticsService.getContactAnalytics(
        _contact.id,
        startDate,
        endDate,
      );
      
      setState(() {
        _analytics = analytics;
        _analyticsLoading = false;
      });
    } catch (e) {
      // Don't show error for analytics, just fail silently
      setState(() {
        _analyticsLoading = false;
      });
    }
  }

  Future<void> _loadInsights() async {
    setState(() {
      _insightsLoading = true;
    });

    try {
      final routineInsight = await _insightService.getRoutineInsight(_contact.id);
      final confidenceAssessment =
          await _insightService.getConfidenceAssessment(_contact.id);

      if (!mounted) {
        return;
      }

      setState(() {
        _routineInsight = routineInsight;
        _confidenceAssessment = confidenceAssessment;
        _insightsLoading = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _insightsLoading = false;
      });
    }
  }

  void _handleLiveUpdate(LiveUpdateEvent event) {
    if (event.isContactsChanged) {
      final updatedContact = context.read<ContactsProvider>().findById(
        _contact.id,
      );
      if (updatedContact != null && mounted) {
        setState(() {
          _contact = updatedContact;
        });
      }
      return;
    }

    if (!event.isPresence || event.contactId != _contact.id) {
      return;
    }

    final logEntry = event.toLogEntry();
    setState(() {
      _contact = _contact.copyWith(
        currentStatus: event.status,
        currentLastSeen: event.lastSeen,
        lastCheckedAt: event.checkedAt,
        logs: logEntry != null ? [logEntry] : _contact.logs,
      );

      if (logEntry != null) {
        _logs = [
          logEntry,
          ..._logs.where(
            (log) =>
                log.checkedAt != logEntry.checkedAt ||
                log.status != logEntry.status,
          ),
        ].take(100).toList();
      }
    });
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'online':
        return AppTheme.primaryGreen;
      case 'offline':
        return Colors.grey;
      case 'hidden':
        return Colors.orange;
      case 'qr_required':
        return Colors.blueGrey;
      default:
        return Colors.red;
    }
  }

  String _statusText(LastSeenLog log) {
    switch (log.status) {
      case 'online':
        return 'Went online';
      case 'offline':
        return log.lastSeen ?? 'Went offline';
      case 'hidden':
        return 'Last seen hidden';
      case 'qr_required':
        return 'QR scan required on server';
      default:
        return 'Error / Unknown';
    }
  }

  String _headerStatusText() {
    final status = _contact.status;
    final lastCheckedAt = _contact.lastActivityAt;

    switch (status) {
      case 'online':
        return 'Online Now';
      case 'offline':
        return _contact.lastSeenValue ??
            (lastCheckedAt != null
                ? 'Checked ${DateFormat('MMM d, HH:mm').format(lastCheckedAt.toLocal())}'
                : 'Offline');
      case 'hidden':
        return 'Last seen hidden';
      case 'qr_required':
        return 'QR scan required on server';
      case 'error':
        return 'Latest check failed';
      default:
        return 'Not checked yet';
    }
  }

  @override
  Widget build(BuildContext context) {
    final isOnline = _contact.status == 'online';

    return Scaffold(
      appBar: AppBar(
        title: Text(_contact.name),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadLogs),
        ],
      ),
      body: Column(
        children: [
          _buildHeader(isOnline),
          _buildInsightSection(),
          if (_logs.isNotEmpty) _buildActivityChart(),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Text(
                  'Activity Log',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Spacer(),
                Text(
                  '${_logs.length} entries',
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: Colors.grey),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(child: _buildLogList()),
        ],
      ),
    );
  }

  Widget _buildHeader(bool isOnline) {
    final lastCheckedAt = _contact.lastActivityAt;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppTheme.tealGreen, AppTheme.darkGreen],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Column(
        children: [
          Stack(
            alignment: Alignment.center,
            children: [
              CircleAvatar(
                radius: 40,
                backgroundColor: Colors.white.withValues(alpha: 0.2),
                child: Text(
                  _contact.name.substring(0, 1).toUpperCase(),
                  style: const TextStyle(
                    fontSize: 36,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
              if (isOnline)
                Positioned(
                  bottom: 2,
                  right: 2,
                  child: Container(
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(
                      color: AppTheme.primaryGreen,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2.5),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            _contact.name,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '+${_contact.phone}',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.8),
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            decoration: BoxDecoration(
              color: isOnline
                  ? AppTheme.primaryGreen
                  : Colors.white.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              _headerStatusText(),
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
          ),
          if (lastCheckedAt != null) ...[
            const SizedBox(height: 6),
            Text(
              'Last checked: ${DateFormat('MMM d, HH:mm').format(lastCheckedAt.toLocal())}',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.7),
                fontSize: 11,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildActivityChart() {
    if (_analyticsLoading) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          ),
        ),
      );
    }

    if (_analytics == null) {
      return const SizedBox.shrink();
    }

    // Build daily chart from analytics data
    final dailyStats = _analytics!.dailyStats.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));

    if (dailyStats.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Text('No analytics data available'),
          ),
        ),
      );
    }

    final maxDuration = dailyStats
        .map((entry) => entry.value.durationSec)
        .reduce((current, next) => current > next ? current : next)
        .toDouble();
    final maxY = maxDuration < 60 ? 60.0 : maxDuration + 60;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Daily Online Time (Last 30 Days)',
                style: Theme.of(
                  context,
                ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(
                'Total: ${_analytics!.totalOnlineTime} • Avg: ${_analytics!.averageSessionTime}',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: Colors.grey),
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 180,
                child: BarChart(
                  BarChartData(
                    maxY: maxY,
                    alignment: BarChartAlignment.spaceAround,
                    barTouchData: BarTouchData(
                      touchTooltipData: BarTouchTooltipData(
                        getTooltipColor: (_) => Colors.black87,
                        getTooltipItem: (group, groupIndex, rod, rodIndex) {
                          final date = dailyStats[group.x.toInt()].key;
                          final duration = dailyStats[group.x.toInt()].value.duration;
                          return BarTooltipItem(
                            '$date\n$duration',
                            const TextStyle(color: Colors.white),
                          );
                        },
                      ),
                    ),
                    titlesData: FlTitlesData(
                      show: true,
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          getTitlesWidget: (value, meta) {
                            if (value.toInt() >= dailyStats.length) return const Text('');
                            final date = dailyStats[value.toInt()].key;
                            final parts = date.split('-');
                            return Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                '${parts[1]}/${parts[2]}',
                                style: const TextStyle(fontSize: 10),
                              ),
                            );
                          },
                          reservedSize: 28,
                        ),
                      ),
                      leftTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          reservedSize: 40,
                          getTitlesWidget: (value, meta) {
                            if (value == 0) return const Text('0m');
                            final minutes = (value / 60).round();
                            return Text('${minutes}m', style: const TextStyle(fontSize: 10));
                          },
                        ),
                      ),
                      topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    ),
                    borderData: FlBorderData(show: false),
                    barGroups: dailyStats.asMap().entries.map((entry) {
                      final index = entry.key;
                      final daily = entry.value.value;
                      return BarChartGroupData(
                        x: index,
                        barRods: [
                          BarChartRodData(
                            toY: daily.durationSec.toDouble(),
                            color: AppTheme.primaryGreen,
                            width: 12,
                            borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                          ),
                        ],
                      );
                    }).toList(),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInsightSection() {
    if (_insightsLoading) {
      return const Padding(
        padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          ),
        ),
      );
    }

    if (_routineInsight == null && _confidenceAssessment == null) {
      return const SizedBox.shrink();
    }

    final routineSummary = _routineInsight?.summary;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Routine Insight',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 8),
              if (_confidenceAssessment != null)
                Text(
                  'Confidence: ${_confidenceAssessment!.displayLabel} '
                  '(${(_confidenceAssessment!.confidence * 100).round()}%)',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
              if (_confidenceAssessment != null) ...[
                const SizedBox(height: 4),
                Text(
                  _confidenceAssessment!.hasGaps
                      ? 'Recent gaps detected in the monitoring data.'
                      : 'Monitoring data is stable for this contact.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey.shade700,
                      ),
                ),
              ],
              if (routineSummary != null) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (routineSummary.wakeTimeDisplay != null)
                      _InsightPill(
                        label: 'Wake ${routineSummary.wakeTimeDisplay}',
                      ),
                    if (routineSummary.sleepTimeDisplay != null)
                      _InsightPill(
                        label: 'Sleep ${routineSummary.sleepTimeDisplay}',
                      ),
                    if (routineSummary.peakWindowDisplay != null)
                      _InsightPill(
                        label: 'Peak ${routineSummary.peakWindowDisplay}',
                      ),
                    _InsightPill(
                      label: '${routineSummary.routineCount} routine days',
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLogList() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.grey),
            const SizedBox(height: 12),
            const Text('Failed to load logs'),
            TextButton(onPressed: _loadLogs, child: const Text('Retry')),
          ],
        ),
      );
    }

    if (_logs.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.history, size: 64, color: Colors.grey),
            SizedBox(height: 12),
            Text(
              'No activity logged yet',
              style: TextStyle(color: Colors.grey),
            ),
            SizedBox(height: 4),
            Text(
              'Activity will appear here once detected',
              style: TextStyle(color: Colors.grey, fontSize: 12),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: _logs.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (_, i) {
        final log = _logs[i];
        return ListTile(
          contentPadding: const EdgeInsets.symmetric(
            vertical: 4,
            horizontal: 8,
          ),
          leading: Container(
            width: 10,
            height: 10,
            margin: const EdgeInsets.only(top: 6),
            decoration: BoxDecoration(
              color: _statusColor(log.status),
              shape: BoxShape.circle,
            ),
          ),
          title: Text(
            _statusText(log),
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
          ),
          trailing: Text(
            DateFormat('MMM d, HH:mm').format(log.checkedAt.toLocal()),
            style: const TextStyle(fontSize: 12, color: Colors.grey),
          ),
        );
      },
    );
  }

  @override
  void dispose() {
    _liveUpdatesSubscription?.cancel();
    super.dispose();
  }
}

class _InsightPill extends StatelessWidget {
  final String label;

  const _InsightPill({
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }
}
