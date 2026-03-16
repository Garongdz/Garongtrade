import { Router, type IRouter } from "express";
import healthRouter from "./health";
import cryptoRouter from "./crypto";
import aiAnalystRouter from "./ai-analyst";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cryptoRouter);
router.use(aiAnalystRouter);

export default router;
