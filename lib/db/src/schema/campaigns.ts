import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const campaignStatusValues = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "completed",
] as const;

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  goal: text("goal").notNull(),
  tone: text("tone").notNull(),
  productDescription: text("product_description").notNull(),
  targetAudience: text("target_audience").notNull(),
  cta: text("cta").notNull(),
  subject: text("subject"),
  body: text("body"),
  status: text("status", { enum: campaignStatusValues })
    .notNull()
    .default("draft"),
  followupCount: integer("followup_count").notNull().default(0),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
