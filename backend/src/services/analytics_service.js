const prisma = require('../prisma');

class AnalyticsService {
  constructor() {
    this.prisma = prisma;
  }

  /**
   * Create or update online sessions from status change logs.
   * Sessions are keyed by the log entry that started the online period.
   */
  async createSessionsFromLogs(contactId, startDate, endDate) {
    const boundaryLog = await this.prisma.lastSeenLog.findFirst({
      where: {
        contactId,
        checkedAt: { lt: startDate },
      },
      orderBy: { checkedAt: 'desc' },
    });

    const logs = await this.prisma.lastSeenLog.findMany({
      where: {
        contactId,
        checkedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { checkedAt: 'asc' },
    });

    const timeline = boundaryLog ? [boundaryLog, ...logs] : logs;
    const computedSessions = this.buildSessionsFromLogs(contactId, timeline);

    if (computedSessions.length === 0) {
      return [];
    }

    const existingSessions = await this.prisma.onlineSession.findMany({
      where: {
        contactId,
        logId: { in: computedSessions.map((session) => session.logId) },
      },
    });

    const existingByLogId = new Map(
      existingSessions.map((session) => [session.logId, session])
    );

    const persistedSessions = [];

    for (const session of computedSessions) {
      const existing = existingByLogId.get(session.logId);

      if (!existing) {
        const created = await this.prisma.onlineSession.create({
          data: session,
        });
        persistedSessions.push(created);
        continue;
      }

      if (!this.hasSessionChanged(existing, session)) {
        persistedSessions.push(existing);
        continue;
      }

      const updated = await this.prisma.onlineSession.update({
        where: { id: existing.id },
        data: {
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          durationSec: session.durationSec,
        },
      });

      persistedSessions.push(updated);
    }

    return persistedSessions;
  }

  buildSessionsFromLogs(contactId, logs) {
    const sessions = [];
    let currentSession = null;

    for (const log of logs) {
      if (log.status === 'online' && !currentSession) {
        currentSession = {
          contactId,
          logId: log.id,
          startedAt: log.checkedAt,
          endedAt: null,
          durationSec: null,
        };
        continue;
      }

      if (log.status !== 'online' && currentSession) {
        const endedAt = log.checkedAt;
        sessions.push({
          ...currentSession,
          endedAt,
          durationSec: Math.floor((endedAt - currentSession.startedAt) / 1000),
        });
        currentSession = null;
      }
    }

    if (currentSession) {
      sessions.push(currentSession);
    }

    return sessions;
  }

  hasSessionChanged(existingSession, nextSession) {
    return !(
      this.sameTime(existingSession.startedAt, nextSession.startedAt) &&
      this.sameTime(existingSession.endedAt, nextSession.endedAt) &&
      existingSession.durationSec === nextSession.durationSec
    );
  }

  sameTime(left, right) {
    if (!left && !right) {
      return true;
    }

    if (!left || !right) {
      return false;
    }

    return left.getTime() === right.getTime();
  }

  /**
   * Detect overlapping sessions between all contacts.
   * Kept for backwards compatibility with existing callers.
   */
  async detectSessionOverlaps(startDate, endDate) {
    const sessions = await this.prisma.onlineSession.findMany({
      where: {
        startedAt: { lt: endDate },
        OR: [{ endedAt: { gt: startDate } }, { endedAt: null }],
      },
      include: {
        contact: true,
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    });

    const overlaps = this.buildPairOverlapRows(sessions, startDate, endDate);
    await this.savePairOverlaps(overlaps);
    return overlaps;
  }

  async detectUserOverlaps(userId, startDate, endDate) {
    const sessions = await this.getUserSessions(userId, startDate, endDate);
    const overlaps = this.buildPairOverlapRows(sessions, startDate, endDate);
    await this.savePairOverlaps(overlaps);

    const exactSegments = this.buildExactOverlapSegments(sessions, startDate, endDate);

    return {
      overlaps,
      pairStats: this.aggregatePairOverlapStats(overlaps),
      groupWindows: exactSegments.filter((segment) => segment.groupSize >= 3),
      groupOverlaps: this.aggregateGroupOverlapStats(exactSegments, 3),
      maxGroupSize: this.getMaxGroupSize(exactSegments),
    };
  }

  async getUserSessions(userId, startDate, endDate) {
    const contacts = await this.prisma.contact.findMany({
      where: { userId },
      include: {
        sessions: {
          where: {
            startedAt: { lt: endDate },
            OR: [{ endedAt: { gt: startDate } }, { endedAt: null }],
          },
          orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    return contacts.flatMap((contact) =>
      contact.sessions.map((session) => ({
        ...session,
        contact: {
          id: contact.id,
          name: contact.name,
        },
      }))
    );
  }

  buildPairOverlapRows(sessions, startDate, endDate) {
    const overlaps = [];

    for (let i = 0; i < sessions.length; i += 1) {
      for (let j = i + 1; j < sessions.length; j += 1) {
        let session1 = sessions[i];
        let session2 = sessions[j];

        if (session1.contactId === session2.contactId) {
          continue;
        }

        if (session1.id > session2.id) {
          [session1, session2] = [session2, session1];
        }

        const overlap = this.calculateOverlap(session1, session2, startDate, endDate);
        if (!overlap) {
          continue;
        }

        overlaps.push({
          session1Id: session1.id,
          session2Id: session2.id,
          session1ContactId: session1.contact.id,
          session1ContactName: session1.contact.name,
          session2ContactId: session2.contact.id,
          session2ContactName: session2.contact.name,
          startedAt: overlap.start,
          endedAt: overlap.end,
          durationSec: Math.floor((overlap.end - overlap.start) / 1000),
        });
      }
    }

    return overlaps;
  }

  async savePairOverlaps(overlaps) {
    if (overlaps.length === 0) {
      return;
    }

    const sessionIds = [...new Set(overlaps.flatMap((overlap) => [
      overlap.session1Id,
      overlap.session2Id,
    ]))];
    const minStartedAt = overlaps.reduce(
      (min, overlap) =>
        overlap.startedAt < min ? overlap.startedAt : min,
      overlaps[0].startedAt
    );
    const maxEndedAt = overlaps.reduce(
      (max, overlap) =>
        overlap.endedAt > max ? overlap.endedAt : max,
      overlaps[0].endedAt
    );

    const existing = await this.prisma.sessionOverlap.findMany({
      where: {
        startedAt: { gte: minStartedAt, lte: maxEndedAt },
        OR: [
          { session1Id: { in: sessionIds } },
          { session2Id: { in: sessionIds } },
        ],
      },
    });

    const existingKeys = new Set(existing.map((overlap) => this.getStoredOverlapKey(overlap)));
    const newOverlaps = overlaps.filter(
      (overlap) => !existingKeys.has(this.getStoredOverlapKey(overlap))
    );

    if (newOverlaps.length === 0) {
      return;
    }

    await this.prisma.sessionOverlap.createMany({
      data: newOverlaps.map((overlap) => ({
        session1Id: overlap.session1Id,
        session2Id: overlap.session2Id,
        startedAt: overlap.startedAt,
        endedAt: overlap.endedAt,
        durationSec: overlap.durationSec,
      })),
    });
  }

  getStoredOverlapKey(overlap) {
    return [
      overlap.session1Id,
      overlap.session2Id,
      overlap.startedAt.toISOString(),
      overlap.endedAt ? overlap.endedAt.toISOString() : 'null',
    ].join('|');
  }

  buildExactOverlapSegments(sessions, startDate, endDate) {
    const eventBuckets = new Map();

    for (const session of sessions) {
      const clippedRange = this.getClippedSessionRange(session, startDate, endDate);
      if (!clippedRange) {
        continue;
      }

      this.addOverlapEvent(eventBuckets, clippedRange.start.getTime(), 'ends', null);
      this.addOverlapEvent(eventBuckets, clippedRange.start.getTime(), 'starts', {
        contactId: session.contact.id,
        contactName: session.contact.name,
      });
      this.addOverlapEvent(eventBuckets, clippedRange.end.getTime(), 'ends', {
        contactId: session.contact.id,
        contactName: session.contact.name,
      });
      this.addOverlapEvent(eventBuckets, clippedRange.end.getTime(), 'starts', null);
    }

    const times = [...eventBuckets.keys()].sort((left, right) => left - right);
    const activeCounts = new Map();
    const activeContacts = new Map();
    const rawSegments = [];

    for (let index = 0; index < times.length; index += 1) {
      const time = times[index];
      const bucket = eventBuckets.get(time);

      for (const event of bucket.ends) {
        if (!event) {
          continue;
        }

        const nextCount = (activeCounts.get(event.contactId) || 0) - 1;
        if (nextCount <= 0) {
          activeCounts.delete(event.contactId);
          activeContacts.delete(event.contactId);
        } else {
          activeCounts.set(event.contactId, nextCount);
        }
      }

      for (const event of bucket.starts) {
        if (!event) {
          continue;
        }

        const nextCount = (activeCounts.get(event.contactId) || 0) + 1;
        activeCounts.set(event.contactId, nextCount);
        activeContacts.set(event.contactId, {
          id: event.contactId,
          name: event.contactName,
        });
      }

      const nextTime = times[index + 1];
      if (!nextTime || nextTime <= time || activeContacts.size < 2) {
        continue;
      }

      const durationSec = Math.floor((nextTime - time) / 1000);
      if (durationSec <= 0) {
        continue;
      }

      const contacts = [...activeContacts.values()].sort((left, right) => {
        if (left.name === right.name) {
          return left.id - right.id;
        }
        return left.name.localeCompare(right.name);
      });

      rawSegments.push({
        key: contacts.map((contact) => contact.id).join(':'),
        contacts,
        contactIds: contacts.map((contact) => contact.id),
        groupSize: contacts.length,
        startedAt: new Date(time),
        endedAt: new Date(nextTime),
        durationSec,
      });
    }

    return this.mergeContiguousSegments(rawSegments);
  }

  addOverlapEvent(eventBuckets, time, bucketName, payload) {
    if (!eventBuckets.has(time)) {
      eventBuckets.set(time, { starts: [], ends: [] });
    }

    eventBuckets.get(time)[bucketName].push(payload);
  }

  mergeContiguousSegments(segments) {
    if (segments.length === 0) {
      return [];
    }

    const merged = [];

    for (const segment of segments) {
      const last = merged[merged.length - 1];

      if (
        last &&
        last.key === segment.key &&
        last.endedAt.getTime() === segment.startedAt.getTime()
      ) {
        last.endedAt = segment.endedAt;
        last.durationSec += segment.durationSec;
        continue;
      }

      merged.push({
        ...segment,
        contacts: [...segment.contacts],
        contactIds: [...segment.contactIds],
      });
    }

    return merged;
  }

  aggregatePairOverlapStats(overlaps) {
    const stats = new Map();

    for (const overlap of overlaps) {
      const contacts = [
        { id: overlap.session1ContactId, name: overlap.session1ContactName },
        { id: overlap.session2ContactId, name: overlap.session2ContactName },
      ].sort((left, right) => {
        if (left.name === right.name) {
          return left.id - right.id;
        }
        return left.name.localeCompare(right.name);
      });
      const key = contacts.map((contact) => contact.id).join(':');

      if (!stats.has(key)) {
        stats.set(key, {
          pair: contacts.map((contact) => contact.name).join(' + '),
          contactIds: contacts.map((contact) => contact.id),
          contacts: contacts.map((contact) => contact.name),
          durationSec: 0,
          count: 0,
        });
      }

      const entry = stats.get(key);
      entry.durationSec += overlap.durationSec || 0;
      entry.count += 1;
    }

    return [...stats.values()].sort((left, right) => {
      if (right.durationSec === left.durationSec) {
        return right.count - left.count;
      }
      return right.durationSec - left.durationSec;
    });
  }

  aggregateGroupOverlapStats(segments, minimumGroupSize = 3) {
    const stats = new Map();

    for (const segment of segments) {
      if (segment.groupSize < minimumGroupSize) {
        continue;
      }

      if (!stats.has(segment.key)) {
        stats.set(segment.key, {
          contacts: segment.contacts.map((contact) => contact.name),
          contactIds: [...segment.contactIds],
          groupSize: segment.groupSize,
          durationSec: 0,
          count: 0,
        });
      }

      const entry = stats.get(segment.key);
      entry.durationSec += segment.durationSec;
      entry.count += 1;
    }

    return [...stats.values()].sort((left, right) => {
      if (right.durationSec === left.durationSec) {
        return right.groupSize - left.groupSize;
      }
      return right.durationSec - left.durationSec;
    });
  }

  getMaxGroupSize(segments) {
    return segments.reduce(
      (maxSize, segment) => Math.max(maxSize, segment.groupSize),
      0
    );
  }

  /**
   * Calculate time overlap between two sessions.
   */
  calculateOverlap(session1, session2, startDate, endDate) {
    const range1 = this.getClippedSessionRange(session1, startDate, endDate);
    const range2 = this.getClippedSessionRange(session2, startDate, endDate);

    if (!range1 || !range2) {
      return null;
    }

    const overlapStart = new Date(
      Math.max(range1.start.getTime(), range2.start.getTime())
    );
    const overlapEnd = new Date(
      Math.min(range1.end.getTime(), range2.end.getTime())
    );

    if (overlapStart < overlapEnd) {
      return { start: overlapStart, end: overlapEnd };
    }

    return null;
  }

  getClippedSessionRange(session, startDate, endDate) {
    const effectiveStart = new Date(
      Math.max(session.startedAt.getTime(), startDate.getTime())
    );
    const rawEnd = session.endedAt || new Date();
    const effectiveEnd = new Date(
      Math.min(rawEnd.getTime(), endDate.getTime())
    );

    if (effectiveStart >= effectiveEnd) {
      return null;
    }

    return { start: effectiveStart, end: effectiveEnd };
  }

  getSessionDurationInRange(session, startDate, endDate) {
    const clippedRange = this.getClippedSessionRange(session, startDate, endDate);
    if (!clippedRange) {
      return 0;
    }

    return Math.floor((clippedRange.end - clippedRange.start) / 1000);
  }

  addDurationToDailyStats(dailyStats, rangeStart, rangeEnd) {
    let cursor = new Date(rangeStart);

    while (cursor < rangeEnd) {
      const dayKey = cursor.toISOString().split('T')[0];
      const nextDay = new Date(cursor);
      nextDay.setUTCHours(24, 0, 0, 0);
      const sliceEnd = nextDay < rangeEnd ? nextDay : rangeEnd;
      const durationSec = Math.floor((sliceEnd - cursor) / 1000);

      if (!dailyStats[dayKey]) {
        dailyStats[dayKey] = { durationSec: 0, sessionCount: 0 };
      }

      dailyStats[dayKey].durationSec += durationSec;
      dailyStats[dayKey].sessionCount += 1;
      cursor = sliceEnd;
    }
  }

  /**
   * Generate weekly analytics report.
   */
  async generateWeeklyReport(userId, weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const contacts = await this.prisma.contact.findMany({
      where: { userId },
      include: {
        sessions: {
          where: {
            startedAt: { lt: weekEnd },
            OR: [{ endedAt: { gt: weekStart } }, { endedAt: null }],
          },
          orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    let totalOnlineSec = 0;
    const contactStats = [];
    const sessions = [];

    for (const contact of contacts) {
      let contactTotalSec = 0;

      for (const session of contact.sessions) {
        contactTotalSec += this.getSessionDurationInRange(
          session,
          weekStart,
          weekEnd
        );
        sessions.push({
          ...session,
          contact: {
            id: contact.id,
            name: contact.name,
          },
        });
      }

      totalOnlineSec += contactTotalSec;

      contactStats.push({
        contactId: contact.id,
        name: contact.name,
        totalOnlineSec: contactTotalSec,
        sessionCount: contact.sessions.length,
      });
    }

    const pairOverlaps = this.buildPairOverlapRows(sessions, weekStart, weekEnd);
    const exactSegments = this.buildExactOverlapSegments(sessions, weekStart, weekEnd);
    const totalSessionCount = contactStats.reduce(
      (sum, contact) => sum + contact.sessionCount,
      0
    );

    contactStats.sort((left, right) => right.totalOnlineSec - left.totalOnlineSec);

    const reportData = {
      topContacts: contactStats.slice(0, 10),
      totalContacts: contacts.length,
      overlaps: this.aggregatePairOverlapStats(pairOverlaps).slice(0, 10),
      groupOverlaps: this.aggregateGroupOverlapStats(exactSegments, 3).slice(0, 10),
      averageSessionDuration:
        totalSessionCount > 0 ? Math.floor(totalOnlineSec / totalSessionCount) : 0,
      maxGroupSize: this.getMaxGroupSize(exactSegments),
    };

    const report = await this.prisma.weeklyReport.upsert({
      where: {
        userId_weekStart: {
          userId,
          weekStart,
        },
      },
      update: {
        weekEnd,
        totalOnlineSec,
        reportData: JSON.stringify(reportData),
      },
      create: {
        userId,
        weekStart,
        weekEnd,
        totalOnlineSec,
        reportData: JSON.stringify(reportData),
      },
    });

    return report;
  }

  /**
   * Get contact analytics for a time period.
   */
  async getContactAnalytics(contactId, startDate, endDate) {
    const sessions = await this.prisma.onlineSession.findMany({
      where: {
        contactId,
        startedAt: { lt: endDate },
        OR: [{ endedAt: { gt: startDate } }, { endedAt: null }],
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    });

    let totalOnlineSec = 0;
    const dailyStats = {};

    for (const session of sessions) {
      const clippedRange = this.getClippedSessionRange(session, startDate, endDate);
      if (!clippedRange) {
        continue;
      }

      totalOnlineSec += Math.floor((clippedRange.end - clippedRange.start) / 1000);
      this.addDurationToDailyStats(dailyStats, clippedRange.start, clippedRange.end);
    }

    const averageSessionSec =
      sessions.length > 0 ? Math.floor(totalOnlineSec / sessions.length) : 0;

    return {
      totalOnlineSec,
      averageSessionSec,
      sessionCount: sessions.length,
      dailyStats,
      sessions: sessions.map((session) => ({
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationSec: this.getSessionDurationInRange(session, startDate, endDate),
      })),
    };
  }
}

module.exports = AnalyticsService;
