import { Router, type IRouter } from "express";
import {
  ListIntegrationsResponse,
  SetIntegrationCredentialBody,
  SetIntegrationCredentialResponse,
  ClearIntegrationCredentialResponse,
  SetGmailDisabledBody,
  SetGmailDisabledResponse,
} from "@workspace/api-zod";
import { getIntegrationStatuses } from "../lib/integrationsStatus";
import {
  PROVIDER_CREDENTIAL_FIELDS,
  setCredentialValues,
  clearCredential,
} from "../lib/credentials";

const router: IRouter = Router();

router.get("/integrations", async (_req, res): Promise<void> => {
  res.json(ListIntegrationsResponse.parse(await getIntegrationStatuses()));
});

router.put("/integrations/:key", async (req, res): Promise<void> => {
  const key = req.params.key;
  const fields = PROVIDER_CREDENTIAL_FIELDS[key];
  if (!fields) {
    res.status(400).json({ error: `Unknown or non-editable integration key: ${key}` });
    return;
  }
  const parsed = SetIntegrationCredentialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const allowedNames = new Set(fields.map((f) => f.name));
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(parsed.data.values)) {
    if (!allowedNames.has(name)) {
      res.status(400).json({ error: `Unknown field "${name}" for integration "${key}"` });
      return;
    }
    if (typeof value === "string" && value.trim()) {
      values[name] = value.trim();
    }
  }
  await setCredentialValues(key, values);
  const statuses = await getIntegrationStatuses();
  const updated = statuses.find((s) => s.key === key);
  res.json(SetIntegrationCredentialResponse.parse(updated));
});

router.delete("/integrations/:key", async (req, res): Promise<void> => {
  const key = req.params.key;
  if (!PROVIDER_CREDENTIAL_FIELDS[key]) {
    res.status(400).json({ error: `Unknown or non-editable integration key: ${key}` });
    return;
  }
  await clearCredential(key);
  const statuses = await getIntegrationStatuses();
  const updated = statuses.find((s) => s.key === key);
  res.json(ClearIntegrationCredentialResponse.parse(updated));
});

router.put("/integrations/gmail/disabled", async (req, res): Promise<void> => {
  const parsed = SetGmailDisabledBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await setCredentialValues("gmail", { disabled: String(parsed.data.disabled) });
  const statuses = await getIntegrationStatuses();
  const updated = statuses.find((s) => s.key === "gmail");
  res.json(SetGmailDisabledResponse.parse(updated));
});

export default router;
