const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { appConfig } = require('../config');

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Invalid token format' });

  try {
    const decoded = jwt.verify(token, appConfig.jwtSecret);
    req.userId = decoded.userId;
    req.user = { id: decoded.userId };
    req.prisma = prisma;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
