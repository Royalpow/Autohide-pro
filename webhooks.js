import express from "express";
import { handleInventoryUpdate } from "../controllers/inventoryController.js";

const router = express.Router();

router.post("/inventory", async (req, res) => {
  const shop = req.headers["x-shopify-shop-domain"];
  const topic = req.headers["x-shopify-topic"];
  const body = req.body.toString();

  await handleInventoryUpdate(topic, shop, body);

  res.status(200).send("OK");
});

export default router;