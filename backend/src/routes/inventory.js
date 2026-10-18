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

/*
  Purchase and sale totals are derived from the movement ledger, which is
  the single source of truth for stock changes. The stored "total_*"
  columns do not exist in this database; the ledger always does.
*/
const ITEM_TOTALS_JOIN = `
  LEFT JOIN (
    SELECT
      im.item_id,

      SUM(CASE WHEN im.movement_type = 'received' THEN im.quantity ELSE 0 END)::int AS total_purchased,
      SUM(CASE WHEN im.movement_type = 'issued' THEN im.quantity ELSE 0 END)::int AS total_sold,

      SUM(
        CASE WHEN im.movement_type = 'received'
          THEN im.quantity * COALESCE(im.unit_price, 0)
          ELSE 0
        END
      )::numeric AS total_spent,

      SUM(
        CASE WHEN im.movement_type = 'issued'
          THEN im.quantity * COALESCE(im.unit_price, 0)
          ELSE 0
        END
      )::numeric AS total_earned

    FROM inventory_movements im
    WHERE im.is_voided = FALSE
    GROUP BY im.item_id
  ) mv ON mv.item_id = ii.id
`;

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
    COALESCE(ii.unit_cost, ii.cost_price, 0) AS purchase_price,
    ii.selling_price,
    COALESCE(ii.unit_cost, ii.cost_price, 0) AS unit_cost,
    COALESCE(mv.total_purchased, 0) AS total_purchased,
    COALESCE(mv.total_sold, 0) AS total_sold,
    COALESCE(mv.total_spent, 0) AS total_spent,
    COALESCE(mv.total_earned, 0) AS total_earned,
    ii.created_at,
    ii.updated_at

  FROM inventory_items ii
  LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
  ${ITEM_TOTALS_JOIN}
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
          SUM(COALESCE(mv.total_spent, 0))::numeric AS total_spent,
          SUM(COALESCE(mv.total_earned, 0))::numeric AS total_earned,
          SUM(ii.current_stock * COALESCE(ii.unit_cost, ii.cost_price, 0))::numeric AS inventory_value,
          SUM(ii.current_stock * ii.selling_price)::numeric AS expected_revenue,
          SUM(COALESCE(mv.total_earned, 0) - COALESCE(mv.total_spent, 0))::numeric AS actual_profit,
          SUM(
            ii.current_stock * ii.selling_price
            - ii.current_stock * COALESCE(ii.unit_cost, ii.cost_price, 0)
          )::numeric AS expected_profit

        FROM inventory_items ii
        ${ITEM_TOTALS_JOIN}
        WHERE ii.is_active = TRUE
          AND COALESCE(ii.unit_cost, ii.cost_price, 0) > 0
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

    // Movement history is also the purchase/sale ledger.
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

    const transactions = movementsResult.rows.map((row) => ({
      id: Number(row.id),
      item_id: itemId,
      item_name: item.name || null,
      transaction_type: row.movement_type === "issued" ? "sale" : "purchase",
      quantity: Number(row.quantity),
      unit_cost: roundMoney(row.unit_price || 0),
      total_cost: roundMoney(
        Number(row.quantity) * Number(row.unit_price || 0),
      ),
      selling_price:
        row.movement_type === "issued" ? roundMoney(row.unit_price || 0) : 0,
      total_revenue:
        row.movement_type === "issued"
          ? roundMoney(Number(row.quantity) * Number(row.unit_price || 0))
          : 0,
      notes: row.notes || null,
      created_by_user_id: row.created_by_user_id
        ? Number(row.created_by_user_id)
        : null,
      created_by_name: row.created_by_name || null,
      created_at: row.created_at,
    }));

    res.json({
      item: normalizeItem(item),
      financials,
      transactions,
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

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const inserted = await client.query(
        `
          INSERT INTO inventory_items (
            name,
            current_stock,
            minimum_stock_level,
            unit_cost,
            selling_price,
            category_id,
            supplier,
            unit,
            edition,
            chapter,
            is_active,
            created_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11)
          RETURNING id
        `,
        [
          name,
          currentStock,
          minimumStock,
          purchasePrice,
          sellingPrice,
          categoryId || null,
          supplier || null,
          unit || null,
          edition || null,
          chapter || null,
          req.user.id,
        ],
      );

      // Record the initial stock in the movement ledger.
      if (currentStock > 0 && purchasePrice > 0) {
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
        `SELECT id, name, current_stock, selling_price, unit_cost
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

      // Update item. Purchased totals are derived from the ledger.
      await client.query(
        `
          UPDATE inventory_items
          SET
            current_stock = $1,
            unit_cost = $2,
            updated_at = NOW()
          WHERE id = $3
        `,
        [newStock, unitCost, itemId],
      );

      // Record the restock in the movement ledger.
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
        `SELECT id, name, current_stock, selling_price
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

      // Update item. Sold totals are derived from the ledger.
      await client.query(
        `
          UPDATE inventory_items
          SET
            current_stock = $1,
            updated_at = NOW()
          WHERE id = $2
        `,
        [newStock, itemId],
      );

      // Record the sale in the movement ledger.
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
          im.id,
          im.quantity,
          im.unit_price,
          im.notes,
          im.created_by_user_id,
          u.full_name AS created_by_name,
          im.created_at

        FROM inventory_movements im
        LEFT JOIN users u ON u.id = im.created_by_user_id
        WHERE im.item_id = $1
          AND im.movement_type = 'received'
          AND im.is_voided = FALSE
        ORDER BY im.created_at DESC, im.id DESC
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
        transaction_type: "restock",
        quantity: Number(row.quantity),
        unit_cost: roundMoney(row.unit_price || 0),
        total_cost: roundMoney(
          Number(row.quantity) * Number(row.unit_price || 0),
        ),
        selling_price: 0,
        notes: row.notes || null,
        created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : null,
        created_by_name: row.created_by_name || null,
        created_at: row.created_at,
      })),
    });
  }),
);

module.exports = router;
