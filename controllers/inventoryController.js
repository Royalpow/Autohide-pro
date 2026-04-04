import { shopifyApi } from "@shopify/shopify-api";
import db from "../db/database.js";

export const handleInventoryUpdate = async (topic, shop, body) => {
  const payload = JSON.parse(body);

  const inventory = payload.available;
  const productId = payload.item?.product_id;

  if (!productId) return;

  const shopData = await new Promise((resolve) => {
    db.get("SELECT * FROM shops WHERE shop_domain = ?", [shop], (err, row) => {
      resolve(row);
    });
  });

  if (!shopData) return;

  const client = new shopifyApi.clients.Rest({
    session: {
      shop,
      accessToken: shopData.access_token,
    },
  });

  // Hide product if inventory is 0
  if (inventory <= 0) {
    await client.put({
      path: `products/${productId}`,
      data: { product: { id: productId, status: "draft" } },
    });
  }

  // Reactivate product if restocked
  if (inventory > 0) {
    await client.put({
      path: `products/${productId}`,
      data: { product: { id: productId, status: "active" } },
    });
  }
};