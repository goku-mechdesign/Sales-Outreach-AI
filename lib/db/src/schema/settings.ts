import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { replyCategoryValues } from "./emailThreads";
import { campaignsTable } from "./campaigns";

export const autoDiscoveryCadenceValues = ["daily", "weekly", "manual"] as const;

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull().default(""),
  companyDescription: text("company_description"),
  products: text("products"),
  services: text("services"),
  website: text("website"),
  emailSignature: text("email_signature"),
  defaultTone: text("default_tone").notNull().default("professional"),
  defaultCta: text("default_cta").notNull().default("Book a 15-minute call"),
  maxEmailsPerDay: integer("max_emails_per_day").notNull().default(20),
  followupDays: integer("followup_days").array().notNull().default([3, 7, 14]),
  autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(false),
  autoReplyCategories: text("auto_reply_categories", {
    enum: replyCategoryValues,
  })
    .array()
    .notNull()
    .default([]),
  autoReplyHoldHotLeads: boolean("auto_reply_hold_hot_leads")
    .notNull()
    .default(true),
  notifyOnAutoReply: boolean("notify_on_auto_reply").notNull().default(true),
  notificationEmail: text("notification_email"),
  // Autonomous discovery: periodically search for new prospects using these
  // saved criteria instead of requiring a manual "Discover" click.
  autoDiscoveryEnabled: boolean("auto_discovery_enabled").notNull().default(false),
  autoDiscoveryCadence: text("auto_discovery_cadence", {
    enum: autoDiscoveryCadenceValues,
  })
    .notNull()
    .default("manual"),
  autoDiscoveryTargetCount: integer("auto_discovery_target_count")
    .notNull()
    .default(10),
  autoDiscoveryIndustry: text("auto_discovery_industry"),
  autoDiscoveryCountry: text("auto_discovery_country"),
  autoDiscoveryCity: text("auto_discovery_city"),
  autoDiscoveryKeywords: text("auto_discovery_keywords"),
  autoDiscoveryCompanySize: text("auto_discovery_company_size"),
  lastAutoDiscoveryAt: timestamp("last_auto_discovery_at", { withTimezone: true }),
  // The single "always-on" campaign that newly discovered prospects get
  // auto-enrolled into, and that the scheduler auto-sends from.
  autoEnrollCampaignId: integer("auto_enroll_campaign_id").references(
    () => campaignsTable.id,
    { onDelete: "set null" },
  ),
  // Minimum delay between two consecutive autonomous sends, so bulk sends
  // don't look like a burst to mail providers (deliverability/reputation).
  sendPacingSeconds: integer("send_pacing_seconds").notNull().default(20),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
