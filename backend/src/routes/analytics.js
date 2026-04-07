const express = require('express');
const router = express.Router();
const AnalyticsService = require('../services/analytics_service');
const auth = require('../middleware/auth');

const analytics = new AnalyticsService();

/**
 * GET /api/analytics/contact/:id
 * Get analytics for a specific contact
 * Query params: startDate, endDate (ISO strings)
 */
router.get('/contact/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Verify contact belongs to user
    const contact = await analytics.prisma.contact.findFirst({
      where: { id: parseInt(id), userId: req.user.id },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const analyticsData = await analytics.getContactAnalytics(
      parseInt(id),
      start,
      end
    );

    res.json(analyticsData);
  } catch (error) {
    console.error('[Analytics] Contact analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/analytics/sessions/:contactId
 * Manually trigger session creation for a contact
 */
router.post('/sessions/:contactId', auth, async (req, res) => {
  try {
    const { contactId } = req.params;
    const { startDate, endDate } = req.body;

    // Verify contact belongs to user
    const contact = await analytics.prisma.contact.findFirst({
      where: { id: parseInt(contactId), userId: req.user.id },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const start = new Date(startDate || Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = new Date(endDate || Date.now());

    const sessions = await analytics.createSessionsFromLogs(
      parseInt(contactId),
      start,
      end
    );

    res.json({ created: sessions.length, sessions });
  } catch (error) {
    console.error('[Analytics] Session creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/analytics/overlaps
 * Detect overlapping sessions between contacts
 */
router.post('/overlaps', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    const start = new Date(startDate || Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = new Date(endDate || Date.now());
    const overlapData = await analytics.detectUserOverlaps(req.user.id, start, end);

    res.json({
      detected: overlapData.overlaps.length,
      overlaps: overlapData.overlaps.map((overlap) => ({
        session1Id: overlap.session1Id,
        session2Id: overlap.session2Id,
        startedAt: overlap.startedAt,
        endedAt: overlap.endedAt,
        durationSec: overlap.durationSec,
      })),
      pairStats: overlapData.pairStats,
      groupOverlaps: overlapData.groupOverlaps,
      groupsDetected: overlapData.groupOverlaps.length,
      maxGroupSize: overlapData.maxGroupSize,
    });
  } catch (error) {
    console.error('[Analytics] Overlap detection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/weekly
 * Get weekly reports for the user
 */
router.get('/weekly', auth, async (req, res) => {
  try {
    const { weeks } = req.query; // Number of weeks to fetch (default: 4)
    const weekCount = parseInt(weeks) || 4;

    const reports = await analytics.prisma.weeklyReport.findMany({
      where: { userId: req.user.id },
      orderBy: { weekStart: 'desc' },
      take: weekCount,
    });

    // Parse JSON report data
    const parsedReports = reports.map(report => ({
      ...report,
      reportData: JSON.parse(report.reportData),
    }));

    res.json(parsedReports);
  } catch (error) {
    console.error('[Analytics] Weekly reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/analytics/weekly/generate
 * Generate weekly report for a specific week
 */
router.post('/weekly/generate', auth, async (req, res) => {
  try {
    const { weekStart } = req.body;

    if (!weekStart) {
      return res.status(400).json({ error: 'weekStart required' });
    }

    const weekDate = new Date(weekStart);
    if (isNaN(weekDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const report = await analytics.generateWeeklyReport(req.user.id, weekDate);
    res.json({ ...report, reportData: JSON.parse(report.reportData) });
  } catch (error) {
    console.error('[Analytics] Weekly report generation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
