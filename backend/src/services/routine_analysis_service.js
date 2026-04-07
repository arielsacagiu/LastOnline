const prisma = require('../prisma');

class RoutineAnalysisService {
  constructor() {
    this.prisma = prisma;
  }

  /**
   * Analyze and update routine baselines for a contact
   */
  async analyzeContactRoutine(contactId, daysToAnalyze = 30) {
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - daysToAnalyze);

    // Get sessions for the analysis period
    const sessions = await this.prisma.onlineSession.findMany({
      where: {
        contactId,
        startedAt: { gte: startDate, lt: endDate },
      },
      orderBy: { startedAt: 'asc' },
    });

    if (sessions.length === 0) {
      console.log(`[Routine] No sessions found for contact ${contactId}`);
      return null;
    }

    // Group sessions by weekday
    const sessionsByWeekday = new Array(7).fill(null).map(() => []);
    
    for (const session of sessions) {
      const weekDay = session.startedAt.getDay(); // 0 = Sunday
      sessionsByWeekday[weekDay].push(session);
    }

    const routines = [];
    
    // Analyze each weekday separately
    for (let weekDay = 0; weekDay < 7; weekDay++) {
      const daySessions = sessionsByWeekday[weekDay];
      if (daySessions.length === 0) continue;

      const routine = await this.analyzeWeekdayRoutine(contactId, weekDay, daySessions);
      if (routine) {
        routines.push(routine);
      }
    }

    return routines;
  }

  /**
   * Analyze routine for a specific weekday
   */
  async analyzeWeekdayRoutine(contactId, weekDay, sessions) {
    if (sessions.length < 3) {
      // Not enough data for reliable baseline
      return null;
    }

    // Extract hourly activity patterns
    const hourlyActivity = new Array(24).fill(0);
    const wakeHours = [];
    const sleepHours = [];
    let totalOnlineSec = 0;
    let totalSessions = sessions.length;

    for (const session of sessions) {
      const startHour = session.startedAt.getHours();
      const endHour = session.endedAt ? session.endedAt.getHours() : startHour;
      
      // Mark activity hours
      for (let hour = startHour; hour <= endHour; hour++) {
        const normalizedHour = hour % 24;
        hourlyActivity[normalizedHour] += 1;
      }

      totalOnlineSec += session.durationSec || 0;

      // Potential wake time (first online of the day)
      if (startHour >= 5 && startHour <= 11) { // Reasonable wake hours
        wakeHours.push(startHour);
      }

      // Potential sleep time (last online of the day)
      if (endHour >= 20 || endHour <= 2) { // Reasonable sleep hours
        sleepHours.push(endHour);
      }
    }

    // Calculate peak activity window
    const peakWindow = this.findPeakActivityWindow(hourlyActivity);
    
    // Calculate typical wake and sleep times
    const typicalWakeHour = this.calculateTypicalHour(wakeHours);
    const typicalSleepHour = this.calculateTypicalHour(sleepHours);

    // Calculate confidence based on data consistency
    const confidence = this.calculateConfidence(hourlyActivity, sessions.length);

    // Create or update routine record
    const routineData = {
      typicalWakeHour,
      typicalSleepHour,
      peakStartHour: peakWindow.start,
      peakEndHour: peakWindow.end,
      avgOnlineSec: totalOnlineSec / sessions.length,
      sessionCount: totalSessions / this.getUniqueDaysCount(sessions),
      confidence,
      sampleDays: this.getUniqueDaysCount(sessions),
    };

    return await this.prisma.contactRoutine.upsert({
      where: {
        contactId_weekDay: {
          contactId,
          weekDay,
        },
      },
      update: routineData,
      create: {
        contactId,
        weekDay,
        ...routineData,
      },
    });
  }

  /**
   * Find the peak activity window (3-hour window with most activity)
   */
  findPeakActivityWindow(hourlyActivity) {
    let maxActivity = 0;
    let bestStart = 0;
    let bestEnd = 2;

    // Check all 3-hour windows
    for (let start = 0; start < 24; start++) {
      const end = (start + 2) % 24; // 3-hour window inclusive
      let windowActivity = 0;

      for (let hour = start; hour <= end; hour++) {
        const normalizedHour = hour % 24;
        windowActivity += hourlyActivity[normalizedHour];
      }

      if (windowActivity > maxActivity) {
        maxActivity = windowActivity;
        bestStart = start;
        bestEnd = end;
      }
    }

    return { start: bestStart, end: bestEnd };
  }

  /**
   * Calculate typical hour from array of hour observations
   */
  calculateTypicalHour(hours) {
    if (hours.length === 0) return null;

    // Use median for robustness
    const sorted = [...hours].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      // Even number of values - average middle two
      return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    } else {
      // Odd number of values - take middle
      return sorted[mid];
    }
  }

  /**
   * Calculate confidence score based on data consistency
   */
  calculateConfidence(hourlyActivity, sessionCount) {
    let confidence = 0.5; // Base confidence

    // More sessions = higher confidence
    if (sessionCount >= 10) confidence += 0.2;
    else if (sessionCount >= 5) confidence += 0.1;

    // Check for consistent patterns (not too scattered)
    const activeHours = hourlyActivity.filter(count => count > 0).length;
    if (activeHours <= 8) confidence += 0.2; // Focused activity
    else if (activeHours <= 12) confidence += 0.1; // Moderately focused

    // Check for clear peak (not flat distribution)
    const maxActivity = Math.max(...hourlyActivity);
    const avgActivity = hourlyActivity.reduce((sum, count) => sum + count, 0) / 24;
    if (maxActivity > avgActivity * 2) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  /**
   * Count unique days from sessions
   */
  getUniqueDaysCount(sessions) {
    const uniqueDays = new Set();
    for (const session of sessions) {
      const dateStr = session.startedAt.toISOString().split('T')[0];
      uniqueDays.add(dateStr);
    }
    return uniqueDays.size;
  }

  /**
   * Get routine baseline for a contact
   */
  async getContactRoutine(contactId) {
    return await this.prisma.contactRoutine.findMany({
      where: { contactId },
      orderBy: { weekDay: 'asc' },
    });
  }

  /**
   * Get routine for current weekday
   */
  async getCurrentDayRoutine(contactId) {
    const currentWeekDay = new Date().getDay();
    return await this.prisma.contactRoutine.findUnique({
      where: {
        contactId_weekDay: {
          contactId,
          weekDay: currentWeekDay,
        },
      },
    });
  }

  /**
   * Compare current activity to routine baseline
   */
  async analyzeRoutineDeviation(contactId, currentSessions) {
    const routine = await this.getCurrentDayRoutine(contactId);
    if (!routine || routine.confidence < 0.5) {
      return { deviation: 'insufficient_data', routine: null };
    }

    const deviations = [];

    // Check wake time deviation
    if (routine.typicalWakeHour && currentSessions.length > 0) {
      const firstSession = currentSessions[0];
      const currentWakeHour = firstSession.startedAt.getHours();
      const wakeDeviation = Math.abs(currentWakeHour - routine.typicalWakeHour);
      
      if (wakeDeviation > 2) { // More than 2 hours deviation
        deviations.push({
          type: 'wake_time',
          severity: wakeDeviation > 4 ? 'high' : 'medium',
          current: currentWakeHour,
          typical: routine.typicalWakeHour,
          deviation: wakeDeviation,
        });
      }
    }

    // Check sleep time deviation
    if (routine.typicalSleepHour && currentSessions.length > 0) {
      const lastSession = currentSessions[currentSessions.length - 1];
      const currentSleepHour = lastSession.endedAt 
        ? lastSession.endedAt.getHours() 
        : lastSession.startedAt.getHours();
      const sleepDeviation = Math.abs(currentSleepHour - routine.typicalSleepHour);
      
      if (sleepDeviation > 2) { // More than 2 hours deviation
        deviations.push({
          type: 'sleep_time',
          severity: sleepDeviation > 4 ? 'high' : 'medium',
          current: currentSleepHour,
          typical: routine.typicalSleepHour,
          deviation: sleepDeviation,
        });
      }
    }

    // Check activity level deviation
    if (routine.avgOnlineSec && currentSessions.length > 0) {
      const currentTotalSec = currentSessions.reduce((sum, s) => sum + (s.durationSec || 0), 0);
      const currentAvgSec = currentTotalSec / currentSessions.length;
      const deviationFactor = currentAvgSec / routine.avgOnlineSec;
      
      if (deviationFactor > 2 || deviationFactor < 0.5) {
        deviations.push({
          type: 'activity_level',
          severity: deviationFactor > 3 || deviationFactor < 0.3 ? 'high' : 'medium',
          current: currentAvgSec,
          typical: routine.avgOnlineSec,
          factor: deviationFactor,
        });
      }
    }

    return {
      deviation: deviations.length > 0 ? 'detected' : 'normal',
      routine,
      deviations,
    };
  }

  /**
   * Update routines for all contacts of a user
   */
  async updateUserRoutines(userId) {
    const contacts = await this.prisma.contact.findMany({
      where: { userId },
    });

    const results = [];
    
    for (const contact of contacts) {
      try {
        const routines = await this.analyzeContactRoutine(contact.id);
        results.push({
          contactId: contact.id,
          contactName: contact.name,
          routines: routines || [],
          success: true,
        });
      } catch (error) {
        console.error(`[Routine] Error analyzing routines for contact ${contact.id}:`, error);
        results.push({
          contactId: contact.id,
          contactName: contact.name,
          error: error.message,
          success: false,
        });
      }
    }

    return results;
  }

  /**
   * Get routine summary for reporting
   */
  async getRoutineSummary(contactId) {
    const routines = await this.getContactRoutine(contactId);
    if (routines.length === 0) {
      return null;
    }

    // Calculate overall patterns
    const wakeHours = routines.filter(r => r.typicalWakeHour).map(r => r.typicalWakeHour);
    const sleepHours = routines.filter(r => r.typicalSleepHour).map(r => r.typicalSleepHour);
    const avgConfidence = routines.reduce((sum, r) => sum + r.confidence, 0) / routines.length;
    
    const overallWakeHour = this.calculateTypicalHour(wakeHours);
    const overallSleepHour = this.calculateTypicalHour(sleepHours);

    // Find most common peak window
    const peakWindows = routines
      .filter(r => r.peakStartHour !== null && r.peakEndHour !== null)
      .map(r => `${r.peakStartHour}-${r.peakEndHour}`);
    
    const peakWindowCounts = new Map();
    for (const window of peakWindows) {
      peakWindowCounts.set(window, (peakWindowCounts.get(window) || 0) + 1);
    }
    
    const mostCommonPeakWindow = peakWindows.length > 0
      ? [...peakWindowCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;

    return {
      overallWakeHour,
      overallSleepHour,
      mostCommonPeakWindow,
      avgConfidence,
      routineCount: routines.length,
      weekdaysWithRoutines: routines.map(r => r.weekDay),
      details: routines,
    };
  }
}

module.exports = RoutineAnalysisService;
