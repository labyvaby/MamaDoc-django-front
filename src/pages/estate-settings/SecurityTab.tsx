import React from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Skeleton, TextField, Tooltip, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import QRCode from "react-qr-code";
import ComputerOutlined from "@mui/icons-material/ComputerOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import PhoneIphoneOutlined from "@mui/icons-material/PhoneIphoneOutlined";

import { getErrorFields } from "../../api/client";
import {
  confirmTotp,
  disableTwoFa,
  estateSettingsKeys,
  getMyTwoFa,
  getSecuritySessions,
  setupTotp,
  terminateAllSessions,
  terminateSession,
  type MyTwoFa,
  type SecuritySession,
  type SecuritySummary,
  type TotpSetup,
} from "../../api/estateSettings";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { StatusPill } from "../construction/shared";
import { cardSx } from "../estate-dashboard/format";
import { ConfirmDialog, EmptyNote, TwoLines } from "../realty-finance/shared";
import { CardHeader, KpiCards, ScreenError } from "../realty-sales/shared";
import { errorMessage, useRefreshSettings, useSettingsCan } from "./hooks";

const time = (value: string | null) => (value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "—");

/**
 * «Безопасность» в «Ролях и правах» (`frontend-new-modules.md` §3): активные
 * сессии с «Завершить», своя 2FA через приложение-аутентификатор, политики и
 * резервные копии. 2FA при входе пока не спрашивается — шага на логине нет.
 */
export function SecurityTab({ summary }: { summary: SecuritySummary | undefined }) {
  const { t } = useT("estateSettings");
  // Без права завершать бэк отдаёт только свои сессии — и подписи, и таблица про «мои».
  const own = summary?.sessionsScope === "own";
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <KpiCards
        skeletons={3}
        items={
          summary
            ? [
                {
                  key: "sessions",
                  label: own ? t("roles.security.kpi.sessionsOwn") : t("roles.security.kpi.sessions"),
                  value: String(summary.activeSessions),
                  hint: t("roles.security.kpi.sessionsHint", { web: summary.sessionsWeb, mobile: summary.sessionsMobile }),
                },
                { key: "enrolled", label: t("roles.security.kpi.enrolled"), value: String(summary.twoFaEnrolled), hint: t("roles.security.kpi.enrolledHint", { count: summary.twoFaEnabled }) },
                { key: "backups", label: t("roles.security.kpi.backups"), value: summary.backups.available ? String(summary.backups.items.length) : t("roles.security.kpi.noData") },
              ]
            : null
        }
      />
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 360px" }, alignItems: "start" }}>
        <Box sx={{ display: "grid", gap: 2, minWidth: 0 }}>
          <SessionsCard own={own} />
          <PoliciesCard policies={summary?.policies ?? null} />
        </Box>
        <Box sx={{ display: "grid", gap: 2, minWidth: 0 }}>
          <MyTwoFaCard />
          {summary && (
            <Box sx={{ ...cardSx, minWidth: 0 }}>
              <CardHeader title={t("roles.security.backups")} />
              <Box sx={{ px: 2.25, pb: 2 }}>
                {/* Кнопки «Создать копию» нет: копии делает инфраструктура, приложение о них не знает. */}
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{summary.backups.note || t("roles.security.backupsEmpty")}</Typography>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function SessionsCard({ own }: { own: boolean }) {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const perms = useSettingsCan();
  const refresh = useRefreshSettings();
  const { enqueueSnackbar } = useSnackbar();
  const [ending, setEnding] = React.useState<SecuritySession | "all" | null>(null);
  const sessions = useQuery({ queryKey: estateSettingsKeys.sessions(scope), queryFn: ({ signal }) => getSecuritySessions(scope, signal), enabled: perms.view && scope.orgReady !== false, staleTime: 30_000 });
  const end = useMutation({
    mutationFn: (target: SecuritySession | "all") => (target === "all" ? terminateAllSessions(scope) : terminateSession(target.id, scope)),
    onSuccess: (result, target) => {
      setEnding(null);
      // Сразу после завершения список бэка ещё может отдать сессию (test2, 08.10) — убираем строку сами.
      queryClient.setQueryData<SecuritySession[]>(estateSettingsKeys.sessions(scope), (prev) => prev?.filter((s) => (target === "all" ? s.isCurrent : s.id !== target.id)));
      refresh();
      enqueueSnackbar(t("roles.security.sessions.terminated", { count: result.terminated }), { variant: "success" });
    },
  });

  if (!perms.view) return null;
  if (sessions.error) return <ScreenError error={sessions.error} onRetry={() => void sessions.refetch()} />;
  const rows = sessions.data ?? [];
  const others = rows.filter((s) => !s.isCurrent).length;
  const canTerminate = perms.sessionsTerminate && !own;

  const columns: GridColDef<SecuritySession>[] = [
    { field: "name", headerName: t("roles.security.sessions.user"), flex: 1.2, minWidth: 180, renderCell: ({ row }) => <TwoLines strong top={row.name || "—"} bottom={row.roleName || null} /> },
    {
      field: "device",
      headerName: t("roles.security.sessions.device"),
      flex: 1,
      minWidth: 180,
      renderCell: ({ row }) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Tooltip title={t(`roles.security.sessions.channel_${row.channel}`, { defaultValue: row.channel })}>
            {row.channel === "mobile" ? <PhoneIphoneOutlined fontSize="small" sx={{ color: "text.secondary" }} /> : <ComputerOutlined fontSize="small" sx={{ color: "text.secondary" }} />}
          </Tooltip>
          <TwoLines top={row.device || t("roles.security.sessions.unknownDevice")} bottom={row.isCurrent ? t("roles.security.sessions.current") : null} />
        </Box>
      ),
    },
    { field: "ip", headerName: "IP", width: 140 },
    { field: "lastActivity", headerName: t("roles.security.sessions.lastActivity"), width: 150, valueFormatter: (value: string | null) => time(value) },
    { field: "createdAt", headerName: t("roles.security.sessions.createdAt"), width: 150, valueFormatter: (value: string | null) => time(value) },
  ];
  // Только свои сессии — колонка «Сотрудник» не нужна.
  if (own) columns.splice(0, 1);
  if (canTerminate) {
    columns.push({
      field: "actions",
      headerName: "",
      width: 130,
      sortable: false,
      // Свою текущую сессию не завершают отсюда — для этого «Выйти».
      renderCell: ({ row }) =>
        row.isCurrent ? null : (
          <Button size="small" color="error" onClick={() => setEnding(row)}>
            {t("roles.security.sessions.terminate")}
          </Button>
        ),
    });
  }

  return (
    <Box sx={{ ...cardSx, minWidth: 0, overflow: "hidden" }}>
      <CardHeader
        title={own ? t("roles.security.sessions.titleOwn") : t("roles.security.sessions.title")}
        subtitle={own ? t("roles.security.sessions.hintOwn") : t("roles.security.sessions.hint")}
        action={
          canTerminate && others > 0 ? (
            <Button size="small" variant="outlined" color="error" startIcon={<LogoutOutlined />} onClick={() => setEnding("all")} sx={{ whiteSpace: "nowrap" }}>
              {t("roles.security.sessions.terminateAll")}
            </Button>
          ) : null
        }
      />
      <DataGrid<SecuritySession>
        rows={rows}
        columns={columns}
        loading={sessions.isLoading}
        getRowHeight={() => "auto"}
        localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: t("common.empty") }}
        initialState={{ sorting: { sortModel: [{ field: "lastActivity", sort: "desc" }] }, pagination: { paginationModel: { pageSize: 25 } } }}
        pageSizeOptions={[25, 50, 100]}
        disableRowSelectionOnClick
        disableColumnMenu
        autoHeight
        sx={{ border: 0, borderTop: 1, borderColor: "divider", borderRadius: 0, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } }}
      />
      <ConfirmDialog
        open={ending != null}
        title={ending === "all" ? t("roles.security.sessions.terminateAllTitle") : t("roles.security.sessions.terminateTitle")}
        text={
          ending === "all"
            ? t("roles.security.sessions.terminateAllText", { count: others })
            : t("roles.security.sessions.terminateText", { name: ending?.name ?? "", device: ending?.device || t("roles.security.sessions.unknownDevice") })
        }
        confirmLabel={ending === "all" ? t("roles.security.sessions.terminateAll") : t("roles.security.sessions.terminate")}
        danger
        busy={end.isPending}
        error={end.error}
        onConfirm={() => ending && end.mutate(ending)}
        onClose={() => {
          setEnding(null);
          end.reset();
        }}
      />
    </Box>
  );
}

function PoliciesCard({ policies }: { policies: SecuritySummary["policies"] | null }) {
  const { t } = useT("estateSettings");
  return (
    <Box sx={{ ...cardSx, overflow: "hidden" }}>
      <Typography sx={{ px: 2.25, pt: 2, pb: 1, fontWeight: 700 }}>{t("roles.security.policies")}</Typography>
      {!policies ? (
        <Box sx={{ p: 2 }}>
          <Skeleton variant="rounded" height={140} />
        </Box>
      ) : policies.length === 0 ? (
        <EmptyNote text={t("common.empty")} />
      ) : (
        policies.map((p) => (
          <Box key={p.code} sx={{ px: 2.25, py: 1.25, display: "flex", alignItems: "center", gap: 1.5, borderTop: 1, borderColor: "divider" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{p.title}</Typography>
              {p.description && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{p.description}</Typography>}
            </Box>
            {p.enforced && <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{t("roles.security.enforced")}</Typography>}
            <StatusPill label={t(`roles.security.status_${p.status}`, { defaultValue: p.status })} tone={p.status === "enabled" ? "success" : p.status === "partial" ? "warning" : null} />
          </Box>
        ))
      )}
    </Box>
  );
}

/** Своя 2FA: подключить (QR → код → резервные коды один раз) и отключить кодом. */
function MyTwoFaCard() {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const refresh = useRefreshSettings();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = React.useState<"setup" | "disable" | null>(null);
  const status = useQuery({ queryKey: estateSettingsKeys.myTwoFa(scope), queryFn: ({ signal }) => getMyTwoFa(scope, signal), enabled: scope.orgReady !== false, staleTime: 30_000 });

  const done = (message: string) => {
    refresh();
    enqueueSnackbar(message, { variant: "success" });
  };

  const s = status.data;
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("roles.security.my.title")} />
      <Box sx={{ px: 2.25, pb: 2, display: "grid", gap: 1.25 }}>
        {status.error ? (
          <Alert severity="warning">{errorMessage(status.error, t("common.loadError"))}</Alert>
        ) : !s ? (
          <Skeleton variant="rounded" height={72} />
        ) : (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <StatusPill label={s.enrolled ? t("roles.security.my.on") : t("roles.security.my.off")} tone={s.enrolled ? "success" : s.required ? "warning" : null} />
              {s.required && !s.enrolled && <Typography sx={{ fontSize: "0.8125rem", color: "warning.main" }}>{t("roles.security.my.required")}</Typography>}
            </Box>
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
              {s.enrolled
                ? t("roles.security.my.enrolledText", { date: time(s.confirmedAt), count: s.recoveryCodesLeft })
                : t("roles.security.my.offText")}
            </Typography>
            {!s.enforcedAtLogin && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("roles.security.my.notAtLogin")}</Typography>}
            <Box>
              {s.enrolled ? (
                <Button variant="outlined" color="error" onClick={() => setDialog("disable")}>
                  {t("roles.security.my.disable")}
                </Button>
              ) : (
                <Button variant="contained" onClick={() => setDialog("setup")}>
                  {t("roles.security.my.enable")}
                </Button>
              )}
            </Box>
          </>
        )}
      </Box>
      <SetupDialog
        open={dialog === "setup"}
        onClose={() => setDialog(null)}
        onEnrolled={() => {
          refresh();
          void status.refetch();
        }}
      />
      <DisableDialog
        open={dialog === "disable"}
        onClose={() => setDialog(null)}
        onDisabled={(next) => {
          // Ответ отключения — уже новый статус: кладём сразу, не ждём перезапроса.
          queryClient.setQueryData(estateSettingsKeys.myTwoFa(scope), next);
          setDialog(null);
          done(t("roles.security.my.disabled"));
        }}
      />
    </Box>
  );
}

const CODE_RE = /^\d{6}$/;
/** Резервный код «3162-0BB3»: отключить 2FA бэк даёт и им (test2, 08.10) — на случай потерянного телефона. */
const RECOVERY_RE = /^[0-9A-Z]{4}-?[0-9A-Z]{4}$/;
// Повтор кода и неверный код — по полю code; «2FA не подключена — отключать нечего» — по полю method.
const codeFieldError = (error: unknown) => {
  const fields = getErrorFields(error);
  return fields?.code ?? fields?.method ?? null;
};

function CodeField({ value, onChange, error, autoFocus = false, recovery = false }: { value: string; onChange: (value: string) => void; error: string | null; autoFocus?: boolean; recovery?: boolean }) {
  const { t } = useT("estateSettings");
  return (
    <TextField
      size="small"
      label={recovery ? t("roles.security.my.codeOrRecovery") : t("roles.security.my.code")}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(recovery ? e.target.value.toUpperCase().replace(/[^0-9A-Z-]/g, "").slice(0, 9) : e.target.value.replace(/\D/g, "").slice(0, 6))}
      error={Boolean(error)}
      helperText={error ?? (recovery ? t("roles.security.my.recoveryHint") : t("roles.security.my.codeHint"))}
      inputProps={{ inputMode: recovery ? "text" : "numeric", autoComplete: "one-time-code", maxLength: recovery ? 9 : 6 }}
    />
  );
}

/**
 * Подключение: секрет выдаётся при открытии (каждое открытие — новый секрет),
 * код из приложения → резервные коды. Их показываем один раз — окно не
 * закрывается кликом мимо, только кнопкой «Я сохранил коды».
 */
function SetupDialog({ open, onClose, onEnrolled }: { open: boolean; onClose: () => void; onEnrolled: () => void }) {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const { enqueueSnackbar } = useSnackbar();
  const [secret, setSecret] = React.useState<TotpSetup | null>(null);
  const [code, setCode] = React.useState("");
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const setup = useMutation({ mutationFn: () => setupTotp(scope), onSuccess: setSecret });
  const confirm = useMutation({
    mutationFn: () => confirmTotp(code, scope),
    onSuccess: (result) => {
      setCodes(result.recoveryCodes);
      onEnrolled();
    },
  });

  React.useEffect(() => {
    if (!open) return;
    setSecret(null);
    setCode("");
    setCodes(null);
    confirm.reset();
    setup.mutate();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- новый секрет при каждом открытии

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      enqueueSnackbar(t("common.copied"), { variant: "success" });
    } catch {
      enqueueSnackbar(t("common.failed"), { variant: "error" });
    }
  };

  const fieldError = codeFieldError(confirm.error);
  return (
    <Dialog open={open} onClose={codes || confirm.isPending ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 440 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{codes ? t("roles.security.my.codesTitle") : t("roles.security.my.setupTitle")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        {codes ? (
          <>
            <Alert severity="warning">{t("roles.security.my.codesText")}</Alert>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1, fontFamily: "monospace", fontSize: "0.95rem" }}>
              {codes.map((c) => (
                <Box key={c} sx={{ px: 1, py: 0.5, border: 1, borderColor: "divider", borderRadius: "6px", textAlign: "center" }}>
                  {c}
                </Box>
              ))}
            </Box>
            <Box>
              <Button size="small" startIcon={<ContentCopyOutlined />} onClick={() => void copy(codes.join("\n"))}>
                {t("roles.security.my.copyCodes")}
              </Button>
            </Box>
          </>
        ) : setup.isError ? (
          <Alert severity="error">{errorMessage(setup.error, t("common.failed"))}</Alert>
        ) : !secret ? (
          <Skeleton variant="rounded" height={260} />
        ) : (
          <>
            <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{t("roles.security.my.setupText")}</Typography>
            {/* QR — на белом в любой теме: тёмный фон камеры телефона не читают. */}
            <Box sx={{ justifySelf: "center", p: 1.5, bgcolor: "common.white", borderRadius: "10px", lineHeight: 0 }}>
              <QRCode value={secret.otpauthUri} size={184} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("roles.security.my.manual")}</Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography sx={{ fontFamily: "monospace", fontSize: "0.85rem", overflowWrap: "anywhere" }}>{secret.secret.replace(/(.{4})/g, "$1 ").trim()}</Typography>
                <Tooltip title={t("common.copy")}>
                  <Button size="small" sx={{ minWidth: 0 }} aria-label={t("common.copy")} onClick={() => void copy(secret.secret)}>
                    <ContentCopyOutlined fontSize="small" />
                  </Button>
                </Tooltip>
              </Box>
            </Box>
            <CodeField
              value={code}
              onChange={(next) => {
                setCode(next);
                if (confirm.error) confirm.reset();
              }}
              error={fieldError}
              autoFocus
            />
            {confirm.error && !fieldError && <Alert severity="error">{errorMessage(confirm.error, t("common.failed"))}</Alert>}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {codes ? (
          <Button variant="contained" onClick={onClose}>
            {t("roles.security.my.codesSaved")}
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={confirm.isPending}>
              {t("common.cancel")}
            </Button>
            <Button variant="contained" disabled={!secret || !CODE_RE.test(code) || confirm.isPending} onClick={() => confirm.mutate()}>
              {t("roles.security.my.confirm")}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

function DisableDialog({ open, onClose, onDisabled }: { open: boolean; onClose: () => void; onDisabled: (status: MyTwoFa) => void }) {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const [code, setCode] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const disable = useMutation({ mutationFn: () => disableTwoFa(code, scope), onSuccess: onDisabled });
  React.useEffect(() => {
    if (!open) return;
    setCode("");
    setTouched(false);
    disable.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс при открытии
  const valid = CODE_RE.test(code) || RECOVERY_RE.test(code);
  const fieldError = codeFieldError(disable.error) ?? (touched && !valid ? t("roles.security.my.codeInvalid") : null);
  return (
    <ConfirmDialog
      open={open}
      title={t("roles.security.my.disableTitle")}
      text={t("roles.security.my.disableText")}
      confirmLabel={t("roles.security.my.disable")}
      danger
      busy={disable.isPending}
      error={codeFieldError(disable.error) ? null : disable.error}
      onConfirm={() => {
        setTouched(true);
        if (valid) disable.mutate();
      }}
      onClose={onClose}
    >
      <CodeField
        value={code}
        onChange={(next) => {
          setCode(next);
          if (disable.error) disable.reset();
        }}
        error={fieldError}
        autoFocus
        recovery
      />
    </ConfirmDialog>
  );
}
