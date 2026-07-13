import {
  pgTable,
  text,
  serial,
  timestamp,
  real,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const prospectStatusValues = [
  "new",
  "approved",
  "rejected",
  "contacted",
  "replied",
  "hot",
  "not_interested",
  "bounced",
] as const;

export const prospectSourceValues = [
  "manual",
  "apollo",
  "hunter",
  "website",
] as const;

export const prospectsTable = pgTable("prospects", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  website: text("website"),
  industry: text("industry"),
  country: text("country"),
  city: text("city"),
  detectedLanguage: text("detected_language"),
  linkedinUrl: text("linkedin_url"),
  source: text("source", { enum: prospectSourceValues })
    .notNull()
    .default("manual"),
  email: text("email"),
  contactName: text("contact_name"),
  status: text("status", { enum: prospectStatusValues })
    .notNull()
    .default("new"),
  confidenceScore: real("confidence_score").notNull().default(0),
  // Deterministic 0-100 fit/intent score computed at discovery/edit time --
  // see `computeLeadScore` in the api-server. Lets the Prospects list
  // surface the best-fit leads and lets auto-enrollment prioritize them.
  leadScore: integer("lead_score").notNull().default(0),
  notes: text("notes"),
  // Suppression: once set, this prospect must never be emailed again by any
  // send path (manual, autonomous, or auto-enrollment) -- independent of
  // `status` so it layers on top of whatever stage the prospect is in.
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  unsubscribeReason: text("unsubscribe_reason"),
  // Hard bounce: once set, this prospect's email address is treated as dead
  // and must never be emailed again by any send path -- same enforcement
  // shape as `unsubscribedAt`, but detected automatically from bounce
  // notifications rather than user action.
  bouncedAt: timestamp("bounced_at", { withTimezone: true }),
  bounceReason: text("bounce_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertProspectSchema = createInsertSchema(prospectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProspect = z.infer<typeof insertProspectSchema>;
export type Prospect = typeof prospectsTable.$inferSelect;
