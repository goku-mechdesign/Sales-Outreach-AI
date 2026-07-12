import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * User-supplied overrides for third-party integration credentials, entered
 * from the Integrations page instead of (or in addition to) environment
 * secrets. `values` is a small string map whose shape depends on the
 * provider, e.g. `{ apiKey: "..." }` or `{ clientId: "...", clientSecret:
 * "..." }`. For the "gmail" key it instead stores an app-level soft toggle:
 * `{ disabled: "true" }`.
 */
export const integrationCredentialsTable = pgTable("integration_credentials", {
  key: text("key").primaryKey(),
  values: jsonb("values").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertIntegrationCredentialSchema = createInsertSchema(
  integrationCredentialsTable,
);
export type InsertIntegrationCredential = z.infer<
  typeof insertIntegrationCredentialSchema
>;
export type IntegrationCredential = typeof integrationCredentialsTable.$inferSelect;
