import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { emailMessagesTable } from "./emailMessages";
import { emailThreadsTable } from "./emailThreads";

export const emailEventTypeValues = ["open", "click"] as const;

export const emailEventsTable = pgTable("email_events", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id")
    .notNull()
    .references(() => emailMessagesTable.id, { onDelete: "cascade" }),
  // Denormalized for cheap thread-scoped and dashboard aggregate queries.
  threadId: integer("thread_id")
    .notNull()
    .references(() => emailThreadsTable.id, { onDelete: "cascade" }),
  type: text("type", { enum: emailEventTypeValues }).notNull(),
  // Only set for "click" events -- the real destination URL that was clicked.
  url: text("url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEmailEventSchema = createInsertSchema(emailEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertEmailEvent = z.infer<typeof insertEmailEventSchema>;
export type EmailEvent = typeof emailEventsTable.$inferSelect;
