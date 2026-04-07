const ALLOWED_CIRCLES = new Set(['family', 'friends', 'work', 'other']);
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15;

function normalizePhoneNumber(phoneNumber) {
  return String(phoneNumber || '').replace(/[^0-9]/g, '');
}

function formatPhoneForStorage(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  return normalized ? `+${normalized}` : '';
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function serializeTags(tags) {
  if (tags == null) {
    return undefined;
  }

  if (typeof tags === 'string') {
    const trimmed = tags.trim();
    if (trimmed.length > 1000) {
      throw new Error('Tags must be 1000 characters or fewer');
    }
    return trimmed;
  }

  if (!Array.isArray(tags)) {
    throw new Error('Tags must be a string or array of strings');
  }

  const cleaned = tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean);

  if (cleaned.some((tag) => tag.length > 50)) {
    throw new Error('Each tag must be 50 characters or fewer');
  }

  return JSON.stringify(cleaned.slice(0, 20));
}

function validateContactPayload(payload, { partial = false } = {}) {
  const errors = [];
  const data = {};
  let normalizedPhone;

  if (!partial || payload.name !== undefined) {
    const name = normalizeName(payload.name);
    if (!name) {
      errors.push('Name is required');
    } else if (name.length > 100) {
      errors.push('Name must be 100 characters or fewer');
    } else {
      data.name = name;
    }
  }

  if (!partial || payload.phone !== undefined) {
    normalizedPhone = normalizePhoneNumber(payload.phone);
    if (!normalizedPhone) {
      errors.push('Phone is required');
    } else if (
      normalizedPhone.length < PHONE_MIN_DIGITS ||
      normalizedPhone.length > PHONE_MAX_DIGITS
    ) {
      errors.push('Phone must contain 7-15 digits including country code');
    } else {
      data.phone = formatPhoneForStorage(payload.phone);
    }
  }

  if (!partial || payload.circle !== undefined) {
    if (payload.circle == null || payload.circle === '') {
      data.circle = null;
    } else if (!ALLOWED_CIRCLES.has(payload.circle)) {
      errors.push(`Circle must be one of: ${[...ALLOWED_CIRCLES].join(', ')}`);
    } else {
      data.circle = payload.circle;
    }
  }

  if (!partial || payload.tags !== undefined) {
    try {
      const serializedTags = serializeTags(payload.tags);
      if (serializedTags !== undefined) {
        data.tags = serializedTags;
      } else if (payload.tags === null) {
        data.tags = null;
      }
    } catch (err) {
      errors.push(err.message);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    data,
    normalizedPhone,
  };
}

async function findDuplicateContactByPhone(prisma, userId, normalizedPhone, excludeContactId = null) {
  if (!normalizedPhone) {
    return null;
  }

  const contacts = await prisma.contact.findMany({
    where: {
      userId,
      ...(excludeContactId ? { NOT: { id: excludeContactId } } : {}),
    },
    select: {
      id: true,
      phone: true,
      name: true,
    },
  });

  return contacts.find(
    (contact) => normalizePhoneNumber(contact.phone) === normalizedPhone
  ) || null;
}

module.exports = {
  ALLOWED_CIRCLES,
  formatPhoneForStorage,
  findDuplicateContactByPhone,
  normalizeName,
  normalizePhoneNumber,
  validateContactPayload,
};
