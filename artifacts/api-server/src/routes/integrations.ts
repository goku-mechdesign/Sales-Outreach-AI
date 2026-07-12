import { Router, type IRouter } from "express";
import { ListIntegrationsResponse } from "@workspace/api-zod";
import { getIntegrationStatuses } from "../lib/integrationsStatus";

const router: IRouter = Router();

router.get("/integrations", async (_req, res): Promise<void> => {
  res.json(ListIntegrationsResponse.parse(getIntegrationStatuses()));
});

export default router;
