/**
 * Database seed script
 * Creates 2 tenants and 3 agents as per requirements
 */

import { PrismaClient, ProviderType } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function generateApiKey(): string {
  const randomPart = crypto.randomBytes(24).toString('base64url');
  return `vb_live_${randomPart}`;
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

async function main() {
  console.log('🌱 Starting seed...\n');

  // Clean existing data (in reverse order of dependencies)
  await prisma.toolExecution.deleteMany();
  await prisma.usageEvent.deleteMany();
  await prisma.providerCall.deleteMany();
  await prisma.message.deleteMany();
  await prisma.audioArtifact.deleteMany();
  await prisma.session.deleteMany();
  await prisma.job.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.tenant.deleteMany();

  console.log('Cleaned existing data\n');

  // Create Tenant 1: Acme Corporation
  const acmeApiKey = generateApiKey();
  const acmeTenant = await prisma.tenant.create({
    data: {
      name: 'Acme Corporation',
      email: 'admin@acme.com',
      apiKeys: {
        create: {
          keyPrefix: acmeApiKey.substring(0, 12),
          keyHash: hashApiKey(acmeApiKey),
          name: 'Production Key',
          role: 'ADMIN',
        },
      },
    },
  });

  console.log('✅ Created Tenant: Acme Corporation');
  console.log(`   Email: admin@acme.com`);
  console.log(`   API Key: ${acmeApiKey}\n`);

  // Create Tenant 2: TechStart Inc
  const techStartApiKey = generateApiKey();
  const techStartTenant = await prisma.tenant.create({
    data: {
      name: 'TechStart Inc',
      email: 'admin@techstart.io',
      apiKeys: {
        create: {
          keyPrefix: techStartApiKey.substring(0, 12),
          keyHash: hashApiKey(techStartApiKey),
          name: 'Production Key',
          role: 'ADMIN',
        },
      },
    },
  });

  console.log('✅ Created Tenant: TechStart Inc');
  console.log(`   Email: admin@techstart.io`);
  console.log(`   API Key: ${techStartApiKey}\n`);

  // Create an analyst key for Acme
  const acmeAnalystKey = generateApiKey();
  await prisma.apiKey.create({
    data: {
      tenantId: acmeTenant.id,
      keyPrefix: acmeAnalystKey.substring(0, 12),
      keyHash: hashApiKey(acmeAnalystKey),
      name: 'Analyst Key',
      role: 'ANALYST',
    },
  });
  console.log('✅ Created Analyst API Key for Acme Corporation');
  console.log(`   API Key: ${acmeAnalystKey}\n`);

  // Create Agent 1: Support Bot (Acme)
  const supportBot = await prisma.agent.create({
    data: {
      tenantId: acmeTenant.id,
      name: 'Support Bot',
      description: 'Customer support assistant for handling inquiries and order lookups',
      primaryProvider: 'VENDOR_A',
      fallbackProvider: 'VENDOR_B',
      systemPrompt: `You are a helpful customer support assistant for Acme Corporation.
You help customers with:
- Order status inquiries
- Invoice lookups
- General product questions
- Returns and refunds

Be friendly, professional, and concise. When customers ask about orders, use the InvoiceLookup tool to find their order information.

Always maintain a helpful tone and offer to help with anything else after resolving their query.`,
      temperature: 0.7,
      maxTokens: 1024,
      enabledTools: ['InvoiceLookup'],
      voiceEnabled: true,
      voiceConfig: {
        sttProvider: 'mock',
        ttsProvider: 'mock',
        voice: 'alloy',
      },
    },
  });

  console.log('✅ Created Agent: Support Bot (Acme Corporation)');
  console.log(`   Primary: VENDOR_A, Fallback: VENDOR_B`);
  console.log(`   Tools: InvoiceLookup`);
  console.log(`   Voice: Enabled\n`);

  // Create Agent 2: Sales Assistant (Acme)
  const salesBot = await prisma.agent.create({
    data: {
      tenantId: acmeTenant.id,
      name: 'Sales Assistant',
      description: 'Sales assistant for product recommendations and purchase guidance',
      primaryProvider: 'VENDOR_B',
      fallbackProvider: null,
      systemPrompt: `You are a knowledgeable sales assistant for Acme Corporation.
You help customers with:
- Product recommendations
- Feature comparisons
- Pricing inquiries
- Purchase guidance

Be enthusiastic but not pushy. Focus on understanding customer needs and matching them with the right products. Always be honest about product capabilities and limitations.`,
      temperature: 0.8,
      maxTokens: 1024,
      enabledTools: [],
      voiceEnabled: false,
    },
  });

  console.log('✅ Created Agent: Sales Assistant (Acme Corporation)');
  console.log(`   Primary: VENDOR_B, Fallback: None`);
  console.log(`   Tools: None`);
  console.log(`   Voice: Disabled\n`);

  // Create Agent 3: Onboarding Guide (TechStart)
  const onboardingBot = await prisma.agent.create({
    data: {
      tenantId: techStartTenant.id,
      name: 'Onboarding Guide',
      description: 'Helps new users get started with the platform',
      primaryProvider: 'VENDOR_A',
      fallbackProvider: 'VENDOR_A', // Same provider retry only
      systemPrompt: `You are a friendly onboarding assistant for TechStart's platform.
You help new users with:
- Getting started tutorials
- Feature explanations
- Account setup
- Best practices

Be patient and encouraging. Break down complex topics into simple steps. Use examples when explaining features. Always offer to clarify if something is unclear.`,
      temperature: 0.6,
      maxTokens: 2048,
      enabledTools: ['InvoiceLookup'],
      voiceEnabled: true,
      voiceConfig: {
        sttProvider: 'mock',
        ttsProvider: 'mock',
        voice: 'nova',
      },
    },
  });

  console.log('✅ Created Agent: Onboarding Guide (TechStart Inc)');
  console.log(`   Primary: VENDOR_A, Fallback: VENDOR_A (retry only)`);
  console.log(`   Tools: InvoiceLookup`);
  console.log(`   Voice: Enabled\n`);

  // Create sample sessions and messages for demonstration
  console.log('Creating sample session data...\n');

  // Sample session for Support Bot
  const sampleSession = await prisma.session.create({
    data: {
      tenantId: acmeTenant.id,
      agentId: supportBot.id,
      customerId: 'customer_001',
      channel: 'CHAT',
      metadata: {
        source: 'website',
        page: '/support',
        userAgent: 'Mozilla/5.0',
      },
    },
  });

  // Add sample messages
  await prisma.message.createMany({
    data: [
      {
        sessionId: sampleSession.id,
        sequenceNumber: 1,
        role: 'USER',
        content: 'Hi, I need help with my order #12345',
      },
      {
        sessionId: sampleSession.id,
        sequenceNumber: 2,
        role: 'ASSISTANT',
        content: "Hello! I'd be happy to help you with your order. Let me look that up for you. Your order #12345 has been shipped and is currently on its way. The tracking number is 1Z999AA10123456784, and the estimated delivery date is January 18th. Is there anything else you'd like to know about your order?",
        toolCalls: JSON.stringify([
          {
            name: 'InvoiceLookup',
            args: { orderId: '12345' },
            result: {
              orderId: '12345',
              status: 'shipped',
              trackingNumber: '1Z999AA10123456784',
            },
          },
        ]),
      },
      {
        sessionId: sampleSession.id,
        sequenceNumber: 3,
        role: 'USER',
        content: 'That\'s great, thank you!',
      },
      {
        sessionId: sampleSession.id,
        sequenceNumber: 4,
        role: 'ASSISTANT',
        content: "You're welcome! If you have any other questions about your order or need any other assistance, feel free to ask. Have a great day!",
      },
    ],
  });

  console.log('✅ Created sample session with messages\n');

  // Create sample usage events for billing demonstration
  const providerCall = await prisma.providerCall.create({
    data: {
      sessionId: sampleSession.id,
      correlationId: 'corr_sample_001',
      provider: 'VENDOR_A',
      isFallback: false,
      tokensIn: 150,
      tokensOut: 200,
      latencyMs: 450,
      status: 'SUCCESS',
      attemptNumber: 1,
      billed: true,
    },
  });

  await prisma.usageEvent.create({
    data: {
      tenantId: acmeTenant.id,
      agentId: supportBot.id,
      sessionId: sampleSession.id,
      providerCallId: providerCall.id,
      provider: 'VENDOR_A',
      tokensIn: 150,
      tokensOut: 200,
      totalTokens: 350,
      costCents: 1, // Very low cost for demo
      pricingSnapshot: {
        inputPricePerKTokens: 0.002,
        outputPricePerKTokens: 0.002,
      },
    },
  });

  console.log('✅ Created sample usage event\n');

  // Summary
  console.log('\n');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('                        SEED COMPLETED SUCCESSFULLY                          ');
  console.log('════════════════════════════════════════════════════════════════════════════\n');

  console.log('TENANTS & API KEYS:\n');

  console.log('1. Acme Corporation (admin@acme.com)');
  console.log('   Admin API Key:');
  console.log(`   ${acmeApiKey}`);
  console.log('');
  console.log('   Analyst API Key:');
  console.log(`   ${acmeAnalystKey}`);
  console.log('');

  console.log('2. TechStart Inc (admin@techstart.io)');
  console.log('   Admin API Key:');
  console.log(`   ${techStartApiKey}`);
  console.log('');

  console.log('────────────────────────────────────────────────────────────────────────────\n');

  console.log('AGENTS:\n');
  console.log('  Acme Corporation:');
  console.log('    1. Support Bot      - Primary: VENDOR_A, Fallback: VENDOR_B, Tools: InvoiceLookup, Voice: Yes');
  console.log('    2. Sales Assistant  - Primary: VENDOR_B, Fallback: None, Tools: None, Voice: No');
  console.log('');
  console.log('  TechStart Inc:');
  console.log('    3. Onboarding Guide - Primary: VENDOR_A, Fallback: VENDOR_A, Tools: InvoiceLookup, Voice: Yes');
  console.log('');

  console.log('════════════════════════════════════════════════════════════════════════════\n');
  console.log('Copy an API key above and use it to log in to the dashboard at http://localhost:5173\n');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
