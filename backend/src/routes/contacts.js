const express = require('express');
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');
const { publishContactsChanged } = require('../realtime');
const {
  findDuplicateContactByPhone,
  validateContactPayload,
} = require('../utils/contact_validation');

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        logs: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
        },
      },
    });
    res.json(contacts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const validation = validateContactPayload(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.errors.join('. ') });
    }

    const duplicate = await findDuplicateContactByPhone(
      prisma,
      req.userId,
      validation.normalizedPhone
    );
    if (duplicate) {
      return res.status(409).json({
        error: `A contact with this phone number already exists: ${duplicate.name}`,
      });
    }

    const data = { ...validation.data, userId: req.userId };
    const contact = await prisma.contact.create({ data });
    publishContactsChanged(req.userId, 'created', contact.id);
    res.status(201).json(contact);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact || contact.userId !== req.userId) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    await prisma.contact.delete({ where: { id } });
    publishContactsChanged(req.userId, 'deleted', id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact || contact.userId !== req.userId) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const validation = validateContactPayload(req.body, { partial: true });
    if (!validation.ok) {
      return res.status(400).json({ error: validation.errors.join('. ') });
    }

    if (validation.normalizedPhone) {
      const duplicate = await findDuplicateContactByPhone(
        prisma,
        req.userId,
        validation.normalizedPhone,
        id
      );
      if (duplicate) {
        return res.status(409).json({
          error: `A contact with this phone number already exists: ${duplicate.name}`,
        });
      }
    }

    const data = validation.data;
    const updated = await prisma.contact.update({ where: { id }, data });
    publishContactsChanged(req.userId, 'updated', id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
