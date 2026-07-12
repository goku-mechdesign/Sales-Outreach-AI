import {
  pgTable,
  text,
  serial,
  timestamp,
  real,
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
  notes: text("notes"),
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
