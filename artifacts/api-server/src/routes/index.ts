import { Router, type IRouter } from "express";
import healthRouter from "./health";
import cryptoRouter from "./crypto";
import aiAnalystRouter from "./ai-analyst";
import newsRouter from "./news";
import signalsRouter from "./signals";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cryptoRouter);
router.use(aiAnalystRouter);
router.use(newsRouter);
router.use(signalsRouter);

export default router;
