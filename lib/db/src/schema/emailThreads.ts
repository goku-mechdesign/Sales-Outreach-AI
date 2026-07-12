import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { prospectsTable } from "./prospects";
import { campaignProspectsTable } from "./campaignProspects";

export const replyCategoryValues = [
  "interested",
  "need_more_info",
  "pricing",
  "meeting_request",
  "not_interested",
  "wrong_contact",
  "out_of_office",
  "spam",
  "other",
] as const;

export type ReplyCategory = (typeof replyCategoryValues)[number];

export const emailThreadsTable = pgTable("email_threads", {
  id: serial("id").primaryKey(),
  prospectId: integer("prospect_id").references(() => prospectsTable.id, {
    onDelete: "set null",
  }),
  campaignProspectId: integer("campaign_prospect_id").references(
    () => campaignProspectsTable.id,
    { onDelete: "set null" },
  ),
  companyName: text("company_name").notNull(),
  gmailThreadId: text("gmail_thread_id"),
  subject: text("subject").notNull(),
  category: text("category", { enum: replyCategoryValues }),
  categoryConfidence: real("category_confidence"),
  isHot: boolean("is_hot").notNull().default(false),
  aiSummary: text("ai_summary"),
  draftReply: text("draft_reply"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEmailThreadSchema = createInsertSchema(
  emailThreadsTable,
).omit({ id: true, createdAt: true });
export type InsertEmailThread = z.infer<typeof insertEmailThreadSchema>;
export type EmailThread = typeof emailThreadsTable.$inferSelect;
