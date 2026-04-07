const fs = require('fs/promises');
const path = require('path');
const prisma = require('../prisma');

const SESSION_LOG_DIR = path.join(__dirname, '..', '..', 'session_logs');
const LOG_TIME_ZONE = process.env.SESSION_LOG_TIMEZONE || 'Asia/Jerusalem';

class SessionFileLogger {
  constructor() {
    this.prisma = prisma;
    this.dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: LOG_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    this.timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: LOG_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    this.timestampFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: LOG_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  async writeContactLog(contactId) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        sessions: {
          orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!contact) {
      return null;
    }

    await fs.mkdir(SESSION_LOG_DIR, { recursive: true });

    const filePath = path.join(SESSION_LOG_DIR, this.buildFileName(contact));
    await fs.writeFile(filePath, this.buildFileContents(contact), 'utf8');
    return filePath;
  }

  buildFileName(contact) {
    const phone = String(contact.phone || '').replace(/[^0-9]/g, '') || 'unknown';
    const name = String(contact.name || 'contact')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'contact';

    return `contact_${contact.id}_${phone}_${name}.txt`;
  }

  buildFileContents(contact) {
    const lines = [
      `Session log for ${contact.name} (${contact.phone})`,
      `Updated: ${this.formatTimestamp(new Date())} (${LOG_TIME_ZONE})`,
      '',
    ];

    if (contact.sessions.length === 0) {
      lines.push('No online sessions recorded yet.');
      return `${lines.join('\n')}\n`;
    }

    for (const session of contact.sessions) {
      lines.push(this.formatSessionLine(session));
    }

    return `${lines.join('\n')}\n`;
  }

  formatSessionLine(session) {
    const startedAt = new Date(session.startedAt);
    const endedAt = session.endedAt ? new Date(session.endedAt) : null;
    const dateLabel = this.formatDate(startedAt);
    const startTime = this.formatTime(startedAt);
    const endTime = endedAt ? this.formatTime(endedAt) : 'ONGOING';
    const durationSec = endedAt
      ? session.durationSec ?? Math.max(0, Math.floor((endedAt - startedAt) / 1000))
      : null;

    return `${dateLabel} | logged on from ${startTime}-${endTime} | ${this.formatDuration(durationSec)}`;
  }

  formatDate(date) {
    return this.dateFormatter.format(date);
  }

  formatTime(date) {
    return this.timeFormatter.format(date);
  }

  formatTimestamp(date) {
    return this.timestampFormatter.format(date);
  }

  formatDuration(durationSec) {
    if (durationSec == null) {
      return 'ongoing';
    }

    const totalSeconds = Math.max(0, durationSec);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];

    if (hours > 0) {
      parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    }

    if (minutes > 0) {
      parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
    }

    if (seconds > 0 || parts.length === 0) {
      parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
    }

    return parts.join(' ');
  }
}

module.exports = SessionFileLogger;
