const express = require("express");

const { query, pool } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");

const asyncH = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const router = express.Router();

/* ==========================================================================
   BOOKS & MATERIALS - FINANCIAL INVENTORY MANAGEMENT

   Finance -> Books & Materials.

   Tracks books/chapters/materials as real inventory with full financial
   tracking: purchase costs, selling prices, restock history, sales history,
   and financial summaries.

   Finance is administrator-only.

   All financial calculations are derived from real database records.
========================================================================== */

/* ==========================================================================
   HELPERS
========================================================================== */

function parseId(value) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

function cleanText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

/*
  Quantities are whole, non-negative numbers. A missing value falls
  back to the supplied default instead of failing.
*/
function parseQuantity(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || !Number.isInteger(number)) {
    return null;
  }

  return number;
}

/*
  Monetary values must be finite numbers.
*/
function parseMoney(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return Number(number.toFixed(2));
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeItem(row) {
  if (!row) return null;

  const currentStock = Number(row.current_stock || 0);
  const minimumStock = Number(row.minimum_stock_level || 0);

  return {
    id: Number(row.id),
    name: row.name,
    code: row.code || null,
    category_id: row.category_id ? Number(row.category_id) : null,
    category_name: row.category_name || null,
    supplier: row.supplier || null,
    unit: row.unit || null,
    edition: row.edition || null,
    chapter: row.chapter || null,

    current_stock: currentStock,
    minimum_stock_level: minimumStock,
    is_low_stock: minimumStock > 0 && currentStock < minimumStock,

    purchase_price: roundMoney(row.purchase_price || 0),
    selling_price: roundMoney(row.selling_price || 0),
    unit_cost: roundMoney(row.unit_cost || 0),

    total_purchased: Number(row.total_purchased || 0),
    total_sold: Number(row.total_sold || 0),
    total_spent: roundMoney(row.total_spent || 0),
    total_earned: roundMoney(row.total_earned || 0),

    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeTransaction(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    item_id: Number(row.item_id),
    item_name: row.item_name || null,
    transaction_type: row.transaction_type,
    quantity: Number(row.quantity),
    unit_cost: roundMoney(row.unit_cost || 0),
    total_cost: roundMoney(row.total_cost || 0),
    selling_price: roundMoney(row.selling_price || 0),
    total_revenue: roundMoney(row.total_revenue || 0),
    notes: row.notes || null,
    created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    created_by_name: row.created_by_name || null,
    created_at: row.created_at,
  };
}

function normalizeItemFinancials(row) {
  if (!row) return null;

  const currentStock = Number(row.current_stock || 0);
  const totalPurchased = Number(row.total_purchased || 0);
  const totalSold = Number(row.total_sold || 0);
  const totalSpent = roundMoney(row.total_spent || 0);
  const totalEarned = roundMoney(row.total_earned || 0);
  const purchasePrice = roundMoney(row.purchase_price || 0);
  const sellingPrice = roundMoney(row.selling_price || 0);

  const expectedRevenue = roundMoney(currentStock * sellingPrice);
  const costOfCurrentInventory = roundMoney(currentStock * purchasePrice);
  const expectedProfit = roundMoney(expectedRevenue - costOfCurrentInventory);
  const actualProfit = roundMoney(totalEarned - totalSpent);

  return {
    id: Number(row.id),
    name: row.name,
    current_stock: currentStock,
    total_purchased: totalPurchased,
    total_sold: totalSold,
    purchase_price: purchasePrice,
    selling_price: sellingPrice,
    total_spent: totalSpent,
    total_earned: totalEarned,
    expected_revenue: expectedRevenue,
    expected_profit: expectedProfit,
    actual_profit: actualProfit,
    inventory_value: costOfCurrentInventory,
    is_low_stock: (Number(row.minimum_stock_level || 0) > 0) && currentStock < Number(row.minimum_stock_level || 0),
  };
}

const ITEM_SELECT = `
  SELECT
    ii.id,
    ii.name,
    ii.code,
    ii.category_id,
    ic.name AS category_name,
    ii.supplier,
    ii.unit,
    ii.edition,
    ii.chapter,
    ii.current_stock,
    ii.minimum_stock_level,
    ii.purchase_price,
    ii.selling_price,
    ii.unit_cost,
    ii.total_purchased,
    ii.total_sold,
    ii.total_spent,
    ii.total_earned,
    ii.created_at,
    ii.updated_at

  FROM inventory_items ii
  LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
`;

/* ==========================================================================
   READ THE CURRENT ITEMS
========================================================================== */

router.get(
  "/items",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const result = await query(
      `
        ${ITEM_SELECT}

        WHERE ii.is_active = TRUE

        ORDER BY ii.name ASC, ii.id ASC
      `,
    );

    res.json(result.rows.map(normalizeItem));
  }),
);

/* ==========================================================================
   GET FINANCIAL SUMMARY FOR ALL ITEMS
========================================================================== */

router.get(
  "/financial-summary",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const result = await query(
      `
        SELECT
          COUNT(*)::int AS total_items,
          SUM(ii.current_stock)::int AS total_stock,
          SUM(ii.total_spent)::numeric AS total_spent,
          SUM(ii.total_earned)::numeric AS total_earned,
          SUM(ii.current_stock * ii.purchase_price)::numeric AS inventory_value,
          SUM(ii.current_stock * ii.selling_price)::numeric AS expected_revenue,
          SUM(ii.total_earned - ii.total_spent)::numeric AS actual_profit,
          SUM(ii.current_stock * ii.selling_price - ii.current_stock * ii.purchase_price)::numeric AS expected_profit

        FROM inventory_items ii
        WHERE ii.is_active = TRUE
          AND ii.purchase_price > 0
      `,
    );

    const row = result.rows[0];

    res.json({
      total_items: Number(row.total_items || 0),
      total_stock: Number(row.total_stock || 0),
      total_spent: roundMoney(row.total_spent),
      total_earned: roundMoney(row.total_earned),
      inventory_value: roundMoney(row.inventory_value),
      expected_revenue: roundMoney(row.expected_revenue),
      actual_profit: roundMoney(row.actual_profit),
      expected_profit: roundMoney(row.expected_profit),
    });
  }),
);

/* ==========================================================================
   GET FINANCIAL DETAILS FOR A SINGLE ITEM
========================================================================== */

router.get(
  "/items/:id/financials",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const itemId = parseId(req.params.id);

    if (!itemId) {
      return res.status(400).json({ error: "Invalid item." });
    }

    const itemResult = await query(
      `${ITEM_SELECT}
       WHERE ii.id = $1 AND ii.is_active = TRUE`,
      [itemId],
    );

    if (!itemResult.rows.length) {
      return res.status(404).json({ error: "Item not found." });
    }

    const item = itemResult.rows[0];

    // Get transactions (purchase/restock/sales history)
    const transactionsResult = await query(
      `
        SELECT
          it.id,
          it.item_id,
          it.transaction_type,
          it.quantity,
          it.unit_cost,
          it.total_cost,
          it.selling_price,
          it.total_revenue,
          it.notes,
          it.created_by_user_id,
          u.full_name AS created_by_name,
          it.created_at

        FROM inventory_transactions it
        LEFT JOIN users u ON u.id = it.created_by_user_id
        WHERE it.item_id = $1
        ORDER BY it.created_at DESC, it.id DESC
      `,
      [itemId],
    );

    // Get movement history (for restock/sales details)
    const movementsResult = await query(
      `
        SELECT
          im.id,
          im.movement_type,
          im.quantity,
          im.unit_price,
          im.notes,
          im.movement_date,
          im.created_by_user_id,
          u.full_name AS created_by_name,
          im.created_at

        FROM inventory_movements im
        LEFT JOIN users u ON u.id = im.created_by_user_id
        WHERE im.item_id = $1
          AND im.is_voided = FALSE
        ORDER BY im.movement_date DESC, im.id DESC
      `,
      [itemId],
    );

    const financials = normalizeItemFinancials(item);

    res.json({
      item: normalizeItem(item),
      financials,
      transactions: transactionsResult.rows.map(normalizeTransaction),
      movements: movementsResult.rows.map((row) => ({
        id: Number(row.id),
        movement_type: row.movement_type,
        quantity: Number(row.quantity),
        unit_price: roundMoney(row.unit_price || 0),
        notes: row.notes || null,
        movement_date: row.movement_date,
        created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : null,
        created_by_name: row.created_by_name || null,
        created_at: row.created_at,
      })),
    });
  }),
);

/* ==========================================================================
   ADD A BOOK / CHAPTER WITH FINANCIAL INFO
========================================================================== */

router.post(
  "/items",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const name = cleanText(req.body?.name);

    if (!name) {
      return res.status(400).json({
        error: "Item name is required.",
        code: "ITEM_NAME_REQUIRED",
      });
    }

    if (name.length > 200) {
      return res.status(400).json({
        error: "Item name must be 200 characters or fewer.",
        code: "ITEM_NAME_TOO_LONG",
      });
    }

    const currentStock = parseQuantity(req.body?.current_stock, 0);

    if (currentStock === null || currentStock < 0) {
      return res.status(400).json({
        error: "Current quantity must be a whole number that is zero or more.",
        code: "INVALID_CURRENT_STOCK",
      });
    }

    const minimumStock = parseQuantity(req.body?.minimum_stock_level, 0);

    if (minimumStock === null || minimumStock < 0) {
      return res.status(400).json({
        error: "Minimum quantity must be a whole number that is zero or more.",
        code: "INVALID_MINIMUM_STOCK",
      });
    }

    const purchasePrice = parseMoney(req.body?.purchase_price);

    if (purchasePrice === null) {
      return res.status(400).json({
        error: "Purchase price per unit must be a valid non-negative number.",
        code: "INVALID_PURCHASE_PRICE",
      });
    }

    const sellingPrice = parseMoney(req.body?.selling_price);

    if (sellingPrice === null) {
      return res.status(400).json({
        error: "Selling price per unit must be a valid non-negative number.",
        code: "INVALID_SELLING_PRICE",
      });
    }

    const categoryId = parseId(req.body?.category_id);
    const supplier = cleanText(req.body?.supplier);
    const unit = cleanText(req.body?.unit);
    const edition = cleanText(req.body?.edition);
    const chapter = cleanText(req.body?.chapter);

    // Calculate totals
    const totalPurchaseCost = roundMoney(currentStock * purchasePrice);
    const expectedRevenue = roundMoney(currentStock * sellingPrice);
    const expectedProfit = roundMoney(expectedRevenue - totalPurchaseCost);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const inserted = await client.query(
        `
          INSERT INTO inventory_items (
            name,
            current_stock,
            minimum_stock_level,
            purchase_price,
            selling_price,
            unit_cost,
            total_purchased,
            total_sold,
            total_spent,
            total_earned,
            category_id,
            supplier,
            unit,
            edition,
            chapter,
            is_active,
            created_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $4, $2, 0, $6, $7, $8, $9, $10, $11, $12, TRUE, $13)
          RETURNING id
        `,
        [
          name,
          currentStock,
          minimumStock,
          purchasePrice,
          sellingPrice,
          totalPurchaseCost,
          expectedRevenue,
          categoryId || null,
          supplier || null,
          unit || null,
          edition || null,
          chapter || null,
          req.user.id,
        ],
      );

      // Create initial purchase transaction if stock > 0
      if (currentStock > 0 && purchasePrice > 0) {
        await client.query(
          `
            INSERT INTO inventory_transactions (
              item_id,
              transaction_type,
              quantity,
              unit_cost,
              total_cost,
              selling_price,
              created_by_user_id,
              notes
            )
            VALUES ($1, 'purchase', $2, $3, $4, $5, $6, $7)
          `,
          [
            inserted.rows[0].id,
            currentStock,
            purchasePrice,
            totalPurchaseCost,
            expectedRevenue,
            req.user.id,
            `Initial purchase: ${currentStock} units @ ${purchasePrice} AFN/unit`,
          ],
        );

        // Create corresponding movement
        await client.query(
          `
            INSERT INTO inventory_movements (
              item_id,
              movement_type,
              quantity,
              unit_price,
              movement_date,
              created_by_user_id,
              notes
            )
            VALUES ($1, 'received', $2, $3, CURRENT_DATE, $4, $5)
          `,
          [
            inserted.rows[0].id,
            currentStock,
            purchasePrice,
            req.user.id,
            `Initial stock: ${currentStock} units`,
          ],
        );
      }

      await client.query("COMMIT");

      const created = await query(
        `${ITEM_SELECT}
         WHERE ii.id = $1`,
        [inserted.rows[0].id],
      );

      res.status(201).json(normalizeItem(created.rows[0]));
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }),
);

/* ==========================================================================
   EDIT AN ITEM
========================================================================== */

router.put(
  "/items/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const itemId = parseId(req.params.id);

    if (!itemId) {
      return res.status(400).json({ error: "Invalid item." });
    }

    const existing = await query(
      `${ITEM_SELECT}
       WHERE ii.id = $1`,
      [itemId],
    );

    if (!existing.rows.length) {
      return res.status(404).json({ error: "Item not found." });
    }

    const current = existing.rows[0];

    const name =
      req.body?.name === undefined ? current.name : cleanText(req.body?.name);

    if (!name) {
      return res.status(400).json({
        error: "Item name is required.",
        code: "ITEM_NAME_REQUIRED",
      });
    }

    if (name.length > 200) {
      return res.status(400).json({
        error: "Item name must be 200 characters or fewer.",
        code: "ITEM_NAME_TOO_LONG",
      });
    }

    const currentStock = parseQuantity(
      req.body?.current_stock,
      Number(current.current_stock || 0),
    );

    if (currentStock === null || currentStock < 0) {
      return res.status(400).json({
        error: "Current quantity must be a whole number that is zero or more.",
        code: "INVALID_CURRENT_STOCK",
      });
    }

    const minimumStock = parseQuantity(
      req.body?.minimum_stock_level,
      Number(current.minimum_stock_level || 0),
    );

    if (minimumStock === null || minimumStock < 0) {
      return res.status(400).json({
        error: "Minimum quantity must be a whole number that is zero or more.",
        code: "INVALID_MINIMUM_STOCK",
      });
    }

    const purchasePrice = parseMoney(req.body?.purchase_price, Number(current.purchase_price || 0));
    const sellingPrice = parseMoney(req.body?.selling_price, Number(current.selling_price || 0));
    const categoryId = parseId(req.body?.category_id) || null;
    const supplier = cleanText(req.body?.supplier);
    const unit = cleanText(req.body?.unit);
    const edition = cleanText(req.body?.edition);
    const chapter = cleanText(req.body?.chapter);

    const updated = await query(
      `
        UPDATE inventory_items
        SET
          name = $1,
          current_stock = $2,
          minimum_stock_level = $3,
          purchase_price = $4,
          selling_price = $5,
          unit_cost = $4,
          category_id = $6,
          supplier = $7,
          unit = $8,
          edition = $9,
          chapter = $10,
          updated_at = NOW()
        WHERE id = $11
        RETURNING id
      `,
      [
        name,
        currentStock,
        minimumStock,
        purchasePrice,
        sellingPrice,
        categoryId,
        supplier || null,
        unit || null,
        edition || null,
        chapter || null,
        itemId,
      ],
    );

    const row = await query(
      `${ITEM_SELECT}
       WHERE ii.id = $1`,
      [updated.rows[0].id],
    );

    res.json(normalizeItem(row.rows[0]));
  }),
);

/* ==========================================================================
   REMOVE AN ITEM
========================================================================== */

router.delete(
  "/items/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const itemId = parseId(req.params.id);

    if (!itemId) {
      return res.status(400).json({ error: "Invalid item." });
    }

    const result = await query(
      `
        DELETE FROM inventory_items
        WHERE id = $1
        RETURNING id
      `,
      [itemId],
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Item not found." });
    }

    res.json({ ok: true, id: Number(result.rows[0].id) });
  }),
);

/* ==========================================================================
   RESTOCK AN ITEM

   Adds quantity to an item with a specific purchase price.
   Preserves historical purchase records.
========================================================================== */

router.post(
  "/items/:id/restock",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const itemId = parseId(req.params.id);

    if (!itemId) {
      return res.status(400).json({ error: "Invalid item." });
    }

    const quantity = parseQuantity(req.body?.quantity);

    if (quantity === null || quantity < 1) {
      return res.status(400).json({
        error: "Restock quantity must be a positive whole number.",
        code: "INVALID_RESTOCK_QUANTITY",
      });
    }

    const unitCost = parseMoney(req.body?.unit_cost);

    if (unitCost === null) {
      return res.status(400).json({
        error: "Unit cost must be a valid non-negative number.",
        code: "INVALID_UNIT_COST",
      });
    }

    const notes = cleanText(req.body?.notes);

    const totalCost = roundMoney(quantity * unitCost);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Get current item with lock
      const itemResult = await client.query(
        `SELECT id, name, current_stock, total_purchased, total_spent, purchase_price, selling_price, unit_cost
         FROM inventory_items
         WHERE id = $1 AND is_active = TRUE
         FOR UPDATE`,
        [itemId],
      );

      if (!itemResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Item not found." });
      }

      const item = itemResult.rows[0];

      const newStock = Number(item.current_stock) + quantity;
      const newTotalPurchased = Number(item.total_purchased) + quantity;
      const newTotalSpent = roundMoney(Number(item.total_spent) + totalCost);

      // Update item
      const updated = await client.query(
        `
          UPDATE inventory_items
          SET
            current_stock = $1,
            total_purchased = $2,
            total_spent = $3,
            unit_cost = $4,
            updated_at = NOW()
          WHERE id = $5
          RETURNING id, name, current_stock, total_purchased, total_spent
        `,
        [newStock, newTotalPurchased, newTotalSpent, unitCost, itemId],
      );

      // Create transaction record
      await client.query(
        `
          INSERT INTO inventory_transactions (
            item_id,
            transaction_type,
            quantity,
            unit_cost,
            total_cost,
            selling_price,
            created_by_user_id,
            notes
          )
          VALUES ($1, 'restock', $2, $3, $4, $5, $6, $7)
        `,
        [
          itemId,
          quantity,
          unitCost,
          totalCost,
          roundMoney(quantity * Number(updated.rows[0].selling_price || 0)),
          req.user.id,
          notes || `Restock: ${quantity} units @ ${unitCost} AFN/unit`,
        ],
      );

      // Create movement record
      await client.query(
        `
          INSERT INTO inventory_movements (
            item_id,
            movement_type,
            quantity,
            unit_price,
            movement_date,
            created_by_user_id,
            notes
          )
          VALUES ($1, 'received', $2, $3, CURRENT_DATE, $4, $5)
        `,
        [
          itemId,
          quantity,
          unitCost,
          req.user.id,
          notes || `Restock: ${quantity} units @ ${unitCost} AFN/unit`,
        ],
      );

      await client.query("COMMIT");

      const updatedItem = await query(
        `${ITEM_SELECT}
         WHERE ii.id = $1`,
        [itemId],
      );

      res.json({
        message: "Item restocked successfully.",
        item: normalizeItem(updatedItem.rows[0]),
        restock: {
          quantity,
          unit_cost: unitCost,
          total_cost: totalCost,
          new_stock: newStock,
          money_needed: totalCost,
        },
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }),
);

/* ==========================================================================
   RECORD A SALE

   Reduces stock and records revenue.
========================================================================== */

router.post(
  "/items/:id/sell",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const itemId = parseId(req.params.id);

    if (!itemId) {
      return res.status(400).json({ error: "Invalid item." });
    }

    const quantity = parseQuantity(req.body?.quantity);

    if (quantity === null || quantity < 1) {
      return res.status(400).json({
        error: "Sale quantity must be a positive whole number.",
        code: "INVALID_SALE_QUANTITY",
      });
    }

    const sellingPrice = parseMoney(req.body?.selling_price);

    if (sellingPrice === null) {
      return res.status(400).json({
        error: "Selling price must be a valid non-negative number.",
        code: "INVALID_SELLING_PRICE",
      });
    }

    const notes = cleanText(req.body?.notes);
    const studentId = parseId(req.body?.student_id);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Get current item with lock
      const itemResult = await client.query(
        `SELECT id, name, current_stock, total_sold, total_earned, selling_price, purchase_price
         FROM inventory_items
         WHERE id = $1 AND is_active = TRUE
         FOR UPDATE`,
        [itemId],
      );

      if (!itemResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Item not found." });
      }

      const item = itemResult.rows[0];

      if (Number(item.current_stock) < quantity) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Insufficient stock. Available: ${item.current_stock}, Requested: ${quantity}`,
          code: "INSUFFICIENT_STOCK",
        });
      }

      const totalRevenue = roundMoney(quantity * sellingPrice);
      const newStock = Number(item.current_stock) - quantity;
      const newTotalSold = Number(item.total_sold) + quantity;
      const newTotalEarned = roundMoney(Number(item.total_earned) + totalRevenue);

      // Update item
      const updated = await client.query(
        `
          UPDATE inventory_items
          SET
            current_stock = $1,
            total_sold = $2,
            total_earned = $3,
            updated_at = NOW()
          WHERE id = $4
          RETURNING id, name, current_stock, total_sold, total_earned
        `,
        [newStock, newTotalSold, newTotalEarned, itemId],
      );

      // Create transaction record
      await client.query(
        `
          INSERT INTO inventory_transactions (
            item_id,
            transaction_type,
            quantity,
            selling_price,
            total_revenue,
            created_by_user_id,
            notes
          )
          VALUES ($1, 'sale', $2, $3, $4, $5, $6)
        `,
        [
          itemId,
          quantity,
          sellingPrice,
          totalRevenue,
          req.user.id,
          notes || `Sale: ${quantity} units @ ${sellingPrice} AFN/unit`,
        ],
      );

      // Create movement record
      await client.query(
        `
          INSERT INTO inventory_movements (
            item_id,
            movement_type,
            quantity,
            unit_price,
            movement_date,
            created_by_user_id,
            student_id,
            notes
          )
          VALUES ($1, 'issued', $2, $3, CURRENT_DATE, $4, $5, $6)
        `,
        [
          itemId,
          quantity,
          sellingPrice,
          req.user.id,
          studentId || null,
          notes || `Sale: ${quantity} units @ ${sellingPrice} AFN/unit`,
        ],
      );

      await client.query("COMMIT");

      const updatedItem = await query(
        `${ITEM_SELECT}
         WHERE ii.id = $1`,
        [itemId],
      );

      res.json({
        message: "Sale recorded successfully.",
        item: normalizeItem(updatedItem.rows[0]),
        sale: {
          quantity,
          selling_price: sellingPrice,
          total_revenue: totalRevenue,
          new_stock: newStock,
        },
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }),
);

/* ==========================================================================
   GET RESTOCK HISTORY FOR AN ITEM
========================================================================== */

router.get(
  "/items/:id/restock-history",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const itemId = parseId(req.params.id);

    if (!itemId) {
      return res.status(400).json({ error: "Invalid item." });
    }

    const itemResult = await query(
      `SELECT id, name FROM inventory_items WHERE id = $1 AND is_active = TRUE`,
      [itemId],
    );

    if (!itemResult.rows.length) {
      return res.status(404).json({ error: "Item not found." });
    }

    const transactionsResult = await query(
      `
        SELECT
          it.id,
          it.transaction_type,
          it.quantity,
          it.unit_cost,
          it.total_cost,
          it.selling_price,
          it.total_revenue,
          it.notes,
          it.created_by_user_id,
          u.full_name AS created_by_name,
          it.created_at

        FROM inventory_transactions it
        LEFT JOIN users u ON u.id = it.created_by_user_id
        WHERE it.item_id = $1
          AND it.transaction_type IN ('purchase', 'restock')
        ORDER BY it.created_at DESC, it.id DESC
      `,
      [itemId],
    );

    res.json({
      item: {
        id: itemId,
        name: itemResult.rows[0].name,
      },
      restock_history: transactionsResult.rows.map((row) => ({
        id: Number(row.id),
        transaction_type: row.transaction_type,
        quantity: Number(row.quantity),
        unit_cost: roundMoney(row.unit_cost || 0),
        total_cost: roundMoney(row.total_cost || 0),
        selling_price: roundMoney(row.selling_price || 0),
        notes: row.notes || null,
        created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : null,
        created_by_name: row.created_by_name || null,
        created_at: row.created_at,
      })),
    });
  }),
);

module.exports = router;
