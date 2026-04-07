require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const { appConfig, createCorsOptions } = require('./config');
const authRoutes = require('./routes/auth');
const contactRoutes = require('./routes/contacts');
const logsRoutes = require('./routes/logs');
const streamRoutes = require('./routes/stream');
const analyticsRoutes = require('./routes/analytics');
const monitorRoutes = require('./routes/monitor');
const insightsRoutes = require('./routes/insights');
const { startScheduler, shutdown: shutdownScheduler } = require('./scheduler');
const { shutdownScraper } = require('./scraper');

const app = express();
const PORT = appConfig.port;
let shuttingDown = false;

appConfig.validate();

app.disable('x-powered-by');
app.set('trust proxy', appConfig.trustProxy);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors(createCorsOptions(appConfig)));
if (appConfig.enableCompression) {
  app.use(compression());
}
app.use(express.json({ limit: '100kb' }));

app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/insights', insightsRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: appConfig.nodeEnv,
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use((err, req, res, next) => {
  if (!err) {
    next();
    return;
  }

  if (res.headersSent) {
    next(err);
    return;
  }

  if (err.message === 'Origin not allowed by CORS') {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  console.error('[Server] Unhandled request error:', err.message);
  res.status(500).json({ error: 'Server error' });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScheduler();
});

server.on('error', (err) => {
  console.error('[Server] Failed to start:', err.message);
  process.exit(1);
});

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[Server] ${signal} received, shutting down...`);
  await shutdownScheduler().catch((err) => {
    console.error('[Server] Error persisting scheduler data:', err.message);
  });
  await shutdownScraper().catch((err) => {
    console.error('[Server] Error stopping scraper:', err.message);
  });

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
  shutdown('uncaughtException');
});
