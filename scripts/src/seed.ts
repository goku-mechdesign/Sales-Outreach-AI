import {
  db,
  prospectsTable,
  campaignsTable,
  campaignProspectsTable,
  emailThreadsTable,
  emailMessagesTable,
  settingsTable,
} from "@workspace/db";

async function main() {
  console.log("Seeding demo data...");

  await db
    .insert(settingsTable)
    .values({
      companyName: "MechDesign Co.",
      companyDescription:
        "A mechanical design engineering studio helping hardware startups take products from concept to manufacturable design.",
      products: "CAD design, DFM reviews, prototyping consulting",
      services: "Contract mechanical engineering, design sprints, tooling design",
      emailSignature: "Rupesh\nFounder, MechDesign Co.",
      notificationEmail: "rupesh@mechdesign.co",
    })
    .onConflictDoNothing();

  const [p1] = await db
    .insert(prospectsTable)
    .values({
      companyName: "Aster Robotics",
      website: "https://asterrobotics.example.com",
      industry: "Robotics",
      country: "United States",
      city: "Austin",
      email: "hello@asterrobotics.example.com",
      contactName: "Jamie Chen",
      source: "manual",
      status: "contacted",
      confidenceScore: 0.8,
      detectedLanguage: "en",
    })
    .returning();

  const [p2] = await db
    .insert(prospectsTable)
    .values({
      companyName: "Nordic Drone Systems",
      website: "https://nordicdrone.example.com",
      industry: "Aerospace",
      country: "Sweden",
      city: "Gothenburg",
      email: "info@nordicdrone.example.com",
      contactName: "Elin Berg",
      source: "manual",
      status: "new",
      confidenceScore: 0.6,
      detectedLanguage: "sv",
    })
    .returning();

  await db.insert(prospectsTable).values({
    companyName: "Pinnacle Medical Devices",
    website: "https://pinnaclemed.example.com",
    industry: "Medical Devices",
    country: "United States",
    city: "Boston",
    source: "manual",
    status: "new",
    confidenceScore: 0.4,
    detectedLanguage: "en",
  });

  const [campaign] = await db
    .insert(campaignsTable)
    .values({
      name: "Hardware Startups Q3 Outreach",
      goal: "Book intro calls with early-stage hardware startups that need mechanical design help",
      tone: "friendly and direct",
      productDescription:
        "Contract mechanical engineering and DFM reviews for hardware startups",
      targetAudience: "Founders and hardware leads at pre-seed to Series A robotics/hardware startups",
      cta: "Offer a free 20-minute design review call",
      subject: "Quick question about {{companyName}}'s hardware roadmap",
      body:
        "Hi {{contactName}},\n\nI came across {{companyName}} and was impressed by what you're building. I help hardware startups like yours get from prototype to manufacturable design faster, without the usual DFM surprises.\n\nWould you be open to a free 20-minute design review call this week?\n\nBest,\nRupesh\nFounder, MechDesign Co.",
      status: "draft",
    })
    .returning();

  if (campaign && p1 && p2) {
    const [cp1] = await db
      .insert(campaignProspectsTable)
      .values({ campaignId: campaign.id, prospectId: p1.id, status: "sent", followupStage: 0 })
      .returning();
    await db.insert(campaignProspectsTable).values({
      campaignId: campaign.id,
      prospectId: p2.id,
      status: "pending",
    });

    if (cp1) {
      const [thread] = await db
        .insert(emailThreadsTable)
        .values({
          prospectId: p1.id,
          campaignProspectId: cp1.id,
          companyName: p1.companyName,
          subject: "Quick question about Aster Robotics's hardware roadmap",
          category: "interested",
          categoryConfidence: 0.91,
          isHot: true,
          aiSummary: "Jamie is interested and wants to see pricing before booking a call.",
          lastMessageAt: new Date(),
        })
        .returning();

      if (thread) {
        await db.insert(emailMessagesTable).values([
          {
            threadId: thread.id,
            direction: "outgoing",
            fromAddress: "rupesh@mechdesign.co",
            toAddress: p1.email!,
            subject: thread.subject,
            body: "Hi Jamie,\n\nI came across Aster Robotics and was impressed by what you're building...",
            status: "sent",
            sentAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
          },
          {
            threadId: thread.id,
            direction: "incoming",
            fromAddress: p1.email!,
            toAddress: "rupesh@mechdesign.co",
            subject: `Re: ${thread.subject}`,
            body: "Hey, thanks for reaching out -- this is interesting. Can you share pricing before we book a call?",
            status: "sent",
            sentAt: new Date(),
          },
        ]);
      }
    }
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
