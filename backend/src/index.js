require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

app.use(cors(createCorsOptions(appConfig)));
app.use(express.json({ limit: '100kb' }));

app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/insights', insightsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScheduler();
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
