import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { replyCategoryValues } from "./emailThreads";

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
  notificationEmail: text("notification_email"),
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
