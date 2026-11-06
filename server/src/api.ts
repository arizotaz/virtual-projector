import { Router } from "express";

const router = Router()


/**
 * Simple api call to test if the server is available
 */
router.get("/health", (_req, res) => {
  res.json({ ok: true });
});



export default router;