import express from "express";
import { handleInventoryUpdate } from "../controllers/inventoryController.js";

const router = express.Router();

// Shopify sends raw JSON for webhooks — server.js already handles bodyParser.raw()
// So we do NOT parse JSON here.

router.post("/inventory", async (req, res) => {
  try {
    const shop = req.headers["x-shopify-shop-domain"];
    const topic = req.headers["x-shopify-topic"];
    const body = req.body.toString(); // raw body required

    await handleInventoryUpdate(topic, shop, body);

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Webhook processing failed");
  }
});

export default router;
