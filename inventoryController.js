import { shopifyApi } from "@shopify/shopify-api";
import db from "../db/database.js";

export const handleInventoryUpdate = async (topic, shop, body) => {
  const payload = JSON.parse(body);

  const inventory = payload.available;
  const productId = payload.inventory_item_id;

  const shopData = await new Promise((resolve) => {
    db.get("SELECT * FROM shops WHERE shop_domain = ?", [shop], (err, row) => {
      resolve(row);
    });
  });

  if (!shopData) return;

  const client = new shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SCOPES.split(","),
    hostName: process.env.HOST.replace("https://", "")
  });

  const rest = new client.clients.Rest({ session: {
    shop,
    accessToken: shopData.access_token
  }});

  // Hide product if inventory is 0
  if (inventory <= 0) {
    await rest.put({
      path: `products/${payload.product_id}`,
      data: { product: { id: payload.product_id, status: "draft" } }
    });
  }

  // Reactivate product if restocked
  if (inventory > 0) {
    await rest.put({
      path: `products/${payload.product_id}`,
      data: { product: { id: payload.product_id, status: "active" } }
    });
  }
};