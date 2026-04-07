const express = require('express');
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/:contactId', async (req, res) => {
  try {
    const contactId = parseInt(req.params.contactId);
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact || contact.userId !== req.userId) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.lastSeenLog.findMany({
        where: { contactId },
        orderBy: { checkedAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.lastSeenLog.count({ where: { contactId } }),
    ]);

    res.json({
      logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
