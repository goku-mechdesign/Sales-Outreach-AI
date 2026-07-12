import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";
import { prospectsTable } from "./prospects";

export const campaignProspectStatusValues = [
  "pending",
  "sent",
  "replied",
  "bounced",
  "stopped",
] as const;

export const campaignProspectsTable = pgTable("campaign_prospects", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaignsTable.id, { onDelete: "cascade" }),
  prospectId: integer("prospect_id")
    .notNull()
    .references(() => prospectsTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: campaignProspectStatusValues })
    .notNull()
    .default("pending"),
  followupStage: integer("followup_stage").notNull().default(0),
  lastEmailAt: timestamp("last_email_at", { withTimezone: true }),
  nextFollowupAt: timestamp("next_followup_at", { withTimezone: true }),
  gmailThreadId: text("gmail_thread_id"),
  stoppedReason: text("stopped_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCampaignProspectSchema = createInsertSchema(
  campaignProspectsTable,
).omit({ id: true, createdAt: true });
export type InsertCampaignProspect = z.infer<
  typeof insertCampaignProspectSchema
>;
export type CampaignProspect = typeof campaignProspectsTable.$inferSelect;
