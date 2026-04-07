const prisma = require('../prisma');

class MonitorHealthService {
  constructor() {
    this.prisma = prisma;
    this.expectedIntervalMs = 1000; // Expected check interval
    this.gapThresholdMs = 5000; // Consider gap if > 5s between checks
    this.dailyStats = new Map(); // userId -> daily stats
  }

  /**
   * Record a successful monitoring check
   */
  async recordCheck(userId, success = true) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // Start of UTC day

    if (!this.dailyStats.has(userId)) {
      await this.loadDailyStats(userId, today);
    }

    const stats = this.dailyStats.get(userId);
    const now = new Date();
    const previousCheckTime = stats.lastCheckTime;

    stats.checksRun += 1;
    if (success) {
      stats.checksOk += 1;
    }

    // Detect gaps
    if (previousCheckTime && success) {
      const gapMs = now - previousCheckTime;
      if (gapMs > this.gapThresholdMs) {
        stats.gapsDetected += 1;
        stats.totalGapSec += Math.floor(gapMs / 1000);
      }
    }

    if (success) {
      stats.lastCheckTime = now;
    }

    // Update uptime percentage
    stats.uptimePct = stats.checksRun > 0 ? (stats.checksOk / stats.checksRun) * 100 : 0;
    stats.avgGapSec = stats.gapsDetected > 0 ? Math.floor(stats.totalGapSec / stats.gapsDetected) : null;

    // Persist every 10 checks or every 5 minutes
    if (stats.checksRun % 10 === 0 || (now - stats.lastPersistTime) > 5 * 60 * 1000) {
      await this.persistDailyStats(userId, today);
      stats.lastPersistTime = now;
    }
  }

  /**
   * Load daily stats from database
   */
  async loadDailyStats(userId, date) {
    const existing = await this.prisma.monitorHealth.findFirst({
      where: {
        userId,
        date,
      },
    });

    const stats = {
      checksRun: existing?.checksRun || 0,
      checksOk: existing?.checksOk || 0,
      gapsDetected: existing?.gapsDetected || 0,
      totalGapSec: 0, // Not stored, calculated on the fly
      uptimePct: existing?.uptimePct || 0,
      avgGapSec: existing?.avgGapSec,
      lastCheckTime: null,
      lastPersistTime: new Date(),
    };

    this.dailyStats.set(userId, stats);
    return stats;
  }

  /**
   * Persist daily stats to database
   */
  async persistDailyStats(userId, date) {
    const stats = this.dailyStats.get(userId);
    if (!stats) return;

    await this.prisma.monitorHealth.upsert({
      where: {
        userId_date: {
          userId,
          date,
        },
      },
      update: {
        checksRun: stats.checksRun,
        checksOk: stats.checksOk,
        gapsDetected: stats.gapsDetected,
        avgGapSec: stats.avgGapSec,
        uptimePct: stats.uptimePct,
      },
      create: {
        userId,
        date,
        checksRun: stats.checksRun,
        checksOk: stats.checksOk,
        gapsDetected: stats.gapsDetected,
        avgGapSec: stats.avgGapSec,
        uptimePct: stats.uptimePct,
      },
    });
  }

  /**
   * Get health summary for the last N days
   */
  async getHealthSummary(userId, days = 7) {
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);

    const records = await this.prisma.monitorHealth.findMany({
      where: {
        userId,
        date: { gte: startDate },
      },
      orderBy: { date: 'desc' },
    });

    const summary = {
      totalChecks: 0,
      totalOk: 0,
      totalGaps: 0,
      avgUptime: 0,
      avgGapSec: 0,
      dailyRecords: records,
      healthScore: 0, // 0-100 score
    };

    if (records.length === 0) return summary;

    for (const record of records) {
      summary.totalChecks += record.checksRun;
      summary.totalOk += record.checksOk;
      summary.totalGaps += record.gapsDetected;
      if (record.avgGapSec) {
        summary.avgGapSec += record.avgGapSec;
      }
    }

    summary.avgUptime = summary.totalChecks > 0 ? (summary.totalOk / summary.totalChecks) * 100 : 0;
    summary.avgGapSec = records.length > 0 ? Math.floor(summary.avgGapSec / records.length) : 0;

    // Calculate health score (0-100)
    const uptimeWeight = 0.6;
    const gapWeight = 0.4;
    const gapPenalty = Math.min(summary.totalGaps / (records.length * 10), 1); // Normalize gaps
    summary.healthScore = Math.floor(
      (summary.avgUptime * uptimeWeight) + ((1 - gapPenalty) * 100 * gapWeight)
    );

    return summary;
  }

  /**
   * Get current uptime status
   */
  async getCurrentStatus(userId) {
    const stats = this.dailyStats.get(userId);
    if (!stats) {
      return {
        status: 'unknown',
        uptime: 0,
        checksRun: 0,
        gapsDetected: 0,
        avgGapSec: null,
      };
    }

    const recentChecks = stats.checksRun;
    const recentOk = stats.checksOk;
    const uptime = recentChecks > 0 ? (recentOk / recentChecks) * 100 : 0;

    let status = 'healthy';
    if (uptime < 50) status = 'poor';
    else if (uptime < 80) status = 'degraded';
    else if (uptime < 95) status = 'good';

    return {
      status,
      uptime: Math.floor(uptime),
      checksRun: recentChecks,
      gapsDetected: stats.gapsDetected,
      avgGapSec: stats.avgGapSec,
    };
  }

  /**
   * Persist all pending daily stats (call this periodically)
   */
  async persistAll() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (const [userId, stats] of this.dailyStats.entries()) {
      await this.persistDailyStats(userId, today);
    }
  }

  /**
   * Clean up old stats (older than 30 days)
   */
  async cleanup() {
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 30);
    cutoffDate.setUTCHours(0, 0, 0, 0);

    const deleted = await this.prisma.monitorHealth.deleteMany({
      where: {
        date: { lt: cutoffDate },
      },
    });

    console.log(`[MonitorHealth] Cleaned up ${deleted.count} old health records`);
  }
}

module.exports = MonitorHealthService;
