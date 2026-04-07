const KEEPALIVE_MS = 15000;
const clientsByUser = new Map();

function writeEvent(res, event, data) {
  if (res.writableEnded) {
    return;
  }

  res.write(`event: ${event}\n`);
  const payload = JSON.stringify(data);
  for (const line of payload.split('\n')) {
    res.write(`data: ${line}\n`);
  }
  res.write('\n');
}

function registerClient(userId, res) {
  const numericUserId = Number(userId);
  const client = {
    res,
    keepAliveId: setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keep-alive\n\n');
      }
    }, KEEPALIVE_MS),
  };

  const clients = clientsByUser.get(numericUserId) || new Set();
  clients.add(client);
  clientsByUser.set(numericUserId, clients);

  writeEvent(res, 'connected', { timestamp: new Date().toISOString() });
  return client;
}

function unregisterClient(userId, client) {
  const numericUserId = Number(userId);
  clearInterval(client.keepAliveId);

  const clients = clientsByUser.get(numericUserId);
  if (!clients) {
    return;
  }

  clients.delete(client);
  if (clients.size === 0) {
    clientsByUser.delete(numericUserId);
  }
}

function emitToUser(userId, event, data) {
  const clients = clientsByUser.get(Number(userId));
  if (!clients || clients.size === 0) {
    return;
  }

  for (const client of clients) {
    writeEvent(client.res, event, data);
  }
}

function publishContactsChanged(userId, action, contactId = null) {
  emitToUser(userId, 'contacts_changed', {
    action,
    contactId,
    timestamp: new Date().toISOString(),
  });
}

function publishPresenceUpdate(userId, payload) {
  emitToUser(userId, 'contact_presence', payload);
}

module.exports = {
  publishContactsChanged,
  publishPresenceUpdate,
  registerClient,
  unregisterClient,
};
