import { useCallback, useEffect, useRef, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DatabaseBackup,
  FileText,
  FolderOpen,
  HardDrive,
  History,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

/* ==========================================================================
   Helpers
========================================================================== */

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "—";

  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDateTime(isoString) {
  if (!isoString) return "—";

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorText(error, fallback) {
  if (error?.code === "ERR_NETWORK" || error?.message === "Network Error") {
    return "Could not connect. Check your internet or local network connection and try again.";
  }

  // Keep raw server/database diagnostics out of the user interface.
  return (
    fallback ||
    "Something went wrong. Please try again. If the problem continues, contact the administrator."
  );
}

/*
*/
/* ==========================================================================
   Presentational helpers
========================================================================== */

function SectionCard({ icon: Icon, title, description, children, action }) {
  return (
    <section className="rounded-2xl bg-[#121519] border border-white/[0.07] shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-white/[0.07]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#f2bd19]/[0.08] border border-[#f2bd19]/20 flex items-center justify-center shrink-0">
            <Icon className="w-[18px] h-[18px] text-[#f2bd19]" />
          </div>

          <div>
            <h2 className="text-[15px] font-semibold text-white">{title}</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
          </div>
        </div>

        {action}
      </div>

      <div className="px-5 sm:px-6 py-5">{children}</div>
    </section>
  );
}

function StatusBadge({ tone = "neutral", icon: Icon, children }) {
  const tones = {
    gold: "bg-[#f2bd19]/[0.08] border-[#f2bd19]/25 text-[#f2bd19]",
    green: "bg-emerald-400/[0.07] border-emerald-400/25 text-emerald-300",
    red: "bg-red-400/[0.07] border-red-400/25 text-red-300",
    slate: "bg-white/[0.04] border-white/[0.09] text-slate-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md border text-[10px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap ${tones[tone]}`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}

function GoldButton({
  children,
  icon: Icon,
  loading = false,
  disabled = false,
  onClick,
  type = "button",
  danger = false,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2
        h-[38px] px-4 rounded-[9px]
        text-[12px] font-semibold
        border transition-all duration-200
        active:scale-[0.98]
        disabled:opacity-50 disabled:cursor-not-allowed
        ${
          danger
            ? "bg-red-500/[0.08] border-red-400/30 text-red-300 hover:bg-red-500/[0.14] hover:border-red-400/45"
            : "bg-[#f2bd19] border-[#f2bd19] text-[#111] hover:bg-[#ffcf2e] hover:border-[#ffcf2e] shadow-[0_8px_22px_rgba(242,189,25,0.16)]"
        }
      `}
    >
      {loading ? (
        <Loader2 className="w-[15px] h-[15px] animate-spin" />
      ) : (
        Icon && <Icon className="w-[15px] h-[15px]" />
      )}

      {children}
    </button>
  );
}

function GhostButton({
  children,
  icon: Icon,
  onClick,
  loading = false,
  disabled = false,
  title,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className="
        inline-flex items-center justify-center gap-2
        h-[34px] px-3 rounded-[8px]
        bg-white/[0.035] border border-white/[0.08]
        text-[11px] font-semibold text-slate-300
        hover:bg-white/[0.07] hover:border-white/[0.14] hover:text-white
        active:scale-[0.98]
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all duration-200
      "
    >
      {loading ? (
        <Loader2 className="w-[13px] h-[13px] animate-spin" />
      ) : (
        Icon && <Icon className="w-[13px] h-[13px]" />
      )}

      {children}
    </button>
  );
}

/* ==========================================================================
   Restore confirmation modal
========================================================================== */

function RestoreModal({ backup, onClose, onSuccess }) {
  const toast = useToast();

  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submitRestore() {
    if (confirmText.trim().toUpperCase() !== "RESTORE") {
      setError("Type the word RESTORE exactly to confirm.");
      return;
    }

    if (!password) {
      setError("Administrator password is required.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const { data } = await api.post("/backup/restore", {
        filename: backup.filename,
        confirmText: confirmText.trim(),
        adminPassword: password,
      });

      toast.success(data.message || "Database restored successfully.");

      onSuccess(data);
    } catch (restoreError) {
      const message = errorText(
        restoreError,
        "Restore failed. The database was rolled back to its previous state.",
      );

      setError(message);
      toast.error(message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/75 backdrop-blur-[3px]">
      <div className="w-full max-w-[520px] rounded-2xl bg-[#121519] border border-white/[0.09] shadow-[0_30px_80px_rgba(0,0,0,0.5)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-[18px] h-[18px] text-red-400" />

            <h3 className="text-[14px] font-semibold text-white">
              Restore database backup
            </h3>
          </div>

          <button
            onClick={onClose}
            disabled={busy}
            className="w-8 h-8 rounded-lg border border-white/[0.07] flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-red-500/[0.06] border border-red-400/20 p-3.5">
            <div className="text-[12px] font-semibold text-red-300 mb-1.5">
              Warning — this replaces the current database contents
            </div>

            <div className="text-[11px] text-slate-300 leading-relaxed">
              Restoring{" "}
              <span className="text-white font-semibold">
                {backup.filename}
              </span>{" "}
              will overwrite students, enrollments, attendance, payments,
              finance and all other records with the contents of this backup.
              Records created after {formatDateTime(backup.createdAt)} will be
              lost.
            </div>
          </div>

          <ol className="text-[11px] text-slate-400 leading-relaxed list-decimal list-inside space-y-1">
            <li>A safety backup of the current database is created first.</li>

            <li>
              When a test database can be created, the backup is restored into
              it and verified before anything touches the live database.
            </li>

            <li>
              The live restore runs in a single transaction — if it fails, the
              database rolls back completely.
            </li>
          </ol>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1.5">
              Type RESTORE to confirm
            </label>

            <input
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              disabled={busy}
              autoComplete="off"
              placeholder="RESTORE"
              className="
                w-full h-[40px] rounded-[9px] px-3
                bg-[#0b0d10] border border-white/[0.09]
                text-[13px] text-white placeholder-slate-600
                focus:outline-none focus:border-[#f2bd19]/40
                transition-colors
              "
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1.5">
              Administrator password
            </label>

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              autoComplete="off"
              placeholder="••••••••"
              className="
                w-full h-[40px] rounded-[9px] px-3
                bg-[#0b0d10] border border-white/[0.09]
                text-[13px] text-white placeholder-slate-600
                focus:outline-none focus:border-[#f2bd19]/40
                transition-colors
              "
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/[0.07] border border-red-400/20 p-3 text-[11px] text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/[0.07]">
          <GhostButton onClick={onClose} disabled={busy}>
            Cancel
          </GhostButton>

          <GoldButton
            danger
            icon={ShieldCheck}
            loading={busy}
            onClick={submitRestore}
          >
            {busy ? "Restoring…" : "Restore now"}
          </GoldButton>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Main page — DATABASE BACKUPS ONLY
========================================================================== */

export default function UpdatesBackup() {
  const { user } = useAuth();
  const toast = useToast();

  const [config, setConfig] = useState(null);
  const [backups, setBackups] = useState([]);
  const [restores, setRestores] = useState([]);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [backupDir, setBackupDir] = useState("");

  const [restoreModal, setRestoreModal] = useState(null);

  const toastRef = useRef(toast);

  toastRef.current = toast;

  const isAdmin = user?.role === "admin";

  const loadConfig = useCallback(async () => {
    try {
      const { data } = await api.get("/backup/config");
      setConfig(data);
      setBackupDir(data.backupDir || "");
    } catch (error) {
      toastRef.current.error(
        errorText(error, "Unable to load backup settings."),
      );
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get("/backup/list");

      setBackups(Array.isArray(data.backups) ? data.backups : []);
      setRestores(Array.isArray(data.restores) ? data.restores : []);
      setBackupDir(data.backupDir || "");
    } catch (error) {
      toastRef.current.error(
        errorText(error, "Unable to load backup history."),
      );
    }
  }, []);

  async function chooseBackupFolder() {
    try {
      const folder = await window.sabawoonDesktop?.chooseBackupFolder?.();
      if (!folder) return;
      await api.post("/backup/folder", { folder });
      setBackupDir(folder);
      await loadHistory();
      toast.success("Backup folder changed.");
    } catch (error) {
      toast.error(error?.response?.data?.error || errorText(error, "Could not change the backup folder."));
    }
  }

  async function openBackupFolder() {
    try {
      await window.sabawoonDesktop?.openBackupFolder?.(backupDir);
    } catch (error) {
      toast.error(errorText(error, "Could not open the backup folder."));
    }
  }

  useEffect(() => {
    if (!isAdmin) return;

    (async () => {
      setLoading(true);

      await Promise.all([loadConfig(), loadHistory()]);

      setLoading(false);
    })();
  }, [isAdmin, loadConfig, loadHistory]);

  /* ---------------------------------------------------------------- create */

  async function createBackup() {
    setCreating(true);

    try {
      const { data } = await api.post("/backup/create");

      const backup = data.backup;

      toast.success(
        `Local backup created: ${backup.filename} (${formatBytes(backup.currentSizeBytes ?? backup.sizeBytes)})`,
      );

      await loadHistory();
    } catch (error) {
      toast.error(errorText(error, "Backup creation failed."));
    } finally {
      setCreating(false);
    }
  }

  async function deleteBackup(backup) {
    if (!window.confirm(`Delete the local backup file ${backup.filename}?`)) return;
    try {
      await api.delete(`/backup/${encodeURIComponent(backup.filename)}`);
      toast.success(`Deleted ${backup.filename}`);
      await loadHistory();
    } catch (error) {
      toast.error(
        error?.response?.data?.error ||
          errorText(error, "Could not delete this local backup."),
      );
    }
  }

  /* -------------------------------------------------------------- guards */

  if (!isAdmin) {
    return (
      <div className="w-full min-h-full flex items-center justify-center px-4">
        <div className="max-w-[420px] text-center rounded-2xl bg-[#121519] border border-white/[0.07] p-8">
          <Lock className="w-9 h-9 text-[#f2bd19] mx-auto mb-4" />

          <h1 className="text-[17px] font-semibold text-white mb-2">
            Administrator only
          </h1>

          <p className="text-[12px] text-slate-400 leading-relaxed">
            Database backup and restore management is restricted to
            administrator accounts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-full px-4 sm:px-6 lg:px-8 py-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <DatabaseBackup className="w-[26px] h-[26px] text-[#f2bd19]" />

            <h1 className="text-[22px] sm:text-[26px] font-bold text-white tracking-tight">
              Database Backups
            </h1>

          </div>

          <p className="text-[12px] text-slate-500 mt-2 max-w-[640px] leading-relaxed">
            Create and restore complete local copies of the academy
            database. Backups are stored on this computer and created
            automatically every day.
          </p>
        </div>

        <GhostButton icon={RefreshCw} onClick={() => loadHistory()}>
          Refresh
        </GhostButton>
      </div>

      {/* ============================================================ SECTION 1 */}
      <SectionCard
        icon={FolderOpen}
        title="Backup Folder"
        description="Choose the local folder used for backup files."
        action={
          <div className="flex gap-2">
            <GhostButton icon={FolderOpen} onClick={chooseBackupFolder}>Choose Folder</GhostButton>
            <GhostButton icon={FolderOpen} disabled={!backupDir} onClick={openBackupFolder}>Open Folder</GhostButton>
          </div>
        }
      >
        <div className="font-mono text-[11px] text-slate-300 break-all rounded-lg bg-black/20 border border-white/[0.06] p-3">
          {backupDir || "No backup folder selected"}
        </div>
      </SectionCard>

      <SectionCard
        icon={HardDrive}
        title="Database Backup"
        description="A complete PostgreSQL copy of academy records stored in the configured local backup folder."
        action={
          <GoldButton
            icon={DatabaseBackup}
            loading={creating}
            onClick={createBackup}
          >
            {creating ? "Backing up…" : "Back Up Now"}
          </GoldButton>
        }
      >
        {/* History header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <History className="w-[14px] h-[14px]" />
            Backup history
          </div>

        </div>

        {/* History table */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-500 text-[12px]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading backup history…
          </div>
        ) : backups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.09] py-12 text-center">
            <DatabaseBackup className="w-8 h-8 text-slate-600 mx-auto mb-3" />

            <div className="text-[13px] text-slate-400 font-medium">
              No backups yet
            </div>

            <div className="text-[11px] text-slate-600 mt-1">
              Create your first backup with the button above.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-slate-600">
                  <th className="px-4 py-2.5 font-semibold">Backup file</th>
                  <th className="px-4 py-2.5 font-semibold">Created</th>
                  <th className="px-4 py-2.5 font-semibold">Size</th>
                  <th className="px-4 py-2.5 font-semibold">Local</th>
                  <th className="px-4 py-2.5 font-semibold text-right">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/[0.05]">
                {backups.map((backup) => (
                  <tr
                    key={backup.filename}
                    className="text-[12px] text-slate-300 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-[14px] h-[14px] text-[#f2bd19]/70 shrink-0" />

                        <span className="font-mono text-[11px] truncate max-w-[240px]">
                          {backup.filename}
                        </span>
                      </div>

                      {backup.validation &&
                        backup.validation.tableDataEntries && (
                          <div className="text-[10px] text-slate-600 mt-0.5 ml-5">
                            {backup.validation.tableDataEntries} tables ·
                            validated
                          </div>
                        )}

                      {backup.trigger === "automatic" && (
                        <div className="text-[10px] text-slate-600 mt-0.5 ml-5">
                          Automatic daily backup
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-[11px] text-slate-400">
                      {formatDateTime(backup.createdAt)}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-[11px]">
                      {formatBytes(backup.currentSizeBytes ?? backup.sizeBytes)}
                    </td>

                    <td className="px-4 py-3">
                      {backup.localAvailable ? (
                        <StatusBadge tone="green" icon={HardDrive}>
                          Available
                        </StatusBadge>
                      ) : (
                        <div className="flex flex-col gap-1 items-start">
                          <StatusBadge tone="red" icon={XCircle}>
                            Missing
                          </StatusBadge>

                          <span className="text-[10px] text-red-300/80">
                            Recorded but the file is gone
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <GoldButton
                          danger
                          icon={ShieldCheck}
                          disabled={!backup.localAvailable}
                          onClick={() => setRestoreModal(backup)}
                        >
                          Restore
                        </GoldButton>

                        <GhostButton
                          icon={Trash2}
                          disabled={!backup.localAvailable}
                          onClick={() => deleteBackup(backup)}
                          title="Delete this local backup file"
                        >
                          Delete
                        </GhostButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Restore activity */}
        {restores.length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 mb-2">
              Recent restore operations
            </div>

            <div className="space-y-2">
              {restores.slice(0, 5).map((restore, index) => (
                <div
                  key={`${restore.filename}-${index}`}
                  className="rounded-xl bg-[#0b0d10] border border-white/[0.06] p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]"
                >
                  {restore.status === "succeeded" ? (
                    <CheckCircle2 className="w-[14px] h-[14px] text-emerald-400" />
                  ) : (
                    <XCircle className="w-[14px] h-[14px] text-red-400" />
                  )}

                  <span className="font-mono text-slate-300">
                    {restore.filename}
                  </span>

                  <span className="text-slate-500">
                    {formatDateTime(restore.finishedAt || restore.startedAt)}
                  </span>

                  {restore.safetyBackup && (
                    <span className="text-slate-500">
                      Safety copy:{" "}
                      <span className="font-mono">
                        {restore.safetyBackup.filename}
                      </span>
                    </span>
                  )}

                  {restore.performedBy?.name && (
                    <span className="text-slate-500">
                      By {restore.performedBy.name}
                    </span>
                  )}

                  {restore.status === "succeeded" ? (
                    <span className="text-emerald-300">
                      Restored successfully
                    </span>
                  ) : (
                    <span className="text-red-300">
                      Restore failed. Check the backup and try again.
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Restore modal */}
      {restoreModal && (
        <RestoreModal
          backup={restoreModal}
          onClose={() => setRestoreModal(null)}
          onSuccess={async () => {
            setRestoreModal(null);

            await loadHistory();

            // Refresh the page so screens reload the restored records.
            setTimeout(() => window.location.reload(), 1200);
          }}
        />
      )}
    </div>
  );
}
