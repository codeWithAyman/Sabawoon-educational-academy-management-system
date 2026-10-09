import { useCallback, useEffect, useMemo, useState } from "react";
// toast removed - using useToast hook instead

import {
  AlertTriangle,
  BookOpen,
  Check,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  DollarSign,
  TrendingUp,
  History,
  Warehouse,
  CloudDownload,
  CloudUpload,
} from "lucide-react";

import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";

/* ============================================================
   BOOKS & MATERIALS - FINANCIAL INVENTORY MANAGEMENT

   Part of Finance. Tracks books/chapters/materials as real
   inventory with full financial tracking.

   Every number comes from the database. Nothing here is hardcoded.
============================================================ */

const EMPTY_FORM = {
  name: "",
  current_stock: "0",
  minimum_stock_level: "",
  purchase_price: "",
  selling_price: "",
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function getApiError(error, fallback) {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

/* ============================================================
   SMALL PIECES
============================================================ */

function StatCard({ icon: Icon, label, value, sublabel, tone = "slate" }) {
  const tones = {
    slate: "text-slate-300",
    amber: "text-amber-400",
    gold: "text-[#f2bd19]",
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#121519] px-4 py-3.5">
      <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.1em] text-gray-600">
        <Icon size={12} />

        {label}
      </div>

      <div className={`mt-2 text-lg font-semibold ${tones[tone]}`}>{value}</div>

      {sublabel && (
        <div className="mt-0.5 text-[10px] text-gray-600">{sublabel}</div>
      )}
    </div>
  );
}

function StockBadge({ item }) {
  if (item.is_low_stock) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold text-amber-300">
        <AlertTriangle size={11} />
        Low Stock
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-300">
      <Check size={11} />
      OK
    </span>
  );
}

function MoneyValue({ value, label, tone = "slate" }) {
  const tones = {
    slate: "text-slate-200",
    green: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
  };

  return (
    <div className="text-right">
      <div className={`text-sm font-semibold tabular-nums ${tones[tone]}`}>
        {formatMoney(value)}
      </div>
      {label && <div className="text-[9px] text-gray-600">{label}</div>}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121519] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">
              {title}
            </h2>

            {subtitle && (
              <p className="mt-1 text-[11px] text-gray-500">{subtitle}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-600 transition hover:bg-white/5 hover:text-gray-300"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, value, onChange, type = "text", placeholder, suffix }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-medium text-slate-400">
        {label}

        {hint && <span className="ml-1 text-gray-600">{hint}</span>}
      </span>

      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-white/[0.07] bg-[#0b0d10] px-3 py-2.5 text-[12px] text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-[#f2bd19]/50"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-600">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

/* ============================================================
   ADD / EDIT ITEM MODAL (with financial info)
============================================================ */

function ItemModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    item
      ? {
          name: item.name || "",
          current_stock: String(item.current_stock ?? 0),
          minimum_stock_level:
            Number(item.minimum_stock_level || 0) > 0
              ? String(item.minimum_stock_level)
              : "",
          purchase_price: item.purchase_price
            ? String(item.purchase_price)
            : "",
          selling_price: item.selling_price
            ? String(item.selling_price)
            : "",
        }
      : { ...EMPTY_FORM },
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const upd = (field) => (value) =>
    setForm((current) => ({ ...current, [field]: value }));

  const totalPurchaseCost = useMemo(() => {
    const qty = Number(form.current_stock || 0);
    const price = Number(form.purchase_price || 0);
    return qty * price;
  }, [form.current_stock, form.purchase_price]);

  const expectedRevenue = useMemo(() => {
    const qty = Number(form.current_stock || 0);
    const price = Number(form.selling_price || 0);
    return qty * price;
  }, [form.current_stock, form.selling_price]);

  const expectedProfit = useMemo(() => {
    return expectedRevenue - totalPurchaseCost;
  }, [expectedRevenue, totalPurchaseCost]);

  async function submit() {
    if (!form.name.trim()) {
      setError("Item name is required.");
      return;
    }

    const purchasePrice = Number(form.purchase_price || 0);
    const sellingPrice = Number(form.selling_price || 0);

    if (purchasePrice < 0 || sellingPrice < 0) {
      setError("Prices cannot be negative.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        current_stock: Number(form.current_stock || 0),
        minimum_stock_level: Number(form.minimum_stock_level || 0),
        purchase_price: purchasePrice,
        selling_price: sellingPrice,
      };

      if (item) {
        await api.put(`/inventory/items/${item.id}`, payload);
      } else {
        await api.post("/inventory/items", payload);
      }

      await onSaved();
    } catch (err) {
      setError(getApiError(err, "Unable to save this item."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={item ? "Edit Item" : "Add Book / Chapter"}
      subtitle="Add a book or chapter with purchase and selling prices."
      onClose={onClose}
    >
      <div className="space-y-3">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-[11px] text-red-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />

            {error}
          </div>
        )}

        <Field
          label="Book / Chapter name"
          value={form.name}
          onChange={upd("name")}
          placeholder="English Chapter 1"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Initial quantity"
            type="number"
            value={form.current_stock}
            onChange={upd("current_stock")}
            placeholder="0"
          />

          <Field
            label="Minimum quantity"
            hint="(optional)"
            type="number"
            value={form.minimum_stock_level}
            onChange={upd("minimum_stock_level")}
            placeholder="0"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Purchase price / unit"
            type="number"
            value={form.purchase_price}
            onChange={upd("purchase_price")}
            placeholder="0"
            suffix="AFN"
          />

          <Field
            label="Selling price / unit"
            type="number"
            value={form.selling_price}
            onChange={upd("selling_price")}
            placeholder="0"
            suffix="AFN"
          />
        </div>

        {/* Auto-calculated totals */}
        <div className="rounded-lg border border-white/[0.06] bg-[#0b0d10] p-3 space-y-2">
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">Total Purchase Cost</span>
            <span className="font-semibold text-slate-200">
              {formatMoney(totalPurchaseCost)} AFN
            </span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">Expected Revenue</span>
            <span className="font-semibold text-slate-200">
              {formatMoney(expectedRevenue)} AFN
            </span>
          </div>
          <div className="flex justify-between text-[11px] pt-1 border-t border-white/[0.04]">
            <span className="text-gray-500">Expected Profit</span>
            <span
              className={`font-semibold ${
                expectedProfit >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {formatMoney(expectedProfit)} AFN
            </span>
          </div>
        </div>

        <p className="text-[10px] text-gray-600 text-center">
          Totals are calculated automatically.
        </p>

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3.5 py-2 text-[11px] font-medium text-slate-300 transition hover:bg-white/5"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={submit}
            disabled={saving || !form.name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#f2bd19] px-3.5 py-2 text-[11px] font-semibold text-black transition hover:bg-[#dcae16] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Check size={13} strokeWidth={2.5} />
            )}

            {item ? "Save changes" : "Add Book / Chapter"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================================================
   REMOVE CONFIRMATION
============================================================ */

function RemoveModal({ item, onClose, onConfirm, removing }) {
  return (
    <Modal
      title="Remove Item"
      subtitle="This item is removed from the list."
      onClose={onClose}
    >
      <p className="text-[12px] text-slate-300">
        Remove{" "}
        <span className="font-semibold text-white">{item.name}</span>? It will
        no longer appear in Books &amp; Materials.
      </p>

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-white/[0.06] pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 px-3.5 py-2 text-[11px] font-medium text-slate-300 transition hover:bg-white/5"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={removing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3.5 py-2 text-[11px] font-semibold text-white transition hover:bg-red-400 disabled:opacity-50"
        >
          {removing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Trash2 size={13} />
          )}
          Remove
        </button>
      </div>
    </Modal>
  );
}

/* ============================================================
   MAIN PAGE
============================================================ */

export default function FinanceBooksMaterials() {
  const { user } = useAuth();
  const toast = useToast();

  const isAdmin = user?.role === "admin";

  const [items, setItems] = useState([]);
  const [financialSummary, setFinancialSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  const [itemModal, setItemModal] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setError("");

    try {
      const [itemsRes, summaryRes] = await Promise.all([
        api.get("/inventory/items"),
        api.get("/inventory/financial-summary"),
      ]);

      setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setFinancialSummary(summaryRes.data || null);
    } catch (err) {
      setError(getApiError(err, "Unable to load the materials list."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    return items.filter((item) => {
      if (lowOnly && !item.is_low_stock) {
        return false;
      }

      if (!term) {
        return true;
      }

      return String(item.name || "")
        .toLowerCase()
        .includes(term);
    });
  }, [items, search, lowOnly]);

  const lowStockCount = useMemo(
    () => items.filter((item) => item.is_low_stock).length,
    [items],
  );

  async function confirmRemove() {
    if (!removeTarget) return;

    setRemoving(true);

    try {
      await api.delete(`/inventory/items/${removeTarget.id}`);

      toast.success("Item removed.");

      setRemoveTarget(null);

      await load();
    } catch (err) {
      toast.error(getApiError(err, "Unable to remove this item."));
    } finally {
      setRemoving(false);
    }
  }

  const afterSave = useCallback(async () => {
    setItemModal(null);

    await load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-white/[0.06] bg-[#121519]">
        <div className="flex items-center gap-2 text-[11px] text-gray-600">
          <Loader2 size={15} className="animate-spin" />
          Loading materials...
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 w-full">
      {/* HEADER */}

      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <BookOpen size={18} className="text-[#f2bd19]" />

            <h1 className="text-lg font-semibold text-white">
              Books &amp; Materials
            </h1>
          </div>

          <p className="mt-1 text-[11px] text-gray-600">
            Track inventory, purchases, sales, and profits
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setItemModal("new")}
              className="inline-flex items-center gap-2 rounded-lg bg-[#f2bd19] px-3 py-2 text-[10px] font-semibold text-black transition hover:bg-[#dcae16]"
            >
              <Plus size={12} strokeWidth={2.5} />
              Add Book / Chapter
            </button>
          )}

          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[10px] text-gray-500 transition hover:text-gray-300"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-500/10 bg-red-500/[0.04] px-4 py-3 text-[10px] text-red-400">
          {error}
        </div>
      )}

      {/* FINANCIAL SUMMARY */}
      {financialSummary && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Package}
            label="Total Spent"
            value={formatMoney(financialSummary.total_spent)}
            sublabel="Purchase costs"
            tone="red"
          />
          <StatCard
            icon={TrendingUp}
            label="Actual Earned"
            value={formatMoney(financialSummary.total_earned)}
            sublabel="From sales"
            tone="green"
          />
          <StatCard
            icon={Warehouse}
            label="Inventory Value"
            value={formatMoney(financialSummary.inventory_value)}
            sublabel="Current stock value"
          />
          <StatCard
            icon={DollarSign}
            label="Expected Revenue"
            value={formatMoney(financialSummary.expected_revenue)}
            sublabel="From current stock"
            tone="slate"
          />
        </div>
      )}

      {/* FILTERS */}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700"
          />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search item..."
            className="w-full rounded-lg border border-white/[0.07] bg-[#121519] py-2.5 pl-9 pr-3 text-[10px] text-gray-300 outline-none placeholder:text-gray-700"
          />
        </div>

        <button
          type="button"
          onClick={() => setLowOnly((current) => !current)}
          className={[
            "rounded-lg border px-3 py-2.5 text-[10px] transition",
            lowOnly
              ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
              : "border-white/[0.07] bg-[#121519] text-gray-500 hover:text-gray-300",
          ].join(" ")}
        >
          Low stock only
        </button>
      </div>

      {/* LIST */}

      {filteredItems.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-[#121519] p-10 text-center">
          <Package size={26} className="mx-auto text-slate-700" />

          <h2 className="mt-3 text-sm font-semibold text-slate-300">
            {items.length === 0 ? "No materials yet" : "Nothing matches"}
          </h2>

          <p className="mt-1.5 text-[11px] text-gray-600">
            {items.length === 0
              ? "Add an item to start tracking what you have."
              : "Try a different search or clear the low stock filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#121519]">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-[8px] font-semibold uppercase tracking-[0.11em] text-gray-700">
            <span>Item</span>
            <span>Current quantity</span>
            <span>Minimum</span>
            <span>Status</span>
            <span />
          </div>

          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 border-t border-white/[0.045] px-4 py-2.5 transition hover:bg-white/[0.015]"
            >
              <div className="min-w-0 truncate text-[11px] font-medium text-slate-300">
                {item.name}
              </div>

              <div className="text-[11px] font-semibold tabular-nums text-slate-200">
                {formatNumber(item.current_stock)}
              </div>

              <div className="text-[11px] tabular-nums text-gray-500">
                {Number(item.minimum_stock_level || 0) > 0
                  ? formatNumber(item.minimum_stock_level)
                  : "—"}
              </div>

              <div>
                <StockBadge item={item} />
              </div>

              <div className="flex items-center gap-1">
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => setItemModal(item)}
                      className="rounded-md p-1.5 text-gray-600 transition hover:bg-white/5 hover:text-gray-300"
                      aria-label="Edit"
                    >
                      <Pencil size={13} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setRemoveTarget(item)}
                      className="rounded-md p-1.5 text-gray-600 transition hover:bg-red-400/10 hover:text-red-400"
                      aria-label="Remove"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODALS */}

      {itemModal && (
        <ItemModal
          item={itemModal === "new" ? null : itemModal}
          onClose={() => setItemModal(null)}
          onSaved={afterSave}
        />
      )}

      {removeTarget && (
        <RemoveModal
          item={removeTarget}
          removing={removing}
          onClose={() => setRemoveTarget(null)}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  );
}
