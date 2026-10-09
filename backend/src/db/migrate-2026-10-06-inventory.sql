-- ============================================================
-- SABAWOON — BOOKS & MATERIALS INVENTORY
--
-- Safe, additive migration.
--
-- WHY
--
--   The academy needs to track the materials it buys and hands
--   out: books, stationery, cleaning supplies, office supplies,
--   teaching materials and equipment.
--
--   The existing `inventory_items` and `inventory_movements`
--   tables were book-only stubs that were never wired to any API.
--   They are extended here rather than replaced, so nothing that
--   exists today is lost.
--
--   DESIGN
--
--     inventory_categories
--       The "holder" a material belongs to. Managed from the
--       interface, so the list is never hardcoded.
--
--     inventory_items
--       One row per material the academy owns.
--
--     inventory_movements
--       Every physical change to an item: receive, issue or
--       adjustment. This is the ledger. Quantities and values
--       are always derived from it, so the stock level can never
--       drift away from the movement history.
--
-- SAFETY
--
--   * No existing row is deleted.
--   * `cost_price` is kept untouched for backwards compatibility;
--     `unit_cost` is the new canonical purchase cost per unit.
--   * All new columns are nullable or defaulted, so existing
--     items stay valid.
--   * Safe to run repeatedly.
-- ============================================================

-- Preserve any existing inventory tables and provide the minimal source tables
-- for fresh installations before the additive column upgrades below.
CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  edition VARCHAR(100),
  chapter VARCHAR(100),
  cost_price NUMERIC(12,2) DEFAULT 0,
  selling_price NUMERIC(12,2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL,
  movement_type VARCHAR(20) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(12,2),
  counterparty VARCHAR(150),
  notes TEXT,
  student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
  is_voided BOOLEAN NOT NULL DEFAULT FALSE,
  void_reason TEXT,
  voided_at TIMESTAMPTZ,
  voided_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 1. Category holders (Books, Stationery, ...).

CREATE TABLE IF NOT EXISTS inventory_categories (
  id SERIAL PRIMARY KEY,

  name VARCHAR(80) NOT NULL UNIQUE,

  description TEXT,

  sort_order INTEGER NOT NULL DEFAULT 0,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ
);

INSERT INTO inventory_categories (name, description, sort_order)
VALUES
  ('Books', 'Course books, workbooks and printed reading material', 1),
  ('Stationery', 'Pens, pencils, notebooks, files and paper', 2),
  ('Cleaning Supplies', 'Cleaning materials and hygiene supplies', 3),
  ('Office Supplies', 'General office consumables', 4),
  ('Teaching Materials', 'Whiteboards, markers, charts and classroom aids', 5),
  ('Equipment', 'Furniture, appliances and durable equipment', 6)
ON CONFLICT (name) DO NOTHING;

-- 2. Extend the item with the real-world fields.

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS category_id INTEGER;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS code VARCHAR(60);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS supplier VARCHAR(150);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit VARCHAR(30);

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2)
  DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS minimum_stock_level INTEGER
  DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS quantity_received INTEGER
  DEFAULT 0;

-- Financial tracking for Books & Materials
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS selling_price NUMERIC(12,2);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS total_purchased INTEGER DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS total_sold INTEGER DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12,2) DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS total_earned NUMERIC(12,2) DEFAULT 0;

-- Stock on hand. Always maintained from inventory_movements in the
-- same transaction as every movement.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS current_stock INTEGER
  DEFAULT 0;

-- Financial fields for Books & Materials
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS selling_price NUMERIC(12,2);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12,2) DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS total_earned NUMERIC(12,2) DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS total_purchased INTEGER DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS total_sold INTEGER DEFAULT 0;

-- 1 = the "issue / selling price" already stored as selling_price.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_items_category_fkey'
  ) THEN
    ALTER TABLE inventory_items
      ADD CONSTRAINT inventory_items_category_fkey
      FOREIGN KEY (category_id)
      REFERENCES inventory_categories(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_code
  ON inventory_items(code)
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_category
  ON inventory_items(category_id);

-- 3. Extend the movement ledger with a real date and an audit trail.

ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS item_id INTEGER;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS movement_type VARCHAR(20);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS quantity INTEGER;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS counterparty VARCHAR(150);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS student_id INTEGER;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS is_voided BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS voided_by_user_id INTEGER;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS movement_date DATE
  DEFAULT CURRENT_DATE;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS reference VARCHAR(80);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS performed_by_user_id INTEGER;

-- 3b. Add financial tracking fields to movements
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12,2);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS selling_price NUMERIC(12,2);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS total_revenue NUMERIC(12,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_movements_item_fkey'
  ) THEN
    ALTER TABLE inventory_movements
      ADD CONSTRAINT inventory_movements_item_fkey
      FOREIGN KEY (item_id)
      REFERENCES inventory_items(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_movements_performed_by_fkey'
  ) THEN
    ALTER TABLE inventory_movements
      ADD CONSTRAINT inventory_movements_performed_by_fkey
      FOREIGN KEY (performed_by_user_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_item
  ON inventory_movements(item_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_date
  ON inventory_movements(movement_date DESC);

-- 6. Inventory transactions table for detailed purchase/restock/sales history
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase', 'restock', 'sale', 'adjustment')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2),
  total_revenue NUMERIC(12,2),
  movement_id INTEGER REFERENCES inventory_movements(id) ON DELETE SET NULL,
  notes TEXT,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item
  ON inventory_transactions(item_id);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type
  ON inventory_transactions(transaction_type);

-- 4. Movement types are a closed set so the ledger stays readable.
--
--    The vocabulary already used by the existing
--    inventory_items_prevent_negative_stock() trigger is kept:
--    'received' adds stock, 'issued' and 'adjusted' remove it.

-- Normalize the former short names before enforcing the current ledger vocabulary.
UPDATE inventory_movements
SET movement_type = CASE movement_type
  WHEN 'receive' THEN 'received'
  WHEN 'issue' THEN 'issued'
  ELSE movement_type
END
WHERE movement_type IN ('receive', 'issue');
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_movements_type_check'
  ) THEN
    ALTER TABLE inventory_movements
      DROP CONSTRAINT inventory_movements_type_check;
  END IF;

  ALTER TABLE inventory_movements
    ADD CONSTRAINT inventory_movements_type_check
    CHECK (movement_type IN ('received', 'issued', 'adjusted'));
END
$$;

-- 5. Backfill stock totals for any item that already had movements.

UPDATE inventory_items ii
SET
  current_stock = totals.stock,
  quantity_received = totals.received
FROM (
  SELECT
    im.item_id,

    SUM(
      CASE
        WHEN im.movement_type = 'received' THEN im.quantity
        WHEN im.movement_type = 'issued' THEN -im.quantity
        ELSE 0
      END
    ) AS stock,

    SUM(
      CASE WHEN im.movement_type = 'received' THEN im.quantity ELSE 0 END
    ) AS received

  FROM inventory_movements im
  WHERE im.is_voided = FALSE
  GROUP BY im.item_id
) totals
WHERE ii.id = totals.item_id;
