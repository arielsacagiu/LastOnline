const express = require('express');
const router = express.Router();
const MonitorHealthService = require('../services/monitor_health_service');
const AnomalyDetectionService = require('../services/anomaly_detection_service');
const { getSessionStatus } = require('../scraper');
const auth = require('../middleware/auth');

const monitorHealth = new MonitorHealthService();
const anomalyDetection = new AnomalyDetectionService();

/**
 * GET /api/monitor/session
 * Get current WhatsApp Web session status for the server
 */
router.get('/session', auth, async (req, res) => {
  try {
    const session = await getSessionStatus();
    res.json(session);
  } catch (error) {
    console.error('[Monitor] Session status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/monitor/health
 * Get monitor health status for the current user
 */
router.get('/health', auth, async (req, res) => {
  try {
    const summary = await monitorHealth.getHealthSummary(req.user.id, 7);
    const current = await monitorHealth.getCurrentStatus(req.user.id);

    res.json({
      summary,
      current,
      status: current.status,
      healthScore: summary.healthScore,
    });
  } catch (error) {
    console.error('[Monitor] Health status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/monitor/anomalies
 * Get unresolved anomalies for the current user
 */
router.get('/anomalies', auth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const anomalies = await anomalyDetection.getUnresolvedAnomalies(
      req.user.id,
      parseInt(limit)
    );

    // Parse metadata for each anomaly
    const parsedAnomalies = anomalies.map(anomaly => ({
      ...anomaly,
      metadata: anomaly.metadata ? JSON.parse(anomaly.metadata) : null,
    }));

    res.json(parsedAnomalies);
  } catch (error) {
    console.error('[Monitor] Anomalies error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/monitor/anomalies/:id/resolve
 * Resolve an anomaly
 */
router.post('/anomalies/:id/resolve', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await anomalyDetection.resolveAnomaly(parseInt(id), req.user.id);

    if (result.count === 0) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    res.json({ success: true, message: 'Anomaly resolved' });
  } catch (error) {
    console.error('[Monitor] Resolve anomaly error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/monitor/anomalies/stats
 * Get anomaly statistics for the current user
 */
router.get('/anomalies/stats', auth, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const stats = await anomalyDetection.getAnomalyStats(
      req.user.id,
      parseInt(days)
    );

    res.json(stats);
  } catch (error) {
    console.error('[Monitor] Anomaly stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/monitor/anomalies/detect
 * Manually trigger anomaly detection
 */
router.post('/anomalies/detect', auth, async (req, res) => {
  try {
    const { days = 7 } = req.body;
    const anomalies = await anomalyDetection.detectAnomalies(
      req.user.id,
      parseInt(days)
    );

    res.json({ 
      detected: anomalies.length,
      anomalies: anomalies.slice(0, 10), // Return first 10
    });
  } catch (error) {
    console.error('[Monitor] Detect anomalies error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/monitor/uptime
 * Get detailed uptime history
 */
router.get('/uptime', auth, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const summary = await monitorHealth.getHealthSummary(
      req.user.id,
      parseInt(days)
    );

    res.json({
      period: `${days} days`,
      overallUptime: summary.avgUptime,
      healthScore: summary.healthScore,
      totalChecks: summary.totalChecks,
      successfulChecks: summary.totalOk,
      totalGaps: summary.totalGaps,
      averageGapSec: summary.avgGapSec,
      dailyBreakdown: summary.dailyRecords.map(record => ({
        date: record.date,
        uptime: record.uptimePct,
        checksRun: record.checksRun,
        checksOk: record.checksOk,
        gapsDetected: record.gapsDetected,
        avgGapSec: record.avgGapSec,
      })),
    });
  } catch (error) {
    console.error('[Monitor] Uptime error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
