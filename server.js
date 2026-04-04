import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { shopifyApi, LATEST_API_VERSION, DeliveryMethod, sessionStorage } from "@shopify/shopify-api";
import db from "./db/database.js";
import webhookRoutes from "./routes/webhooks.js";
import { handleInventoryUpdate } from "./controllers/inventoryController.js";

dotenv.config();

const app = express();

// Shopify requires raw body for webhook validation
app.use("/webhooks", bodyParser.raw({ type: "application/json" }));
app.use(bodyParser.json());

// -------------------------------
// 1. Shopify API Setup
// -------------------------------
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SCOPES.split(","),
  hostName: process.env.HOST.replace("https://", ""),
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
  sessionStorage: new sessionStorage.CustomSessionStorage({
    storeCallback: async (session) => {
      return new Promise((resolve) => {
        db.run(
          `INSERT OR REPLACE INTO shops (shop_domain, access_token) VALUES (?, ?)`,
          [session.shop, session.accessToken],
          () => resolve(true)
        );
      });
    },

    loadCallback: async (id) => {
      return new Promise((resolve) => {
        db.get(
          `SELECT * FROM shops WHERE shop_domain = ?`,
          [id],
          (err, row) => {
            if (!row) return resolve(undefined);
            resolve(
              new sessionStorage.Session({
                id,
                shop: row.shop_domain,
                state: "",
                isOnline: true,
                accessToken: row.access_token,
              })
            );
          }
        );
      });
    },

    deleteCallback: async (id) => {
      return new Promise((resolve) => {
        db.run(
          `DELETE FROM shops WHERE shop_domain = ?`,
          [id],
          () => resolve(true)
        );
      });
    },
  }),
});

// -------------------------------
// 2. OAuth Route
// -------------------------------
app.get("/auth", async (req, res) => {
  const redirectUrl = await shopify.auth.begin({
    shop: req.query.shop,
    callbackPath: "/auth/callback",
    isOnline: false,
    rawRequest: req,
    rawResponse: res,
  });

  return res.redirect(redirectUrl);
});

// -------------------------------
// 3. OAuth Callback
// -------------------------------
app.get("/auth/callback", async (req, res) => {
  const { session } = await shopify.auth.callback({
    rawRequest: req,
    rawResponse: res,
  });

  // Register inventory webhook
  await shopify.webhooks.register({
    session,
    topic: "INVENTORY_LEVELS_UPDATE",
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: `${process.env.HOST}/webhooks/inventory`,
  });

  return res.redirect(`/?shop=${session.shop}`);
});

// -------------------------------
// 4. Webhook Routes
// -------------------------------
app.use("/webhooks", webhookRoutes);

// -------------------------------
// 5. Frontend Route
// -------------------------------
app.get("/", (req, res) => {
  res.send("AutoHide Pro is running.");
});

// -------------------------------
// 6. Start Server (Render Compatible)
// -------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AutoHide Pro running on port ${PORT}`);
});
