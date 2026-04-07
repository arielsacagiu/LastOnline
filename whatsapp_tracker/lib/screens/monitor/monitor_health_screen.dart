import 'package:flutter/material.dart';
import '../../services/monitor_service.dart';
import '../../theme/app_theme.dart';

class MonitorHealthScreen extends StatefulWidget {
  const MonitorHealthScreen({super.key});

  @override
  State<MonitorHealthScreen> createState() => _MonitorHealthScreenState();
}

class _MonitorHealthScreenState extends State<MonitorHealthScreen> {
  final MonitorService _monitorService = MonitorService();
  WhatsAppSessionStatus? _sessionStatus;
  MonitorHealthStatus? _healthStatus;
  List<AnomalyEvent> _anomalies = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      setState(() {
        _loading = true;
        _error = null;
      });

      final sessionStatus = await _monitorService.getSessionStatus();
      final healthStatus = await _monitorService.getHealthStatus();
      final anomalies = await _monitorService.getAnomalies(limit: 10);

      setState(() {
        _sessionStatus = sessionStatus;
        _healthStatus = healthStatus;
        _anomalies = anomalies;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _resolveAnomaly(int anomalyId) async {
    try {
      await _monitorService.resolveAnomaly(anomalyId);
      await _loadData(); // Refresh data
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Anomaly resolved')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to resolve anomaly: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Monitor Health'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _buildBody(),
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
              'Failed to load monitor data',
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
              onPressed: _loadData,
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (_healthStatus == null && _sessionStatus == null) {
      return const Center(child: Text('No monitor data available'));
    }

    final children = <Widget>[];
    if (_sessionStatus != null) {
      children.add(_buildSessionCard());
    }
    if (_healthStatus != null) {
      if (children.isNotEmpty) {
        children.add(const SizedBox(height: 16));
      }
      children.add(_buildHealthScoreCard());
      children.add(const SizedBox(height: 16));
      children.add(_buildCurrentStatusCard());
      children.add(const SizedBox(height: 16));
      children.add(_buildUptimeChart());
      children.add(const SizedBox(height: 16));
    }
    children.add(_buildAnomaliesSection());

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: children,
      ),
    );
  }

  Widget _buildSessionCard() {
    final session = _sessionStatus!;
    late final Color color;
    late final IconData icon;

    switch (session.status) {
      case 'connected':
        color = Colors.green;
        icon = Icons.link;
        break;
      case 'login_required':
        color = Colors.orange;
        icon = Icons.login;
        break;
      case 'loading':
        color = Colors.blue;
        icon = Icons.sync;
        break;
      case 'profile_in_use':
        color = Colors.orange;
        icon = Icons.open_in_browser;
        break;
      case 'error':
        color = Colors.red;
        icon = Icons.error_outline;
        break;
      default:
        color = Colors.grey;
        icon = Icons.help_outline;
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: color),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'WhatsApp Session',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    session.statusDisplay,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: color,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    session.message,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.grey.shade700,
                        ),
                  ),
                  if (session.checkedAt != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Checked ${session.checkedAt!.hour.toString().padLeft(2, '0')}:${session.checkedAt!.minute.toString().padLeft(2, '0')}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.grey,
                          ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHealthScoreCard() {
    final healthScore = _healthStatus!.healthScore;
    final status = _healthStatus!.status;
    
    Color scoreColor;
    String scoreLabel;
    
    if (healthScore >= 90) {
      scoreColor = Colors.green;
      scoreLabel = 'Excellent';
    } else if (healthScore >= 70) {
      scoreColor = Colors.orange;
      scoreLabel = 'Good';
    } else {
      scoreColor = Colors.red;
      scoreLabel = 'Needs Attention';
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Monitor Health Score',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: scoreColor.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          healthScore.toString(),
                          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                color: scoreColor,
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                        Text(
                          '/100',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: scoreColor,
                              ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        scoreLabel,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                              color: scoreColor,
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Status: ${status[0].toUpperCase() + status.substring(1)}',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: Colors.grey.shade600,
                            ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Based on uptime, gap detection, and check reliability',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Colors.grey,
                            ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCurrentStatusCard() {
    final current = _healthStatus!.current;
    
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Current Status',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _StatusItem(
                    label: 'Uptime',
                    value: '${current.uptime}%',
                    icon: Icons.speed,
                    color: current.uptime >= 90 ? Colors.green : 
                           current.uptime >= 70 ? Colors.orange : Colors.red,
                  ),
                ),
                Expanded(
                  child: _StatusItem(
                    label: 'Checks Run',
                    value: current.checksRun.toString(),
                    icon: Icons.check_circle_outline,
                    color: AppTheme.primaryGreen,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _StatusItem(
                    label: 'Successful',
                    value: '${current.checksRun > 0 ? ((current.checksRun - current.gapsDetected) / current.checksRun * 100).round() : 0}%',
                    icon: Icons.done_all,
                    color: AppTheme.primaryGreen,
                  ),
                ),
                Expanded(
                  child: _StatusItem(
                    label: 'Gaps',
                    value: current.gapsDetected.toString(),
                    icon: Icons.warning_amber_outlined,
                    color: current.gapsDetected > 0 ? Colors.orange : Colors.grey,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUptimeChart() {
    final dailyRecords = _healthStatus!.summary.dailyRecords.take(7).toList();
    
    if (dailyRecords.isEmpty) {
      return const SizedBox.shrink();
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '7-Day Uptime Trend',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 120,
              child: Row(
                children: dailyRecords.map((record) {
                  final uptime = record.uptime;
                  final color = uptime >= 90 ? Colors.green : 
                               uptime >= 70 ? Colors.orange : Colors.red;
                  
                  return Expanded(
                    child: Column(
                      children: [
                        Expanded(
                          child: Container(
                            margin: const EdgeInsets.symmetric(horizontal: 2),
                            decoration: BoxDecoration(
                              color: color.withValues(alpha: 0.3),
                              borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(4),
                              ),
                            ),
                            child: Align(
                              alignment: Alignment.topCenter,
                              child: FractionallySizedBox(
                                heightFactor: uptime / 100,
                                child: Container(
                                  decoration: BoxDecoration(
                                    color: color,
                                    borderRadius: const BorderRadius.vertical(
                                      top: Radius.circular(4),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${record.uptime.round()}%',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                fontSize: 10,
                              ),
                        ),
                        Text(
                          '${record.date.month}/${record.date.day}',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                fontSize: 9,
                                color: Colors.grey,
                              ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAnomaliesSection() {
    if (_anomalies.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(
                Icons.check_circle_outline,
                color: Colors.green.shade400,
                size: 24,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'No Anomalies Detected',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            color: Colors.green.shade700,
                          ),
                    ),
                    Text(
                      'Monitor is operating normally',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.grey,
                          ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Recent Anomalies (${_anomalies.length})',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            TextButton(
              onPressed: _loadData,
              child: const Text('Refresh'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ..._anomalies.map((anomaly) => _buildAnomalyCard(anomaly)),
      ],
    );
  }

  Widget _buildAnomalyCard(AnomalyEvent anomaly) {
    Color severityColor;
    IconData severityIcon;
    
    switch (anomaly.severity) {
      case 'high':
        severityColor = Colors.red;
        severityIcon = Icons.error;
        break;
      case 'medium':
        severityColor = Colors.orange;
        severityIcon = Icons.warning;
        break;
      default:
        severityColor = Colors.blue;
        severityIcon = Icons.info_outline;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  severityIcon,
                  color: severityColor,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    anomaly.title,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ),
                Text(
                  anomaly.timeAgoDisplay,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey,
                      ),
                ),
              ],
            ),
            if (anomaly.description != null) ...[
              const SizedBox(height: 4),
              Text(
                anomaly.description!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey.shade700,
                    ),
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: severityColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    anomaly.severityDisplay,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: severityColor,
                          fontWeight: FontWeight.w500,
                        ),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.grey.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    anomaly.typeDisplay,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.grey.shade700,
                        ),
                  ),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () => _resolveAnomaly(anomaly.id),
                  child: const Text('Resolve'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusItem extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatusItem({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(
          icon,
          color: color,
          size: 24,
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: color,
              ),
        ),
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Colors.grey.shade600,
              ),
        ),
      ],
    );
  }
}
