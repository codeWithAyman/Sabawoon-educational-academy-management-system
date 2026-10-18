import { useCallback, useEffect, useRef, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DatabaseBackup,
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  HardDrive,
  History,
  Loader2,
  Lock,
  Package,
  RefreshCw,
  Server,
  ShieldCheck,
  UploadCloud,
  WifiOff,
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
  return (
    error?.response?.data?.error ||
    (error?.code === "ERR_NETWORK" || error?.message === "Network Error"
      ? "Network error — check the connection to the server."
      : null) ||
    error?.message ||
    fallback ||
    "Something went wrong."
  );
}

/*
  Downloads a backup file from the backend through the authenticated API.

  In the browser this uses a temporary object URL. When the application is
  packaged with Electron later, this single helper can be swapped for a native
  file-save dialog (dialog.showSaveDialog) without touching the rest of the
  page — the backend endpoint stays identical.
*/
async function downloadBackupFile(filename) {
  const response = await api.get(`/backup/download/${filename}`, {
    responseType: "blob",
  });

  const objectUrl = URL.createObjectURL(response.data);

  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
}

/* ==========================================================================
   Small presentational helpers
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

function GhostButton({ children, icon: Icon, onClick, loading = false, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
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
      setError('Type the word RESTORE exactly to confirm.');
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
              Restoring <span className="text-white font-semibold">{backup.filename}</span>{" "}
              will overwrite students, enrollments, attendance, payments, finance and
              all other records with the contents of this backup. Records created
              after {formatDateTime(backup.createdAt)} will be lost.
            </div>
          </div>

          <ol className="text-[11px] text-slate-400 leading-relaxed list-decimal list-inside space-y-1">
            <li>A safety backup of the current database is created first.</li>
            <li>
              When a test database can be created, the backup is restored into it
              and verified before anything touches the live database.
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

          <GoldButton danger icon={ShieldCheck} loading={busy} onClick={submitRestore}>
            {busy ? "Restoring…" : "Restore now"}
          </GoldButton>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Main page
========================================================================== */

export default function UpdatesBackup() {
  const { user } = useAuth();
  const toast = useToast();

  const [config, setConfig] = useState(null);
  const [backups, setBackups] = useState([]);
  const [restores, setRestores] = useState([]);
  const [remoteVerification, setRemoteVerification] = useState(null);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(null);
  const [downloadingFile, setDownloadingFile] = useState(null);

  const [restoreModal, setRestoreModal] = useState(null);

  const [updateCheck, setUpdateCheck] = useState(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  const toastRef = useRef(toast);

  toastRef.current = toast;

  const isAdmin = user?.role === "admin";

  const loadConfig = useCallback(async () => {
    try {
      const { data } = await api.get("/backup/config");

      setConfig(data);
    } catch (error) {
      toastRef.current.error(errorText(error, "Unable to load backup configuration."));
    }
  }, []);

  const loadHistory = useCallback(async ({ verifyRemote = false } = {}) => {
    try {
      const { data } = await api.get(
        verifyRemote ? "/backup/list?remote=1" : "/backup/list",
      );

      setBackups(Array.isArray(data.backups) ? data.backups : []);
      setRestores(Array.isArray(data.restores) ? data.restores : []);
      setRemoteVerification(data.remoteVerification || null);
    } catch (error) {
      toastRef.current.error(errorText(error, "Unable to load backup history."));
    }
  }, []);

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

      toast.success(
        `Backup created: ${data.backup.filename} (${formatBytes(data.backup.sizeBytes)})`,
      );

      await loadHistory();
    } catch (error) {
      toast.error(errorText(error, "Backup creation failed."));
    } finally {
      setCreating(false);
    }
  }

  /* -------------------------------------------------------------- download */

  async function downloadBackup(backup) {
    setDownloadingFile(backup.filename);

    try {
      await downloadBackupFile(backup.filename);

      toast.success(`Downloading ${backup.filename}`);

      await loadHistory();
    } catch (error) {
      if (error?.response?.status === 404) {
        toast.error(
          "This backup file is no longer on the server disk. Use the GitHub copy or create a new backup.",
        );
      } else {
        toast.error(errorText(error, "Download failed."));
      }
    } finally {
      setDownloadingFile(null);
    }
  }

  /* ---------------------------------------------------------------- upload */

  async function uploadBackup(backup) {
    const confirmed = window.confirm(
      `Upload ${backup.filename} (${formatBytes(backup.currentSizeBytes)}) to GitHub?\n\n` +
        `Destination: ${config?.github?.backupRepo || "the configured private repository"}\n\n` +
        "The file contains the complete academy database. Only continue if the " +
        "destination repository is PRIVATE.",
    );

    if (!confirmed) return;

    setUploadingFile(backup.filename);

    try {
      const { data } = await api.post("/backup/upload-github", {
        filename: backup.filename,
      });

      toast.success(data.message || "Backup uploaded to GitHub.");

      await loadHistory();
    } catch (error) {
      toast.error(errorText(error, "Upload to GitHub failed."));

      await loadHistory();
    } finally {
      setUploadingFile(null);
    }
  }

  /* ------------------------------------------------------- remote verify */

  async function verifyRemote() {
    setVerifying(true);

    try {
      await loadHistory({ verifyRemote: true });

      toast.success("Remote GitHub listing refreshed.");
    } finally {
      setVerifying(false);
    }
  }

  /* --------------------------------------------------------- update check */

  async function checkForUpdates() {
    setCheckingUpdates(true);

    try {
      const { data } = await api.get("/backup/updates/check");

      setUpdateCheck(data);
    } catch (error) {
      const status = error?.response?.status;
      const code = error?.response?.data?.code;

      setUpdateCheck({
        ok: false,
        error: errorText(error, "Update check failed."),
        code: code || (status ? `HTTP_${status}` : "OFFLINE"),
      });

      toast.error(errorText(error, "Update check failed."));
    } finally {
      setCheckingUpdates(false);
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
            Backup, restore and update management is restricted to administrator
            accounts.
          </p>
        </div>
      </div>
    );
  }

  const githubConfigured = config?.github?.backupUploadConfigured;
  const releaseRepoConfigured = config?.github?.releaseCheckConfigured;
  const pgToolsOk =
    config?.pgTools?.pg_dump?.available && config?.pgTools?.pg_restore?.available;

  return (
    <div className="w-full min-h-full px-4 sm:px-6 lg:px-8 py-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <DatabaseBackup className="w-[26px] h-[26px] text-[#f2bd19]" />

            <h1 className="text-[22px] sm:text-[26px] font-bold text-white tracking-tight">
              Updates &amp; Backup
            </h1>
          </div>

          <p className="text-[12px] text-slate-500 mt-2 max-w-[640px] leading-relaxed">
            Create and restore complete PostgreSQL backups, keep an off-site copy on
            a private GitHub repository, and check for official application releases.
            Backup creation and downloads work without internet access.
          </p>
        </div>

        <GhostButton icon={RefreshCw} onClick={() => loadHistory()}>
          Refresh
        </GhostButton>
      </div>

      {/* Configuration warnings */}
      {config && !pgToolsOk && (
        <div className="mb-5 rounded-xl bg-amber-400/[0.06] border border-amber-400/25 p-4 flex items-start gap-3">
          <AlertTriangle className="w-[18px] h-[18px] text-amber-300 shrink-0 mt-0.5" />

          <div className="text-[12px] text-amber-200/90 leading-relaxed">
            <span className="font-semibold">PostgreSQL tools not found.</span>{" "}
            Install PostgreSQL on this PC or set <code className="text-amber-100">PG_BIN_DIR</code>{" "}
            in <code className="text-amber-100">backend/.env</code> to the folder that contains{" "}
            <code className="text-amber-100">pg_dump</code> and{" "}
            <code className="text-amber-100">pg_restore</code>.
          </div>
        </div>
      )}

      {/* ============================================================ SECTION 1 */}
      <SectionCard
        icon={HardDrive}
        title="Database Backup"
        description="Full PostgreSQL backup (schema + all records) using pg_dump custom format (-Fc)"
        action={
          <GoldButton icon={DatabaseBackup} loading={creating} onClick={createBackup}>
            {creating ? "Creating backup…" : "Create Backup"}
          </GoldButton>
        }
      >
        {/* Server info strip */}
        {config && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl bg-[#0b0d10] border border-white/[0.06] p-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-600 mb-1">
                <Server className="w-3 h-3" />
                Backup location
              </div>

              <div className="text-[11px] text-slate-300 font-mono break-all">
                {config.backupDir}
              </div>
            </div>

            <div className="rounded-xl bg-[#0b0d10] border border-white/[0.06] p-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-600 mb-1.5">
                <DatabaseBackup className="w-3 h-3" />
                pg_dump / pg_restore
              </div>

              {pgToolsOk ? (
                <div className="text-[11px] text-slate-300">
                  {config.pgTools.pg_dump.version}
                </div>
              ) : (
                <div className="text-[11px] text-amber-300">Not available</div>
              )}
            </div>

            <div className="rounded-xl bg-[#0b0d10] border border-white/[0.06] p-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-600 mb-1.5">
                <GitBranch className="w-3 h-3" />
                GitHub backup destination
              </div>

              {githubConfigured ? (
                <div className="flex flex-col gap-1">
                  <div className="text-[11px] text-slate-300 font-mono break-all">
                    {config.github.backupRepo}
                  </div>

                  <StatusBadge tone="green" icon={Lock}>
                    Private upload configured
                  </StatusBadge>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="text-[11px] text-slate-400">Not configured</div>

                  <StatusBadge tone="slate" icon={AlertTriangle}>
                    Upload unavailable
                  </StatusBadge>
                </div>
              )}
            </div>
          </div>
        )}

        {/* History header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <History className="w-[14px] h-[14px]" />
            Backup history
          </div>

          <GhostButton
            icon={RefreshCw}
            loading={verifying}
            disabled={!githubConfigured}
            onClick={verifyRemote}
            title={githubConfigured ? undefined : "Configure GitHub first"}
          >
            Verify GitHub copies
          </GhostButton>
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
                  <th className="px-4 py-2.5 font-semibold">GitHub</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
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

                      {backup.validation && backup.validation.tableDataEntries && (
                        <div className="text-[10px] text-slate-600 mt-0.5 ml-5">
                          {backup.validation.tableDataEntries} tables · validated
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
                          On disk
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="red" icon={XCircle}>
                          Missing
                        </StatusBadge>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {backup.github?.status === "uploaded" ? (
                        <div className="flex flex-col gap-1 items-start">
                          <StatusBadge
                            tone={backup.github.verifiedRemote === false ? "red" : "green"}
                            icon={backup.github.verifiedRemote === false ? AlertTriangle : CheckCircle2}
                          >
                            {backup.github.verifiedRemote === false
                              ? "Not on GitHub"
                              : "Uploaded"}
                          </StatusBadge>

                          <span className="text-[10px] text-slate-600 whitespace-nowrap">
                            {formatDateTime(backup.github.uploadedAt)}
                          </span>

                          {backup.github.repository && (
                            <span className="text-[10px] text-slate-600 font-mono truncate max-w-[180px]">
                              {backup.github.repository}
                            </span>
                          )}
                        </div>
                      ) : backup.github?.status === "failed" ? (
                        <div className="flex flex-col gap-1 items-start">
                          <StatusBadge tone="red" icon={XCircle}>
                            Failed
                          </StatusBadge>

                          {backup.github.error && (
                            <span
                              className="text-[10px] text-red-300/80 max-w-[200px] truncate"
                              title={backup.github.error}
                            >
                              {backup.github.error}
                            </span>
                          )}
                        </div>
                      ) : (
                        <StatusBadge tone="slate" icon={Clock}>
                          Not uploaded
                        </StatusBadge>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <GhostButton
                          icon={Download}
                          loading={downloadingFile === backup.filename}
                          disabled={!backup.localAvailable}
                          onClick={() => downloadBackup(backup)}
                        >
                          Download
                        </GhostButton>

                        <GhostButton
                          icon={UploadCloud}
                          loading={uploadingFile === backup.filename}
                          disabled={
                            !backup.localAvailable ||
                            !githubConfigured ||
                            backup.github?.status === "uploaded"
                          }
                          onClick={() => uploadBackup(backup)}
                        >
                          Upload
                        </GhostButton>

                        {backup.github?.assetUrl && (
                          <a
                            href={backup.github.assetUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Open the uploaded copy on GitHub"
                            className="
                              inline-flex items-center justify-center
                              w-[34px] h-[34px] rounded-[8px]
                              bg-white/[0.035] border border-white/[0.08]
                              text-slate-400 hover:text-white hover:bg-white/[0.07] hover:border-white/[0.14]
                              transition-all
                            "
                          >
                            <ExternalLink className="w-[13px] h-[13px]" />
                          </a>
                        )}

                        <GoldButton
                          danger
                          icon={ShieldCheck}
                          disabled={!backup.localAvailable}
                          onClick={() => setRestoreModal(backup)}
                        >
                          Restore
                        </GoldButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Remote verification summary */}
        {remoteVerification && (
          <div className="mt-4 rounded-xl bg-[#0b0d10] border border-white/[0.06] p-3.5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <GitBranch className="w-[14px] h-[14px]" />

                Remote listing:{" "}
                <span className="font-mono text-slate-300">
                  {remoteVerification.repository}
                </span>

                {remoteVerification.releaseTag && (
                  <span className="text-slate-600">
                    (tag: {remoteVerification.releaseTag})
                  </span>
                )}
              </div>

              <span className="text-[10px] text-slate-600">
                Checked {formatDateTime(remoteVerification.checkedAt)}
              </span>
            </div>

            {remoteVerification.error ? (
              <div className="mt-2 text-[11px] text-red-300">
                {remoteVerification.error}
              </div>
            ) : (
              <div className="mt-2 text-[11px] text-slate-500">
                {remoteVerification.assets?.length || 0} backup file(s) found on GitHub.
              </div>
            )}
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

                  <span className="font-mono text-slate-300">{restore.filename}</span>

                  <span className="text-slate-500">
                    {formatDateTime(restore.finishedAt || restore.startedAt)}
                  </span>

                  {restore.safetyBackup && (
                    <span className="text-slate-500">
                      safety backup: <span className="font-mono">{restore.safetyBackup.filename}</span>
                    </span>
                  )}

                  {restore.performedBy?.name && (
                    <span className="text-slate-500">by {restore.performedBy.name}</span>
                  )}

                  {restore.status === "succeeded" ? (
                    <span className="text-emerald-300">restored successfully</span>
                  ) : (
                    <span className="text-red-300 truncate max-w-[360px]" title={restore.error}>
                      {restore.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ============================================================ SECTION 2 */}
      <div className="mt-6">
        <SectionCard
          icon={Package}
          title="Application Updates"
          description="Official releases published on GitHub"
          action={
            <GoldButton
              icon={RefreshCw}
              loading={checkingUpdates}
              onClick={checkForUpdates}
            >
              {checkingUpdates ? "Checking…" : "Check for Updates"}
            </GoldButton>
          }
        >
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="rounded-xl bg-[#0b0d10] border border-white/[0.06] px-3.5 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-600 mb-0.5">
                Installed version
              </div>

              <div className="text-[13px] font-semibold text-white">
                {config ? config.installedVersion : "—"}
              </div>
            </div>

            {updateCheck?.latest && (
              <div className="rounded-xl bg-[#0b0d10] border border-white/[0.06] px-3.5 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-600 mb-0.5">
                  Latest release
                </div>

                <div className="text-[13px] font-semibold text-white">
                  {updateCheck.latest.version || updateCheck.latest.tagName}
                </div>
              </div>
            )}

            {updateCheck?.ok && updateCheck.latest && (
              updateCheck.updateAvailable ? (
                <StatusBadge tone="gold" icon={AlertTriangle}>
                  Update available
                </StatusBadge>
              ) : (
                <StatusBadge tone="green" icon={CheckCircle2}>
                  Up to date
                </StatusBadge>
              )
            )}

            {releaseRepoConfigured && config?.github?.releaseRepo && (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <GitBranch className="w-[13px] h-[13px]" />
                <span className="font-mono">{config.github.releaseRepo}</span>
              </div>
            )}
          </div>

          {config && !releaseRepoConfigured && (
            <div className="rounded-xl bg-amber-400/[0.06] border border-amber-400/25 p-3.5 text-[11px] text-amber-200/90 leading-relaxed mb-4">
              <span className="font-semibold">Release repository not configured.</span>{" "}
              Set <code>GITHUB_RELEASE_REPO_OWNER</code> and{" "}
              <code>GITHUB_RELEASE_REPO_NAME</code> in <code>backend/.env</code> to the
              repository where official application releases are published.
            </div>
          )}

          {!updateCheck && (
            <div className="rounded-xl border border-dashed border-white/[0.09] py-10 text-center">
              <Package className="w-8 h-8 text-slate-600 mx-auto mb-3" />

              <div className="text-[12px] text-slate-500">
                Select “Check for Updates” to query GitHub for the latest official release.
              </div>
            </div>
          )}

          {updateCheck && !updateCheck.ok && (
            <div className="rounded-xl bg-red-500/[0.06] border border-red-400/20 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                {updateCheck.code === "OFFLINE" ? (
                  <WifiOff className="w-[16px] h-[16px] text-red-300" />
                ) : (
                  <XCircle className="w-[16px] h-[16px] text-red-300" />
                )}

                <span className="text-[12px] font-semibold text-red-300">
                  {updateCheck.code === "OFFLINE"
                    ? "GitHub is unreachable"
                    : "Update check failed"}
                </span>
              </div>

              <div className="text-[11px] text-slate-300 leading-relaxed">
                {updateCheck.error}
              </div>
            </div>
          )}

          {updateCheck?.ok && !updateCheck.latest && (
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-4 text-[12px] text-slate-400">
              {updateCheck.message}
            </div>
          )}

          {updateCheck?.ok && updateCheck.latest && (
            <div className="rounded-xl bg-[#0b0d10] border border-white/[0.06] p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[14px] font-semibold text-white">
                    {updateCheck.latest.name || updateCheck.latest.tagName}
                  </div>

                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                    <Clock className="w-3 h-3" />
                    Published {formatDateTime(updateCheck.latest.publishedAt)}

                    {updateCheck.latest.prerelease && (
                      <StatusBadge tone="slate">Pre-release</StatusBadge>
                    )}
                  </div>
                </div>

                {updateCheck.latest.url && (
                  <a
                    href={updateCheck.latest.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] text-[#f2bd19] hover:underline"
                  >
                    View release on GitHub
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {updateCheck.latest.notes && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-600 mb-1.5">
                    Release notes
                  </div>

                  <pre className="text-[11px] text-slate-400 leading-relaxed whitespace-pre-wrap max-h-[220px] overflow-y-auto scrollbar rounded-lg bg-black/25 border border-white/[0.05] p-3">
                    {updateCheck.latest.notes}
                  </pre>
                </div>
              )}

              {updateCheck.latest.assets?.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-600 mb-1.5">
                    Release files
                  </div>

                  <div className="space-y-1.5">
                    {updateCheck.latest.assets.map((asset) => (
                      <div
                        key={asset.name}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-[13px] h-[13px] text-slate-500 shrink-0" />

                          <span className="font-mono text-[11px] text-slate-300 truncate">
                            {asset.name}
                          </span>

                          <span className="text-[10px] text-slate-600 whitespace-nowrap">
                            {formatBytes(asset.sizeBytes)}
                          </span>
                        </div>

                        <a
                          href={asset.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="
                            inline-flex items-center gap-1.5
                            h-[28px] px-3 rounded-[7px]
                            bg-[#f2bd19]/[0.08] border border-[#f2bd19]/25
                            text-[11px] font-semibold text-[#f2bd19]
                            hover:bg-[#f2bd19]/[0.16]
                            transition-all
                          "
                        >
                          <Download className="w-3 h-3" />
                          Download
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 text-[11px] text-slate-400 leading-relaxed">
                <span className="font-semibold text-slate-300">Browser version:</span>{" "}
                download the release file above and install it manually — a running web
                application cannot replace itself. Automatic in-app updates will be
                enabled when the desktop (Electron) package is released; updates never
                touch the PostgreSQL database or academy records.
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Restore modal */}
      {restoreModal && (
        <RestoreModal
          backup={restoreModal}
          onClose={() => setRestoreModal(null)}
          onSuccess={async (data) => {
            setRestoreModal(null);

            await loadHistory();

            // All application data is served from the database, so a full page
            // reload guarantees every screen shows the restored records.
            setTimeout(() => window.location.reload(), 1200);

            console.log("Restore finished:", data);
          }}
        />
      )}
    </div>
  );
}
