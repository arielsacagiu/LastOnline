const prisma = require('./src/prisma');

async function main() {
  const sessions = await prisma.onlineSession.findMany({
    where: { contactId: 4 },
    orderBy: { startedAt: 'desc' },
    take: 5,
  });
  
  if (sessions.length === 0) {
    console.log('No online sessions found for contact 4');
    return;
  }
  
  console.log('\nLast online sessions for +972547101657:');
  console.log('='.repeat(60));
  
  for (const s of sessions) {
    const start = new Date(s.startedAt).toLocaleString('en-IL', { timeZone: 'Asia/Jerusalem' });
    const end = s.endedAt ? new Date(s.endedAt).toLocaleString('en-IL', { timeZone: 'Asia/Jerusalem' }) : 'ONGOING';
    const duration = s.endedAt 
      ? Math.round((new Date(s.endedAt) - new Date(s.startedAt)) / 1000) + ' sec'
      : 'N/A';
    console.log(`\nStarted: ${start}`);
    console.log(`Ended:   ${end}`);
    console.log(`Duration: ${duration}`);
    console.log('-'.repeat(40));
  }
  
  // Also show recent logs
  console.log('\n\nRecent LastSeenLogs:');
  console.log('='.repeat(60));
  const logs = await prisma.lastSeenLog.findMany({
    where: { contactId: 4 },
    orderBy: { checkedAt: 'desc' },
    take: 10,
  });
  
  for (const log of logs) {
    const time = new Date(log.checkedAt).toLocaleString('en-IL', { timeZone: 'Asia/Jerusalem' });
    console.log(`${time} | ${log.status.toUpperCase().padEnd(8)} | ${log.lastSeen || 'N/A'}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
