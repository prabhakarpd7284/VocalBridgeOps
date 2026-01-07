import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sessionId = '5ebf30a7-4fe7-431c-92c9-48aa86dbb071';

  // Get all messages
  const messages = await prisma.message.findMany({
    where: { sessionId },
    orderBy: { sequenceNumber: 'asc' },
    include: { providerCall: true },
  });

  console.log('=== Messages in session ===\n');
  messages.forEach((msg, idx) => {
    console.log(`${idx + 1}. [${msg.role}] seq=${msg.sequenceNumber}`);
    console.log(`   Content: ${msg.content.substring(0, 60)}...`);
    if (msg.toolCalls) console.log(`   Tool calls: YES`);
    if (msg.providerCall) {
      console.log(
        `   Provider: ${msg.providerCall.provider} - ${msg.providerCall.tokensIn}+${msg.providerCall.tokensOut} tokens`
      );
    }
    console.log('');
  });

  // Get usage events for this session
  const usageEvents = await prisma.usageEvent.findMany({
    where: { sessionId },
    orderBy: { timestamp: 'asc' },
  });

  console.log('=== Usage events ===\n');
  usageEvents.forEach((evt, idx) => {
    console.log(
      `${idx + 1}. ${evt.provider} - ${evt.tokensIn}+${evt.tokensOut}=${evt.totalTokens} tokens = ${evt.costCents}¢`
    );
  });

  console.log('');
  console.log(
    `Total billing: ${usageEvents.reduce((sum, e) => sum + e.costCents, 0)}¢`
  );

  await prisma.$disconnect();
}

main();
