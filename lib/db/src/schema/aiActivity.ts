import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiActivityKindValues = [
  "language_detection",
  "email_generation",
  "reply_classification",
  "reply_draft",
  "followup_generation",
] as const;

export const aiActivityStatusValues = ["success", "error"] as const;

export const aiActivityTable = pgTable("ai_activity", {
  id: serial("id").primaryKey(),
  kind: text("kind", { enum: aiActivityKindValues }).notNull(),
  prompt: text("prompt").notNull(),
  response: text("response"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  costEstimate: real("cost_estimate"),
  status: text("status", { enum: aiActivityStatusValues }).notNull(),
  errorMessage: text("error_message"),
  relatedProspectId: integer("related_prospect_id"),
  relatedCampaignId: integer("related_campaign_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAiActivitySchema = createInsertSchema(aiActivityTable).omit(
  { id: true, createdAt: true },
);
export type InsertAiActivity = z.infer<typeof insertAiActivitySchema>;
export type AiActivity = typeof aiActivityTable.$inferSelect;
