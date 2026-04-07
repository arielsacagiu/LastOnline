const express = require('express');
const authMiddleware = require('../middleware/auth');
const { registerClient, unregisterClient } = require('../realtime');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const client = registerClient(req.userId, res);

  req.on('close', () => {
    unregisterClient(req.userId, client);
    res.end();
  });
});

module.exports = router;
