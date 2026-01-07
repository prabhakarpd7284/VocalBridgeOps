import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Checking PostgreSQL Advisory Locks ===\n');

  // Query to see all advisory locks
  const locks = await prisma.$queryRaw<any[]>`
    SELECT
      locktype,
      database,
      classid,
      objid,
      pid,
      mode,
      granted
    FROM pg_locks
    WHERE locktype = 'advisory'
  `;

  console.log('Advisory locks:', JSON.stringify(locks, null, 2));

  if (locks.length > 0) {
    console.log('\n=== Releasing all advisory locks ===');
    for (const lock of locks) {
      try {
        const key = lock.objid.toString();
        await prisma.$queryRawUnsafe(
          `SELECT pg_advisory_unlock($1::bigint)`,
          key
        );
        console.log(`Released lock: ${key}`);
      } catch (error) {
        console.log(`Failed to release lock: ${error}`);
      }
    }
  } else {
    console.log('No advisory locks found.');
  }

  await prisma.$disconnect();
}

main();
