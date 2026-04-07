const prisma = require('./prisma');
const {
  checkLastSeen,
  normalizePhoneNumber,
  syncTrackedPhones,
} = require('./scraper');
const { publishPresenceUpdate } = require('./realtime');
const AnalyticsService = require('./services/analytics_service');
const MonitorHealthService = require('./services/monitor_health_service');
const AnomalyDetectionService = require('./services/anomaly_detection_service');
const RoutineAnalysisService = require('./services/routine_analysis_service');
const SessionFileLogger = require('./services/session_file_logger');

const analytics = new AnalyticsService();
const monitorHealth = new MonitorHealthService();
const anomalyDetection = new AnomalyDetectionService();
const routineAnalysis = new RoutineAnalysisService();
const sessionFileLogger = new SessionFileLogger();

const DEFAULT_INTERVAL_MS = 2000;
const MIN_INTERVAL_MS = 2000;
const parsedInterval = Number(process.env.CHECK_INTERVAL_MS);
const INTERVAL_MS = Number.isFinite(parsedInterval) && parsedInterval >= MIN_INTERVAL_MS
  ? parsedInterval
  : DEFAULT_INTERVAL_MS;

let isRunning = false;
let intervalHandle = null;
let lastAnomalyRun = 0;
let lastRoutineRun = 0;
let lastWeeklyReportRun = 0;

const ANOMALY_INTERVAL_MS = 60 * 60 * 1000;       // 1 hour
const ROUTINE_INTERVAL_MS = 12 * 60 * 60 * 1000;   // 12 hours
const WEEKLY_REPORT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function runChecks() {
  if (isRunning) {
    return;
  }

  isRunning = true;
  const startedAt = Date.now();

  try {
    const contacts = await prisma.contact.findMany();
    const contactsByPhone = new Map();
    const userIds = new Set();
    const userOutcomes = new Map();

    for (const contact of contacts) {
      const phoneKey = normalizePhoneNumber(contact.phone);
      if (!phoneKey) continue;

      userIds.add(contact.userId);
      if (!userOutcomes.has(contact.userId)) {
        userOutcomes.set(contact.userId, { successCount: 0, failureCount: 0 });
      }
      const bucket = contactsByPhone.get(phoneKey) || [];
      bucket.push(contact);
      contactsByPhone.set(phoneKey, bucket);
    }

    if (contactsByPhone.size === 0) {
      console.log(`[Scheduler] No contacts to check.`);
      return;
    }

    await syncTrackedPhones(contactsByPhone.keys());
    console.log(
      `[Scheduler] Checking ${contacts.length} contacts across ${contactsByPhone.size} phone(s)...`
    );

    for (const phoneContacts of contactsByPhone.values()) {
      const affectedUserIds = [...new Set(phoneContacts.map((c) => c.userId))];

      try {
        const result = await checkLastSeen(phoneContacts[0].phone);
        const checkedAt = new Date();

        for (const contact of phoneContacts) {
          const hasChanged =
            contact.currentStatus !== result.status ||
            (contact.currentLastSeen ?? null) !== (result.lastSeen ?? null);

          await prisma.contact.update({
            where: { id: contact.id },
            data: {
              currentStatus: result.status,
              currentLastSeen: result.lastSeen,
              lastCheckedAt: checkedAt,
            },
          });

          if (hasChanged) {
            await prisma.lastSeenLog.create({
              data: {
                contactId: contact.id,
                status: result.status,
                lastSeen: result.lastSeen,
                checkedAt,
              },
            });

            if (result.status === 'online' || contact.currentStatus === 'online') {
              try {
                const yesterday = new Date(checkedAt.getTime() - 24 * 60 * 60 * 1000);
                await analytics.createSessionsFromLogs(contact.id, yesterday, checkedAt);
                await sessionFileLogger.writeContactLog(contact.id);
              } catch (err) {
                console.error('[Scheduler] Session logging error:', err.message);
              }
            }
          }

          publishPresenceUpdate(contact.userId, {
            contactId: contact.id,
            status: result.status,
            lastSeen: result.lastSeen,
            checkedAt: checkedAt.toISOString(),
            changed: hasChanged,
          });

          console.log(
            `[Scheduler] ${contact.name} (${contact.phone}): ${result.status} - ${result.lastSeen || result.message} (${hasChanged ? 'changed' : 'same'})`
          );
        }

        for (const userId of affectedUserIds) {
          userOutcomes.get(userId).successCount += 1;
        }
      } catch (err) {
        console.error(`[Scheduler] Error for ${phoneContacts[0].phone}: ${err.message}`);
        for (const userId of affectedUserIds) {
          userOutcomes.get(userId).failureCount += 1;
        }
      }
    }

    // Record monitor health per user
    for (const userId of userIds) {
      const outcome = userOutcomes.get(userId) || { successCount: 0, failureCount: 0 };
      await monitorHealth.recordCheck(userId, outcome.successCount > 0 && outcome.failureCount === 0);
    }

    // Periodic tasks using elapsed-time tracking (reliable)
    const now = Date.now();

    if (now - lastAnomalyRun > ANOMALY_INTERVAL_MS) {
      lastAnomalyRun = now;
      for (const userId of userIds) {
        try {
          await anomalyDetection.detectAnomalies(userId, 7);
          console.log(`[Scheduler] Anomaly detection complete for user ${userId}`);
        } catch (err) {
          console.error('[Scheduler] Anomaly detection error:', err.message);
        }
      }
    }

    if (now - lastRoutineRun > ROUTINE_INTERVAL_MS) {
      lastRoutineRun = now;
      for (const userId of userIds) {
        try {
          await routineAnalysis.updateUserRoutines(userId);
          console.log(`[Scheduler] Routine analysis complete for user ${userId}`);
        } catch (err) {
          console.error('[Scheduler] Routine analysis error:', err.message);
        }
      }
    }

    if (now - lastWeeklyReportRun > WEEKLY_REPORT_INTERVAL_MS) {
      lastWeeklyReportRun = now;
      await generateWeeklyReports(userIds);
    }

  } catch (err) {
    console.error('[Scheduler] Fatal error:', err.message);
  } finally {
    isRunning = false;
    const elapsed = Date.now() - startedAt;
    if (elapsed > 1000) {
      console.log(`[Scheduler] Cycle finished in ${elapsed}ms`);
    }
  }
}

async function generateWeeklyReports(userIds) {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun
  // Only auto-generate on Mondays (day 1) for the previous week
  if (dayOfWeek !== 1) return;

  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  weekStart.setUTCHours(0, 0, 0, 0);
  // Align to Monday
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));

  for (const userId of userIds) {
    try {
      const existing = await prisma.weeklyReport.findFirst({
        where: { userId, weekStart },
      });
      if (existing) continue;

      await analytics.generateWeeklyReport(userId, weekStart);
      console.log(`[Scheduler] Generated weekly report for user ${userId}`);
    } catch (err) {
      console.error('[Scheduler] Weekly report error:', err.message);
    }
  }
}

async function shutdown() {
  console.log('[Scheduler] Shutting down, persisting health data...');
  if (intervalHandle) clearInterval(intervalHandle);
  try {
    await monitorHealth.persistAll();
  } catch (err) {
    console.error('[Scheduler] Shutdown persist error:', err.message);
  }
}

function startScheduler() {
  console.log(
    `[Scheduler] Started. Interval: ${INTERVAL_MS}ms (min: ${MIN_INTERVAL_MS}ms)`
  );
  runChecks();
  intervalHandle = setInterval(runChecks, INTERVAL_MS);
}

module.exports = { startScheduler, shutdown };
