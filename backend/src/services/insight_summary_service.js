const prisma = require('../prisma');

class InsightSummaryService {
  constructor() {
    this.prisma = prisma;
  }

  /**
   * Generate plain-English summary for weekly report
   */
  async generateWeeklySummary(userId, weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Get weekly report data
    const weeklyReport = await this.prisma.weeklyReport.findFirst({
      where: {
        userId,
        weekStart,
      },
    });

    if (!weeklyReport) {
      return { summary: 'No data available for this week.' };
    }

    const reportData = JSON.parse(weeklyReport.reportData);
    const anomalies = await this.prisma.anomalyEvent.findMany({
      where: {
        userId,
        createdAt: { gte: weekStart, lt: weekEnd },
        resolved: false,
      },
      include: {
        contact: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const healthSummary = await this.getHealthSummary(userId, weekStart, weekEnd);
    const routineChanges = await this.getRoutineChanges(userId, weekStart, weekEnd);

    const summary = this.buildWeeklyNarrative(
      reportData,
      anomalies,
      healthSummary,
      routineChanges
    );

    return {
      summary,
      insights: {
        totalAnomalies: anomalies.length,
        healthScore: healthSummary.score,
        routineChanges: routineChanges.length,
        topContacts: reportData.topContacts?.slice(0, 3) || [],
      },
    };
  }

  /**
   * Build narrative summary for weekly report
   */
  buildWeeklyNarrative(reportData, anomalies, healthSummary, routineChanges) {
    const narratives = [];

    // Overall activity summary
    if (reportData.totalContacts > 0) {
      const topContact = reportData.topContacts?.[0];
      if (topContact) {
        narratives.push(
          `${topContact.name} was the most active this week with ${this.formatDuration(topContact.totalOnlineSec)} of online time.`
        );
      }

      const avgSessionDuration = reportData.averageSessionDuration;
      if (avgSessionDuration > 0) {
        narratives.push(
          `Average online session was ${this.formatDuration(avgSessionDuration)} across all contacts.`
        );
      }
    }

    // Overlap insights
    if (reportData.overlaps && reportData.overlaps.length > 0) {
      const topOverlap = reportData.overlaps[0];
      narratives.push(
        `${topOverlap.pair} overlapped online for ${this.formatDuration(topOverlap.durationSec)} this week.`
      );

      if (reportData.maxGroupSize >= 3) {
        narratives.push(
          `The largest simultaneous group had ${reportData.maxGroupSize} contacts online together.`
        );
      }
    }

    // Anomaly highlights
    if (anomalies.length > 0) {
      const highSeverityAnomalies = anomalies.filter(a => a.severity === 'high');
      const lateNightAnomalies = anomalies.filter(a => a.type === 'late_night');

      if (highSeverityAnomalies.length > 0) {
        narratives.push(
          `${highSeverityAnomalies.length} unusual activity patterns were detected that may indicate behavior changes.`
        );
      }

      if (lateNightAnomalies.length > 0) {
        const contactNames = [...new Set(lateNightAnomalies.map(a => a.contact?.name).filter(Boolean))];
        if (contactNames.length > 0) {
          narratives.push(
            `${contactNames.join(' and ')} showed unusual late-night activity patterns.`
          );
        }
      }
    }

    // Health and reliability
    if (healthSummary.score < 70) {
      narratives.push(
        'Monitor reliability was below optimal this week, which may affect data accuracy.'
      );
    } else if (healthSummary.score >= 90) {
      narratives.push(
        'Excellent monitoring reliability this week with comprehensive data coverage.'
      );
    }

    // Routine changes
    if (routineChanges.length > 0) {
      const significantChanges = routineChanges.filter(c => c.severity === 'high');
      if (significantChanges.length > 0) {
        narratives.push(
          `${significantChanges.length} significant routine changes were detected this week.`
        );
      }
    }

    // Build final summary
    if (narratives.length === 0) {
      return 'Normal activity patterns observed this week with no significant anomalies detected.';
    }

    return narratives.join(' ') + (anomalies.length > 0 ? ' Review recommended for unusual patterns.' : '');
  }

  /**
   * Generate anomaly explanation
   */
  async explainAnomaly(anomalyId) {
    const anomaly = await this.prisma.anomalyEvent.findUnique({
      where: { id: anomalyId },
      include: {
        contact: { select: { name: true } },
      },
    });

    if (!anomaly) {
      return { explanation: 'Anomaly not found.' };
    }

    const metadata = anomaly.metadata ? JSON.parse(anomaly.metadata) : {};
    let explanation = '';

    switch (anomaly.type) {
      case 'late_night':
        explanation = this.explainLateNightAnomaly(anomaly, metadata);
        break;
      case 'unusual_pattern':
        explanation = this.explainUnusualPatternAnomaly(anomaly, metadata);
        break;
      case 'unusual_gap':
        explanation = this.explainUnusualGapAnomaly(anomaly, metadata);
        break;
      case 'group_anomaly':
        explanation = this.explainGroupAnomaly(anomaly, metadata);
        break;
      case 'recurring_pattern':
        explanation = this.explainRecurringPatternAnomaly(anomaly, metadata);
        break;
      default:
        explanation = anomaly.description || 'Unusual activity pattern detected.';
    }

    return {
      explanation,
      severity: anomaly.severity,
      recommendations: this.getRecommendations(anomaly.type, anomaly.severity),
      context: this.getContextualInfo(anomaly),
    };
  }

  /**
   * Explain late night activity anomaly
   */
  explainLateNightAnomaly(anomaly, metadata) {
    const contactName = anomaly.contact?.name || 'Contact';
    const lateNightCount = metadata.lateNightCount || 0;
    const totalSessions = metadata.totalSessions || 0;
    const percentage = totalSessions > 0 ? Math.round((lateNightCount / totalSessions) * 100) : 0;

    return `${contactName} was online ${lateNightCount} times between 1-4 AM, which is ${percentage}% of their total activity. This is unusual for their typical pattern and may indicate changed sleep habits or unusual circumstances.`;
  }

  /**
   * Explain unusual pattern anomaly
   */
  explainUnusualPatternAnomaly(anomaly, metadata) {
    const contactName = anomaly.contact?.name || 'Contact';
    const unusualHour = metadata.unusualHour || 0;
    const activityCount = metadata.activityCount || 0;
    const averageActivity = metadata.averageActivity || 0;

    return `${contactName} showed unusually high activity around ${unusualHour}:00, with ${activityCount} sessions compared to their normal average of ${averageActivity.toFixed(1)}. This concentrated activity pattern differs from their typical distribution.`;
  }

  /**
   * Explain unusual gap anomaly
   */
  explainUnusualGapAnomaly(anomaly, metadata) {
    const contactName = anomaly.contact?.name || 'Contact';
    const longGapsCount = metadata.longGapsCount || 0;
    const averageGap = metadata.averageGap || 0;
    const maxGap = metadata.maxGap || 0;

    return `${contactName} had ${longGapsCount} unusually long offline periods, with gaps averaging ${Math.floor(averageGap)} hours and some extending to ${Math.floor(maxGap)} hours. This may indicate device changes, travel, or altered usage patterns.`;
  }

  /**
   * Explain group anomaly
   */
  explainGroupAnomaly(anomaly, metadata) {
    const maxGroupSize = metadata.maxGroupSize || 0;
    const groupOverlaps = metadata.groupOverlaps || [];

    if (groupOverlaps.length > 0) {
      const topGroup = groupOverlaps[0];
      return `A group of ${maxGroupSize} contacts were online simultaneously. The most frequent combination was ${topGroup.contacts?.join(' + ') || 'multiple contacts'}, overlapping for ${this.formatDuration(topGroup.durationSec || 0)}.`;
    }

    return `${maxGroupSize} contacts were online simultaneously, which is larger than typical group sizes.`;
  }

  /**
   * Explain recurring pattern anomaly
   */
  explainRecurringPatternAnomaly(anomaly, metadata) {
    const contacts = metadata.contacts || [];
    const count = metadata.count || 0;
    const consistentHour = metadata.consistentHour || 0;
    const avgDuration = metadata.avgDuration || 0;

    return `${contacts.join(' + ')} overlapped online ${count} times, frequently around ${consistentHour}:00. This recurring pattern suggests a regular meeting or coordinated activity, with average overlap duration of ${this.formatDuration(avgDuration)}.`;
  }

  /**
   * Get recommendations based on anomaly type and severity
   */
  getRecommendations(type, severity) {
    const recommendations = {
      late_night: [
        'Check if this is a one-time event or developing pattern',
        'Consider if external factors (travel, events) might explain the change',
        'Monitor for consistency over the next few days',
      ],
      unusual_pattern: [
        'Review if this aligns with known schedule changes',
        'Check for possible device or app usage changes',
        'Compare with similar weekdays to identify patterns',
      ],
      unusual_gap: [
        'Verify if contact was traveling or had connectivity issues',
        'Check if this corresponds to known schedule changes',
        'Monitor for recovery of normal patterns',
      ],
      group_anomaly: [
        'Consider if this represents planned group activities',
        'Check if this aligns with known events or meetings',
        'Monitor for recurrence of similar group patterns',
      ],
      recurring_pattern: [
        'Acknowledge this as a established routine pattern',
        'Consider if this pattern has practical implications',
        'Use this information for planning and coordination',
      ],
    };

    return recommendations[type] || ['Monitor for additional patterns', 'Consider context and known factors'];
  }

  /**
   * Get contextual information for anomaly
   */
  getContextualInfo(anomaly) {
    return {
      detectedAt: anomaly.createdAt,
      severity: anomaly.severity,
      type: anomaly.type,
      contact: anomaly.contact?.name,
      timeAgo: this.getTimeAgo(anomaly.createdAt),
    };
  }

  /**
   * Get health summary for time period
   */
  async getHealthSummary(userId, startDate, endDate) {
    const healthRecords = await this.prisma.monitorHealth.findMany({
      where: {
        userId,
        date: { gte: startDate, lt: endDate },
      },
    });

    if (healthRecords.length === 0) {
      return { score: 50, status: 'unknown' };
    }

    const avgUptime = healthRecords.reduce((sum, r) => sum + (r.uptimePct || 0), 0) / healthRecords.length;
    const totalGaps = healthRecords.reduce((sum, r) => sum + (r.gapsDetected || 0), 0);

    let score = Math.floor(avgUptime);
    if (totalGaps > healthRecords.length * 2) {
      score -= 10; // Penalty for many gaps
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      status: score >= 90 ? 'excellent' : score >= 70 ? 'good' : 'needs_attention',
    };
  }

  /**
   * Get routine changes for time period
   */
  async getRoutineChanges(userId, startDate, endDate) {
    const contacts = await this.prisma.contact.findMany({
      where: { userId },
      include: {
        routines: true,
        sessions: {
          where: {
            startedAt: { gte: startDate, lt: endDate },
          },
          orderBy: { startedAt: 'asc' },
        },
      },
    });

    const changes = [];

    for (const contact of contacts) {
      if (contact.routines.length === 0 || contact.sessions.length === 0) {
        continue;
      }

      const baseline = this.summarizeRoutineBaseline(contact.routines);
      const weeklyPattern = this.summarizeSessionPattern(contact.sessions);
      const contactChanges = [];

      if (baseline.wakeHour !== null && weeklyPattern.wakeHour !== null) {
        const deviation = this.getHourDeviation(
          weeklyPattern.wakeHour,
          baseline.wakeHour
        );
        if (deviation >= 2) {
          contactChanges.push({
            type: 'wake_time',
            severity: deviation >= 4 ? 'high' : 'medium',
            typical: baseline.wakeHour,
            current: weeklyPattern.wakeHour,
            deviation,
          });
        }
      }

      if (baseline.sleepHour !== null && weeklyPattern.sleepHour !== null) {
        const deviation = this.getHourDeviation(
          weeklyPattern.sleepHour,
          baseline.sleepHour
        );
        if (deviation >= 2) {
          contactChanges.push({
            type: 'sleep_time',
            severity: deviation >= 4 ? 'high' : 'medium',
            typical: baseline.sleepHour,
            current: weeklyPattern.sleepHour,
            deviation,
          });
        }
      }

      if (baseline.avgOnlineSec > 0 && weeklyPattern.avgOnlineSec > 0) {
        const factor = weeklyPattern.avgOnlineSec / baseline.avgOnlineSec;
        if (factor >= 2 || factor <= 0.5) {
          contactChanges.push({
            type: 'activity_level',
            severity: factor >= 3 || factor <= 0.33 ? 'high' : 'medium',
            typical: Math.floor(baseline.avgOnlineSec),
            current: Math.floor(weeklyPattern.avgOnlineSec),
            factor,
          });
        }
      }

      if (contactChanges.length === 0) {
        continue;
      }

      changes.push({
        contactId: contact.id,
        contactName: contact.name,
        severity: contactChanges.some((change) => change.severity === 'high')
          ? 'high'
          : 'medium',
        changes: contactChanges,
      });
    }

    return changes.sort((left, right) => {
      if (left.severity === right.severity) {
        return right.changes.length - left.changes.length;
      }
      return left.severity === 'high' ? -1 : 1;
    });
  }

  summarizeRoutineBaseline(routines) {
    const wakeHours = routines
      .filter((routine) => routine.typicalWakeHour !== null)
      .map((routine) => routine.typicalWakeHour);
    const sleepHours = routines
      .filter((routine) => routine.typicalSleepHour !== null)
      .map((routine) => routine.typicalSleepHour);
    const avgOnlineValues = routines
      .filter((routine) => routine.avgOnlineSec !== null)
      .map((routine) => routine.avgOnlineSec);

    return {
      wakeHour: this.calculateTypicalHour(wakeHours),
      sleepHour: this.calculateTypicalHour(sleepHours),
      avgOnlineSec:
        avgOnlineValues.length > 0
          ? avgOnlineValues.reduce((sum, value) => sum + value, 0) / avgOnlineValues.length
          : 0,
    };
  }

  summarizeSessionPattern(sessions) {
    const sessionsByDay = new Map();

    for (const session of sessions) {
      const dayKey = session.startedAt.toISOString().split('T')[0];
      const daySessions = sessionsByDay.get(dayKey) || [];
      daySessions.push(session);
      sessionsByDay.set(dayKey, daySessions);
    }

    const wakeHours = [];
    const sleepHours = [];
    const dailyOnlineTotals = [];

    for (const daySessions of sessionsByDay.values()) {
      const sortedSessions = [...daySessions].sort(
        (left, right) => left.startedAt - right.startedAt
      );
      const firstSession = sortedSessions[0];
      const lastSession = sortedSessions[sortedSessions.length - 1];
      const wakeHour = firstSession.startedAt.getHours();
      const lastActivityAt = lastSession.endedAt || lastSession.startedAt;
      const sleepHour = lastActivityAt.getHours();
      const totalOnlineSec = sortedSessions.reduce(
        (sum, session) => sum + (session.durationSec || 0),
        0
      );

      if (wakeHour >= 5 && wakeHour <= 11) {
        wakeHours.push(wakeHour);
      }

      if (sleepHour >= 20 || sleepHour <= 2) {
        sleepHours.push(sleepHour);
      }

      dailyOnlineTotals.push(totalOnlineSec);
    }

    return {
      wakeHour: this.calculateTypicalHour(wakeHours),
      sleepHour: this.calculateTypicalHour(sleepHours),
      avgOnlineSec:
        dailyOnlineTotals.length > 0
          ? dailyOnlineTotals.reduce((sum, value) => sum + value, 0) /
            dailyOnlineTotals.length
          : 0,
    };
  }

  calculateTypicalHour(hours) {
    if (hours.length === 0) {
      return null;
    }

    const sorted = [...hours].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
    }

    return sorted[middle];
  }

  getHourDeviation(currentHour, baselineHour) {
    const difference = Math.abs(currentHour - baselineHour);
    return Math.min(difference, 24 - difference);
  }

  /**
   * Format duration in human readable format
   */
  formatDuration(seconds) {
    if (seconds < 60) {
      return `${seconds} seconds`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      if (minutes === 0) {
        return `${hours} hour${hours === 1 ? '' : 's'}`;
      }
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Get time ago string
   */
  getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} day${days === 1 ? '' : 's'} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    } else {
      return 'Recently';
    }
  }

  /**
   * Generate confidence label for data
   */
  getConfidenceLabel(confidence, hasGaps, sampleSize) {
    if (confidence >= 0.8 && !hasGaps && sampleSize >= 7) {
      return 'exact';
    } else if (confidence >= 0.6 && sampleSize >= 5) {
      return 'approximate';
    } else {
      return 'incomplete due to data gap';
    }
  }

  /**
   * Generate daily summary
   */
  async generateDailySummary(userId, date) {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    // Get daily analytics
    const AnalyticsService = require('./analytics_service');
    const analytics = new AnalyticsService();
    
    const contacts = await this.prisma.contact.findMany({
      where: { userId },
      include: {
        sessions: {
          where: {
            startedAt: { gte: startOfDay, lt: endOfDay },
          },
        },
      },
    });

    if (contacts.length === 0) {
      return { summary: 'No contacts tracked.' };
    }

    const activeContacts = contacts.filter(c => c.sessions.length > 0);
    const totalSessions = activeContacts.reduce((sum, c) => sum + c.sessions.length, 0);
    const totalOnlineSec = activeContacts.reduce((sum, c) => 
      sum + c.sessions.reduce((sSum, s) => sSum + (s.durationSec || 0), 0), 0);

    let summary = `${activeContacts.length} of ${contacts.length} contacts were active today`;

    if (totalSessions > 0) {
      summary += ` with ${totalSessions} online sessions totaling ${this.formatDuration(totalOnlineSec)}.`;
    } else {
      summary += '.';
    }

    // Add most active contact
    if (activeContacts.length > 0) {
      const mostActive = activeContacts.reduce((max, contact) => {
        const contactTotal = contact.sessions.reduce((sum, s) => sum + (s.durationSec || 0), 0);
        const maxTotal = max.sessions.reduce((sum, s) => sum + (s.durationSec || 0), 0);
        return contactTotal > maxTotal ? contact : max;
      });

      summary += ` ${mostActive.name} was the most active with ${this.formatDuration(
        mostActive.sessions.reduce((sum, s) => sum + (s.durationSec || 0), 0)
      )} online.`;
    }

    return { summary, activeContacts: activeContacts.length, totalSessions, totalOnlineSec };
  }
}

module.exports = InsightSummaryService;
