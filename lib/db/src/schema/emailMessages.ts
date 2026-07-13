import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { emailThreadsTable } from "./emailThreads";

export const emailDirectionValues = ["outgoing", "incoming"] as const;
export const emailMessageStatusValues = [
  "sent",
  "draft_pending_approval",
  "approved",
  "auto_sent",
] as const;

export const emailMessagesTable = pgTable("email_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id")
    .notNull()
    .references(() => emailThreadsTable.id, { onDelete: "cascade" }),
  direction: text("direction", { enum: emailDirectionValues }).notNull(),
  gmailMessageId: text("gmail_message_id"),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  status: text("status", { enum: emailMessageStatusValues })
    .notNull()
    .default("sent"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  // Opaque id embedded in this message's tracking pixel/links so incoming
  // /track/* hits can be correlated back to the message without exposing
  // the numeric primary key. Only set on outgoing messages sent with open/
  // click tracking (initial outreach + follow-ups, not auto-replies).
  trackingId: text("tracking_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEmailMessageSchema = createInsertSchema(
  emailMessagesTable,
).omit({ id: true, createdAt: true });
export type InsertEmailMessage = z.infer<typeof insertEmailMessageSchema>;
export type EmailMessage = typeof emailMessagesTable.$inferSelect;
