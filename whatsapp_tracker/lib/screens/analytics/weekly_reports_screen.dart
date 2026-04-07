import 'package:flutter/material.dart';
import '../../services/analytics_service.dart';
import '../../services/insights_service.dart';

class WeeklyReportsScreen extends StatefulWidget {
  const WeeklyReportsScreen({super.key});

  @override
  State<WeeklyReportsScreen> createState() => _WeeklyReportsScreenState();
}

class _WeeklyReportsScreenState extends State<WeeklyReportsScreen> {
  final AnalyticsService _analyticsService = AnalyticsService();
  final InsightsService _insightsService = InsightsService();
  List<WeeklyReport> _reports = [];
  Map<String, WeeklyInsightSummary> _weeklySummaries = {};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadReports();
  }

  Future<void> _loadReports() async {
    try {
      setState(() {
        _loading = true;
        _error = null;
      });

      final reports = await _analyticsService.getWeeklyReports(weeks: 8);
      final weeklySummaries = await _loadWeeklySummaries(reports);
      setState(() {
        _reports = reports;
        _weeklySummaries = weeklySummaries;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _generateCurrentWeekReport() async {
    try {
      final now = DateTime.now();
      final monday = now.subtract(Duration(days: now.weekday - 1));
      final weekStart = DateTime(monday.year, monday.month, monday.day);

      await _analyticsService.generateWeeklyReport(weekStart);
      await _loadReports();
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Weekly report generated')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to generate report: $e')),
        );
      }
    }
  }

  Future<Map<String, WeeklyInsightSummary>> _loadWeeklySummaries(
    List<WeeklyReport> reports,
  ) async {
    final summaries = <String, WeeklyInsightSummary>{};

    for (final report in reports) {
      try {
        summaries[_summaryKey(report.weekStart)] = await _insightsService
            .getWeeklySummary(report.weekStart);
      } catch (_) {
        // Keep report loading resilient even if the insight summary fails.
      }
    }

    return summaries;
  }

  String _summaryKey(DateTime weekStart) => weekStart.toUtc().toIso8601String();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Weekly Reports'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadReports,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _buildBody(),
      floatingActionButton: FloatingActionButton(
        onPressed: _generateCurrentWeekReport,
        tooltip: 'Generate Current Week',
        child: const Icon(Icons.add_chart),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.red),
            const SizedBox(height: 16),
            Text(
              'Failed to load reports',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              _error!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadReports,
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (_reports.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.bar_chart_outlined,
              size: 80,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 16),
            Text(
              'No weekly reports yet',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Colors.grey.shade600,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'Generate your first weekly report using the + button',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey,
                  ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _reports.length,
      itemBuilder: (context, index) {
        final report = _reports[index];
        return WeeklyReportCard(
          report: report,
          insightSummary: _weeklySummaries[_summaryKey(report.weekStart)],
        );
      },
    );
  }
}

class WeeklyReportCard extends StatelessWidget {
  final WeeklyReport report;
  final WeeklyInsightSummary? insightSummary;

  const WeeklyReportCard({
    super.key,
    required this.report,
    this.insightSummary,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: ExpansionTile(
        title: Text(
          report.weekRange,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text('Total online: ${report.totalOnlineTime}'),
        leading: CircleAvatar(
          child: Text(
            '${report.reportData.topContacts.length}',
            style: const TextStyle(fontSize: 12),
          ),
        ),
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildSummarySection(context),
                const SizedBox(height: 16),
                if (insightSummary != null) ...[
                  _buildInsightSummarySection(context),
                  const SizedBox(height: 16),
                ],
                _buildTopContactsSection(context),
                const SizedBox(height: 16),
                if (report.reportData.overlaps.isNotEmpty) ...[
                  _buildPairOverlapsSection(context),
                  const SizedBox(height: 16),
                ],
                if (report.reportData.groupOverlaps.isNotEmpty) ...[
                  _buildGroupOverlapsSection(context),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSummarySection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Summary',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _StatCard(
                label: 'Total Online',
                value: report.totalOnlineTime,
                icon: Icons.access_time,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _StatCard(
                label: 'Avg Session',
                value: _formatDuration(report.reportData.averageSessionDuration),
                icon: Icons.timer,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _StatCard(
                label: 'Contacts',
                value: report.reportData.totalContacts.toString(),
                icon: Icons.people,
              ),
            ),
          ],
        ),
        if (report.reportData.maxGroupSize >= 3) ...[
          const SizedBox(height: 8),
          Text(
            'Largest simultaneous group: ${report.reportData.maxGroupSize} contacts',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Colors.grey.shade600,
                ),
          ),
        ],
      ],
    );
  }

  Widget _buildTopContactsSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Top Contacts',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
        ),
        const SizedBox(height: 8),
        ...report.reportData.topContacts.take(5).map((contact) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              children: [
                Expanded(
                  child: Text(contact.name),
                ),
                Text(
                  contact.onlineTime,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey.shade600,
                      ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${contact.sessionCount} sessions',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey,
                      ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _buildInsightSummarySection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Insight Summary',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
        ),
        const SizedBox(height: 8),
        Text(
          insightSummary!.summary,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _InsightChip(
              label: 'Health ${insightSummary!.insights.healthScore}/100',
            ),
            _InsightChip(
              label: '${insightSummary!.insights.totalAnomalies} anomalies',
            ),
            _InsightChip(
              label:
                  '${insightSummary!.insights.routineChanges} routine changes',
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildPairOverlapsSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Pairs Online Together',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
        ),
        const SizedBox(height: 8),
        ...report.reportData.overlaps.take(3).map((overlap) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    overlap.pair,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                Text(
                  overlap.duration,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey.shade600,
                      ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${overlap.count} times',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey,
                      ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _buildGroupOverlapsSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '3+ Contacts Together',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
        ),
        const SizedBox(height: 8),
        ...report.reportData.groupOverlaps.take(3).map((overlap) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    overlap.label,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                Text(
                  overlap.duration,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey.shade600,
                      ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${overlap.count} windows',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey,
                      ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  String _formatDuration(int seconds) {
    final minutes = seconds ~/ 60;
    if (minutes >= 60) {
      final hours = minutes ~/ 60;
      final remainingMinutes = minutes % 60;
      return '${hours}h ${remainingMinutes}m';
    }
    return '${minutes}m';
  }
}

class _InsightChip extends StatelessWidget {
  final String label;

  const _InsightChip({
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

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;

  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primaryContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Icon(
            icon,
            size: 20,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.primary,
                ),
          ),
        ],
      ),
    );
  }
}
