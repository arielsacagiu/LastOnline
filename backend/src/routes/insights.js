const express = require('express');
const router = express.Router();
const RoutineAnalysisService = require('../services/routine_analysis_service');
const InsightSummaryService = require('../services/insight_summary_service');
const auth = require('../middleware/auth');

const routineAnalysis = new RoutineAnalysisService();
const insightSummary = new InsightSummaryService();

/**
 * GET /api/insights/routine/:contactId
 * Get routine baseline for a specific contact
 */
router.get('/routine/:contactId', auth, async (req, res) => {
  try {
    const { contactId } = req.params;
    
    // Verify contact belongs to user
    const contact = await req.prisma.contact.findFirst({
      where: { 
        id: parseInt(contactId),
        userId: req.user.id 
      },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const routine = await routineAnalysis.getContactRoutine(parseInt(contactId));
    const summary = await routineAnalysis.getRoutineSummary(parseInt(contactId));

    res.json({
      routine,
      summary,
      confidence: summary?.avgConfidence || 0,
    });
  } catch (error) {
    console.error('[Insights] Routine error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/insights/routine/:contactId/analyze
 * Manually trigger routine analysis for a contact
 */
router.post('/routine/:contactId/analyze', auth, async (req, res) => {
  try {
    const { contactId } = req.params;
    const { days = 30 } = req.body;
    
    // Verify contact belongs to user
    const contact = await req.prisma.contact.findFirst({
      where: { 
        id: parseInt(contactId),
        userId: req.user.id 
      },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const routines = await routineAnalysis.analyzeContactRoutine(
      parseInt(contactId), 
      parseInt(days)
    );

    res.json({
      success: true,
      routinesAnalyzed: routines?.length || 0,
      routines,
    });
  } catch (error) {
    console.error('[Insights] Analyze routine error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/insights/weekly/:weekStart
 * Get weekly insights summary
 */
router.get('/weekly/:weekStart', auth, async (req, res) => {
  try {
    const { weekStart } = req.params;
    const startDate = new Date(weekStart);
    
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const summary = await insightSummary.generateWeeklySummary(req.user.id, startDate);
    res.json(summary);
  } catch (error) {
    console.error('[Insights] Weekly summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/insights/daily/:date
 * Get daily insights summary
 */
router.get('/daily/:date', auth, async (req, res) => {
  try {
    const { date } = req.params;
    const targetDate = new Date(date);
    
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const summary = await insightSummary.generateDailySummary(req.user.id, targetDate);
    res.json(summary);
  } catch (error) {
    console.error('[Insights] Daily summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/insights/anomaly/:anomalyId/explain
 * Get detailed explanation for an anomaly
 */
router.get('/anomaly/:anomalyId/explain', auth, async (req, res) => {
  try {
    const { anomalyId } = req.params;
    
    // Verify anomaly belongs to user
    const anomaly = await req.prisma.anomalyEvent.findFirst({
      where: { 
        id: parseInt(anomalyId),
        userId: req.user.id 
      },
    });

    if (!anomaly) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    const explanation = await insightSummary.explainAnomaly(parseInt(anomalyId));
    res.json(explanation);
  } catch (error) {
    console.error('[Insights] Explain anomaly error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/insights/routine/:contactId/deviation
 * Analyze current activity deviation from routine
 */
router.get('/routine/:contactId/deviation', auth, async (req, res) => {
  try {
    const { contactId } = req.params;
    
    // Verify contact belongs to user
    const contact = await req.prisma.contact.findFirst({
      where: { 
        id: parseInt(contactId),
        userId: req.user.id 
      },
      include: {
        sessions: {
          where: {
            startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
          },
          orderBy: { startedAt: 'asc' },
        },
      },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const deviation = await routineAnalysis.analyzeRoutineDeviation(
      parseInt(contactId), 
      contact.sessions
    );

    res.json(deviation);
  } catch (error) {
    console.error('[Insights] Routine deviation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/insights/routines/update
 * Update routines for all user contacts
 */
router.post('/routines/update', auth, async (req, res) => {
  try {
    const { days = 30 } = req.body;
    
    const results = await routineAnalysis.updateUserRoutines(req.user.id);
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    res.json({
      success: true,
      contactsProcessed: results.length,
      successCount,
      failureCount,
      results,
    });
  } catch (error) {
    console.error('[Insights] Update routines error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/insights/confidence/:contactId
 * Get confidence assessment for contact data
 */
router.get('/confidence/:contactId', auth, async (req, res) => {
  try {
    const { contactId } = req.params;
    
    // Verify contact belongs to user
    const contact = await req.prisma.contact.findFirst({
      where: { 
        id: parseInt(contactId),
        userId: req.user.id 
      },
      include: {
        sessions: {
          where: {
            startedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
          },
        },
      },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const routine = await routineAnalysis.getCurrentDayRoutine(parseInt(contactId));
    const hasGaps = contact.sessions.length < 20; // Simple gap detection
    const sampleSize = contact.sessions.length;
    
    const confidence = routine?.confidence || 0;
    const confidenceLabel = insightSummary.getConfidenceLabel(confidence, hasGaps, sampleSize);

    res.json({
      confidence,
      label: confidenceLabel,
      sampleSize,
      hasGaps,
      routineAvailable: routine !== null,
    });
  } catch (error) {
    console.error('[Insights] Confidence error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/insights/summary/overview
 * Get overview of all insights for user
 */
router.get('/summary/overview', auth, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get basic stats
    const contacts = await req.prisma.contact.findMany({
      where: { userId: req.user.id },
      include: {
        routines: true,
        sessions: {
          where: { startedAt: { gte: startDate } },
        },
      },
    });

    const anomalies = await req.prisma.anomalyEvent.findMany({
      where: {
        userId: req.user.id,
        createdAt: { gte: startDate },
        resolved: false,
      },
    });

    const activeContacts = contacts.filter(c => c.sessions.length > 0);
    const contactsWithRoutines = contacts.filter(c => c.routines.length > 0);
    const highSeverityAnomalies = anomalies.filter(a => a.severity === 'high');

    res.json({
      period: `${days} days`,
      totalContacts: contacts.length,
      activeContacts: activeContacts.length,
      contactsWithRoutines: contactsWithRoutines.length,
      unresolvedAnomalies: anomalies.length,
      highSeverityAnomalies: highSeverityAnomalies.length,
      avgConfidence: contactsWithRoutines.length > 0 
        ? contactsWithRoutines.reduce((sum, c) => {
            const avgConf = c.routines.reduce((rSum, r) => rSum + r.confidence, 0) / c.routines.length;
            return sum + avgConf;
          }, 0) / contactsWithRoutines.length
        : 0,
    });
  } catch (error) {
    console.error('[Insights] Overview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
