/************************************************************
 * AUTOHIDE PRO — SERVER ENTRY POINT
 * ----------------------------------------------------------
 * This file initializes:
 *  - Express server
 *  - Shopify API v10 (pure ESM)
 *  - OAuth installation flow
 *  - Webhook registration + handling
 *  - Custom SQLite session storage
 *  - Render-compatible server startup
 *
 * Everything here is structured for:
 *  - Node 20+ (Render uses Node 22)
 *  - Shopify API v10 (no default export)
 *  - ESM-only import syntax
 ***********************************************************/
import pkg from "@shopify/shopify-api/package.json" assert { type: "json" };
console.log("Render installed Shopify API version:", pkg.version);
import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";

// Shopify API v10 uses **named exports only**
import {
  shopifyApi,
  LATEST_API_VERSION,
  DeliveryMethod,
  sessionStorage,
} from "@shopify/shopify-api";

// Local modules
import db from "./db/database.js";
import webhookRoutes from "./routes/webhooks.js";
import { handleInventoryUpdate } from "./controllers/inventoryController.js";

dotenv.config();
const app = express();

/************************************************************
 * BODY PARSING
 * ----------------------------------------------------------
 * Shopify requires:
 *  - RAW BODY for webhook validation (HMAC signature)
 *  - Normal JSON parsing for all other routes
 ************************************************************/
app.use("/webhooks", bodyParser.raw({ type: "application/json" }));
app.use(bodyParser.json());

/************************************************************
 * SHOPIFY API INITIALIZATION
 * ----------------------------------------------------------
 * This is the core Shopify API object.
 * It handles:
 *  - OAuth
 *  - Webhooks
 *  - REST/GraphQL clients
 *  - Session management
 *
 * NOTE:
 *  - hostName must NOT include https://
 *  - sessionStorage must be a CustomSessionStorage instance
 ************************************************************/
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SCOPES.split(","),
  hostName: process.env.HOST.replace("https://", ""),
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,

  /************************************************************
   * CUSTOM SESSION STORAGE (SQLite)
   * ----------------------------------------------------------
   * Shopify requires persistent storage for:
   *  - Access tokens
   *  - Shop sessions
   *
   * We store them in SQLite using the CustomSessionStorage API.
   *
   * Shopify v10 requires:
   *  new sessionStorage.CustomSessionStorage({ ...callbacks })
   ************************************************************/
  sessionStorage: new sessionStorage.CustomSessionStorage({
    // Save session to DB
    storeCallback: async (session) => {
      return new Promise((resolve) => {
        db.run(
          `INSERT OR REPLACE INTO shops (shop_domain, access_token) VALUES (?, ?)`,
          [session.shop, session.accessToken],
          () => resolve(true)
        );
      });
    },

    // Load session from DB
    loadCallback: async (id) => {
      return new Promise((resolve) => {
        db.get(
          `SELECT * FROM shops WHERE shop_domain = ?`,
          [id],
          (err, row) => {
            if (!row) return resolve(undefined);

            // Shopify requires a Session object to be returned
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

    // Delete session from DB
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

/************************************************************
 * OAUTH — INSTALLATION ENTRY POINT
 * ----------------------------------------------------------
 * Shopify redirects merchants to:
 *   /auth?shop=STORE_NAME.myshopify.com
 *
 * This route:
 *  - Begins OAuth
 *  - Redirects merchant to Shopify's permission screen
 ************************************************************/
app.get("/auth", async (req, res) => {
  const redirectUrl = await shopify.auth.begin({
    shop: req.query.shop,
    callbackPath: "/auth/callback",
    isOnline: false, // offline token = permanent token
    rawRequest: req,
    rawResponse: res,
  });

  return res.redirect(redirectUrl);
});

/************************************************************
 * OAUTH CALLBACK
 * ----------------------------------------------------------
 * Shopify sends the merchant back here after approving.
 *
 * This route:
 *  - Completes OAuth
 *  - Stores access token in SQLite
 *  - Registers webhooks
 *  - Redirects merchant to your app homepage
 ************************************************************/
app.get("/auth/callback", async (req, res) => {
  const { session } = await shopify.auth.callback({
    rawRequest: req,
    rawResponse: res,
  });

  /************************************************************
   * WEBHOOK REGISTRATION
   * ----------------------------------------------------------
   * Shopify API v10 registers webhooks programmatically.
   *
   * INVENTORY_LEVELS_UPDATE:
   *  - Fires whenever inventory changes
   *  - Your app listens at /webhooks/inventory
   ************************************************************/
  await shopify.webhooks.register({
    session,
    topic: "INVENTORY_LEVELS_UPDATE",
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: `${process.env.HOST}/webhooks/inventory`,
  });

  return res.redirect(`/?shop=${session.shop}`);
});

/************************************************************
 * WEBHOOK ROUTES
 * ----------------------------------------------------------
 * All webhook endpoints are defined in:
 *   /routes/webhooks.js
 *
 * This keeps server.js clean and modular.
 ************************************************************/
app.use("/webhooks", webhookRoutes);

/************************************************************
 * ROOT ROUTE
 * ----------------------------------------------------------
 * Simple health check for Render + Shopify
 ************************************************************/
app.get("/", (req, res) => {
  res.send("AutoHide Pro is running.");
});

/************************************************************
 * SERVER STARTUP (Render Compatible)
 * ----------------------------------------------------------
 * Render injects PORT automatically.
 * Node 22 runs ESM natively, so no extra config needed.
 ************************************************************/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AutoHide Pro running on port ${PORT}`);
});
