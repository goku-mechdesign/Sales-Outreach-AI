import { Router, type IRouter } from "express";
import healthRouter from "./health";
import prospectsRouter from "./prospects";
import campaignsRouter from "./campaigns";
import threadsRouter from "./threads";
import aiActivityRouter from "./aiActivity";
import settingsRouter from "./settings";
import integrationsRouter from "./integrations";
import dashboardRouter from "./dashboard";
import notificationsRouter from "./notifications";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(healthRouter);

router.use(
  requireAuth,
  prospectsRouter,
  campaignsRouter,
  threadsRouter,
  aiActivityRouter,
  settingsRouter,
  integrationsRouter,
  dashboardRouter,
  notificationsRouter,
);

export default router;
