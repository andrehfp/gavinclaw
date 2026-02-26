import dotenv from 'dotenv';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';
import { insertAuditEvent } from '../lib/server/audit/postgres';

async function main() {
  dotenv.config({ path: '.env.local', quiet: true });
  dotenv.config({ quiet: true });

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is required');
  }

  const convex = new ConvexHttpClient(convexUrl);
  const seedResult = await convex.mutation(api.devSeed.seedFoundation, {});

  if (process.env.DATABASE_URL) {
    await insertAuditEvent({
      orgId: seedResult.organizationExternalId,
      actorId: seedResult.userExternalId,
      action: 'seed.foundation',
      resource: 'setup',
      payload: {
        seededAt: new Date().toISOString(),
      },
    });
  }

  console.log('Seed complete:', seedResult);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
