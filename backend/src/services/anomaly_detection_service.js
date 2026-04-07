const prisma = require('../prisma');

class AnomalyDetectionService {
  constructor(analyticsService = null) {
    this.prisma = prisma;
    this._analytics = analyticsService;
  }

  get analytics() {
    if (!this._analytics) {
      const AnalyticsService = require('./analytics_service');
      this._analytics = new AnalyticsService();
    }
    return this._analytics;
  }

  /**
   * Detect anomalies for a user's contacts
   */
  async detectAnomalies(userId, timeWindow = 7) {
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - timeWindow);

    const anomalies = [];

    // Get user's contacts with sessions
    const contacts = await this.prisma.contact.findMany({
      where: { userId },
      include: {
        sessions: {
          where: {
            startedAt: { gte: startDate, lt: endDate },
          },
          orderBy: { startedAt: 'asc' },
        },
      },
    });

    for (const contact of contacts) {
      const contactAnomalies = await this.detectContactAnomalies(contact, startDate, endDate);
      anomalies.push(...contactAnomalies);
    }

    // Detect group anomalies
    const groupAnomalies = await this.detectGroupAnomalies(userId, startDate, endDate);
    anomalies.push(...groupAnomalies);

    // Store new anomalies
    for (const anomaly of anomalies) {
      await this.createAnomaly(userId, anomaly);
    }

    return anomalies;
  }

  /**
   * Detect anomalies for a specific contact
   */
  async detectContactAnomalies(contact, startDate, endDate) {
    const anomalies = [];
    const sessions = contact.sessions;

    if (sessions.length === 0) return anomalies;

    // Late night activity detection
    const lateNightSessions = sessions.filter(session => {
      const hour = session.startedAt.getHours();
      return hour >= 1 && hour <= 4; // 1 AM - 4 AM
    });

    if (lateNightSessions.length >= 3) {
      anomalies.push({
        type: 'late_night',
        severity: this.calculateSeverity(lateNightSessions.length, 3, 10),
        title: `Unusual late-night activity: ${contact.name}`,
        description: `${contact.name} was online ${lateNightSessions.length} times between 1-4 AM, which is unusual for this contact`,
        contactId: contact.id,
        metadata: JSON.stringify({
          contactName: contact.name,
          lateNightCount: lateNightSessions.length,
          totalSessions: sessions.length,
          sessions: lateNightSessions.map(s => ({
            startedAt: s.startedAt,
            durationSec: s.durationSec,
          })),
        }),
      });
    }

    // Pattern deviation detection
    const patternAnomaly = await this.detectPatternDeviation(contact, sessions);
    if (patternAnomaly) {
      anomalies.push({
        ...patternAnomaly,
        contactId: contact.id,
      });
    }

    // Gap detection (unusual offline periods)
    const gapAnomaly = await this.detectUnusualGaps(contact, sessions);
    if (gapAnomaly) {
      anomalies.push({
        ...gapAnomaly,
        contactId: contact.id,
      });
    }

    return anomalies;
  }

  /**
   * Detect pattern deviations from normal behavior
   */
  async detectPatternDeviation(contact, sessions) {
    if (sessions.length < 5) return null; // Need enough data

    // Analyze hourly distribution
    const hourlyActivity = new Array(24).fill(0);
    for (const session of sessions) {
      const hour = session.startedAt.getHours();
      hourlyActivity[hour] += 1;
    }

    // Find peak hours
    const avgActivity = sessions.length / 24;
    const threshold = avgActivity * 3; // 3x average is unusual

    for (let hour = 0; hour < 24; hour++) {
      if (hourlyActivity[hour] >= threshold) {
        const hourStr = hour.toString().padStart(2, '0');
        return {
          type: 'unusual_pattern',
          severity: this.calculateSeverity(hourlyActivity[hour], threshold, threshold * 2),
          title: `Unusual activity pattern: ${contact.name}`,
          description: `${contact.name} was frequently online around ${hourStr}:00, which is ${hourlyActivity[hour]} times (unusual for this contact)`,
          metadata: JSON.stringify({
            contactName: contact.name,
            unusualHour: hour,
            activityCount: hourlyActivity[hour],
            averageActivity: avgActivity,
            hourlyDistribution: hourlyActivity,
          }),
        };
      }
    }

    return null;
  }

  /**
   * Detect unusual gaps in activity
   */
  async detectUnusualGaps(contact, sessions) {
    if (sessions.length < 3) return null;

    // Sort sessions by start time
    const sortedSessions = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
    
    // Calculate gaps between sessions
    const gaps = [];
    for (let i = 1; i < sortedSessions.length; i++) {
      const prevEnd = sortedSessions[i-1].endedAt || sortedSessions[i-1].startedAt;
      const gapMs = sortedSessions[i].startedAt - prevEnd;
      if (gapMs > 0) {
        gaps.push(gapMs / (1000 * 60 * 60)); // Convert to hours
      }
    }

    if (gaps.length === 0) return null;

    // Find unusually long gaps
    const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const longGaps = gaps.filter(gap => gap > avgGap * 3);

    if (longGaps.length >= 2) {
      return {
        type: 'unusual_gap',
        severity: this.calculateSeverity(longGaps.length, 2, 5),
        title: `Unusual activity gaps: ${contact.name}`,
        description: `${contact.name} had ${longGaps.length} unusually long offline periods, suggesting possible device changes or behavior shifts`,
        metadata: JSON.stringify({
          contactName: contact.name,
          longGapsCount: longGaps.length,
          averageGap: Math.floor(avgGap),
          maxGap: Math.floor(Math.max(...gaps)),
          gaps: longGaps,
        }),
      };
    }

    return null;
  }

  /**
   * Detect group anomalies (unusual overlap patterns)
   */
  async detectGroupAnomalies(userId, startDate, endDate) {
    const anomalies = [];

    // Get overlap data for the period
    const overlapData = await this.analytics.detectUserOverlaps(userId, startDate, endDate);
    
    // Check for unusually large groups
    if (overlapData.maxGroupSize >= 4) {
      anomalies.push({
        type: 'group_anomaly',
        severity: 'medium',
        title: 'Large group overlap detected',
        description: `${overlapData.maxGroupSize} contacts were online simultaneously, which is unusual`,
        metadata: JSON.stringify({
          maxGroupSize: overlapData.maxGroupSize,
          groupOverlaps: overlapData.groupOverlaps.slice(0, 3),
          period: { startDate, endDate },
        }),
      });
    }

    // Check for recurring unusual patterns
    const recurringPatterns = this.detectRecurringPatterns(
      overlapData.groupWindows || []
    );
    for (const pattern of recurringPatterns) {
      anomalies.push({
        type: 'recurring_pattern',
        severity: 'low',
        title: `Recurring overlap pattern: ${pattern.contacts.join(' + ')}`,
        description: `This group overlapped ${pattern.count} times with similar timing, suggesting a regular pattern`,
        metadata: JSON.stringify(pattern),
      });
    }

    return anomalies;
  }

  /**
   * Detect recurring patterns in group overlaps
   */
  detectRecurringPatterns(groupWindows) {
    const patterns = new Map();

    for (const overlap of groupWindows) {
      const contacts = [...overlap.contacts].sort((left, right) =>
        left.name.localeCompare(right.name)
      );
      const key = contacts.map((contact) => contact.name).join(':');
      if (!patterns.has(key)) {
        patterns.set(key, {
          contacts: contacts.map((contact) => contact.name),
          count: 0,
          totalDuration: 0,
          timeWindows: [],
        });
      }

      const pattern = patterns.get(key);
      pattern.count += 1;
      pattern.totalDuration += overlap.durationSec;
      
      // Extract time window (hour of day)
      const hour = new Date(overlap.startedAt).getHours();
      pattern.timeWindows.push(hour);
    }

    // Find patterns with consistent timing
    const recurringPatterns = [];
    for (const [key, pattern] of patterns.entries()) {
      if (pattern.count >= 3) {
        // Check if timing is consistent
        const hourCounts = new Map();
        for (const hour of pattern.timeWindows) {
          hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
        }

        const maxHourCount = Math.max(...hourCounts.values());
        if (maxHourCount >= pattern.count * 0.6) { // 60% of overlaps in same hour
          const consistentHour = [...hourCounts.entries()].find(([_, count]) => count === maxHourCount)[0];
          
          recurringPatterns.push({
            contacts: pattern.contacts,
            count: pattern.count,
            totalDuration: pattern.totalDuration,
            consistentHour,
            avgDuration: Math.floor(pattern.totalDuration / pattern.count),
          });
        }
      }
    }

    return recurringPatterns;
  }

  /**
   * Calculate anomaly severity based on count
   */
  calculateSeverity(count, lowThreshold, highThreshold) {
    if (count >= highThreshold) return 'high';
    if (count >= lowThreshold) return 'medium';
    return 'low';
  }

  /**
   * Create anomaly record in database
   */
  async createAnomaly(userId, anomaly) {
    // Check if similar anomaly already exists and is unresolved
    const existing = await this.prisma.anomalyEvent.findFirst({
      where: {
        userId,
        type: anomaly.type,
        resolved: false,
        contactId: anomaly.contactId || null,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });

    if (existing) {
      // Update existing anomaly
      return await this.prisma.anomalyEvent.update({
        where: { id: existing.id },
        data: {
          severity: anomaly.severity,
          title: anomaly.title,
          description: anomaly.description,
          metadata: anomaly.metadata,
          createdAt: new Date(), // Update to show it's fresh
        },
      });
    }

    // Create new anomaly
    return await this.prisma.anomalyEvent.create({
      data: {
        userId,
        contactId: anomaly.contactId,
        type: anomaly.type,
        severity: anomaly.severity,
        title: anomaly.title,
        description: anomaly.description,
        metadata: anomaly.metadata,
      },
    });
  }

  /**
   * Get unresolved anomalies for a user
   */
  async getUnresolvedAnomalies(userId, limit = 20) {
    return await this.prisma.anomalyEvent.findMany({
      where: {
        userId,
        resolved: false,
      },
      include: {
        contact: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Resolve an anomaly
   */
  async resolveAnomaly(anomalyId, userId) {
    return await this.prisma.anomalyEvent.updateMany({
      where: {
        id: anomalyId,
        userId, // Security: ensure user owns this anomaly
      },
      data: {
        resolved: true,
      },
    });
  }

  /**
   * Get anomaly statistics
   */
  async getAnomalyStats(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const anomalies = await this.prisma.anomalyEvent.findMany({
      where: {
        userId,
        createdAt: { gte: startDate },
      },
    });

    const stats = {
      total: anomalies.length,
      resolved: anomalies.filter(a => a.resolved).length,
      unresolved: anomalies.filter(a => !a.resolved).length,
      byType: {},
      bySeverity: {},
      recentTrend: [],
    };

    // Group by type and severity
    for (const anomaly of anomalies) {
      stats.byType[anomaly.type] = (stats.byType[anomaly.type] || 0) + 1;
      stats.bySeverity[anomaly.severity] = (stats.bySeverity[anomaly.severity] || 0) + 1;
    }

    // Calculate daily trend
    const dailyMap = new Map();
    for (const anomaly of anomalies) {
      const day = anomaly.createdAt.toISOString().split('T')[0];
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    }

    stats.recentTrend = Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7); // Last 7 days

    return stats;
  }
}

module.exports = AnomalyDetectionService;
