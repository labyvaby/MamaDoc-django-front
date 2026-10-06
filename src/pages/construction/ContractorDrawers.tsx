import React from "react";
import { Alert, Box, Button, Drawer, IconButton, Link, Rating, Skeleton, TextField, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";
import { useSnackbar } from "notistack";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import {
  actActions,
  blockContractor,
  constructionKeys,
  getAct,
  getContractor,
  returnAct,
  runActAction,
  unblockContractor,
  type Act,
  type Contractor,
} from "../../api/construction";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { ConfirmDialog, InfoRow } from "../realty-finance/shared";
import { ActFormDrawer, type ActPreset } from "./ConstructionForms";
import { actTone, compactSum, defectTone, fullDate, severityTone } from "./format";
import { useRefreshConstruction } from "./hooks";
import { HistoryList, SectionTitle, StatusPill } from "./shared";

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

function DrawerShell({ open, onClose, eyebrow, title, badge, footer, children }: { open: boolean; onClose: () => void; eyebrow: React.ReactNode; title: React.ReactNode; badge?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode }) {
  const { t } = useT("construction");
  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 560 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "flex-start", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{eyebrow}</Typography>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.1rem" }}>
            {title}
          </Typography>
        </Box>
        {badge}
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2.25, alignContent: "start" }}>{children}</Box>
      {footer && <Box sx={{ px: 2.5, py: 1.5, display: "grid", gap: 1, borderTop: 1, borderColor: "divider" }}>{footer}</Box>}
    </Drawer>
  );
}

/** Карточка подрядчика (`?contractor=`): реквизиты, показатели, договоры, акты, стоп-лист. */
export function ContractorDrawer({ id, preview, canManage, onClose, onOpenAct }: { id: number | null; preview: Contractor | null; canManage: boolean; onClose: () => void; onOpenAct: (id: number) => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshConstruction();
  const { enqueueSnackbar } = useSnackbar();
  const [blocking, setBlocking] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [actPreset, setActPreset] = React.useState<ActPreset | null>(null);
  const query = useQuery({
    queryKey: constructionKeys.contractor(scope, id ?? 0),
    queryFn: ({ signal }) => getContractor(id as number, scope, signal),
    enabled: id != null && scope.orgReady !== false,
    staleTime: 15_000,
  });
  const detail = query.data && query.data.id === id ? query.data : null;
  const c: Contractor | null = detail ?? (preview && preview.id === id ? preview : null);
  const block = useMutation({
    mutationFn: () => blockContractor(id as number, reason, scope),
    onSuccess: () => {
      setBlocking(false);
      refresh();
      enqueueSnackbar(t("contractors.drawer.blocked"), { variant: "success" });
    },
  });
  const unblock = useMutation({
    mutationFn: () => unblockContractor(id as number, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("contractors.drawer.unblocked"), { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(message(error, t("common.failed")), { variant: "error" }),
  });
  React.useEffect(() => {
    setBlocking(false);
    setReason("");
    block.reset();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- новый подрядчик — новая форма

  return (
    <DrawerShell
      open={id != null}
      onClose={onClose}
      eyebrow={c?.spec ?? ""}
      title={c?.name ?? ""}
      badge={c?.isBlocked ? <StatusPill label={t("contractors.card.blocked")} tone="error" /> : undefined}
      footer={
        c && canManage ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {c.isBlocked ? (
              <Button onClick={() => unblock.mutate()} disabled={unblock.isPending}>
                {t("contractors.drawer.unblock")}
              </Button>
            ) : (
              <Button color="error" onClick={() => setBlocking(true)}>
                {t("contractors.drawer.block")}
              </Button>
            )}
            <Button variant="contained" sx={{ ml: "auto" }} onClick={() => setActPreset({ contractorId: c.id, projectId: null, subject: "" })} disabled={c.isBlocked}>
              {t("contractors.newAct")}
            </Button>
          </Box>
        ) : undefined
      }
    >
      {!c && query.isLoading && <Skeleton variant="rounded" height={280} />}
      {!c && query.error && <Alert severity="error">{message(query.error, t("contractors.drawer.notFound"))}</Alert>}
      {c && (
        <>
          {c.isBlocked && (
            <Alert severity="error">
              {c.blockedAt ? t("contractors.drawer.blockedSince", { date: fullDate(c.blockedAt) }) : t("contractors.card.blocked")}
              {c.blockReason ? ` · ${c.blockReason}` : ""}
            </Alert>
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Rating value={c.rating} precision={0.1} readOnly size="small" />
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>{c.rating.toLocaleString("ru-RU")}</Typography>
          </Box>
          <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" } }}>
            {[
              [t("contractors.card.contracts"), t("contractors.card.contractsValue", { active: c.stats.activeCount, total: c.stats.contractsCount }), null],
              [t("contractors.card.amount"), compactSum(c.stats.totalAmount, t), null],
              [t("contractors.card.paid"), `${c.stats.paidPct}%`, null],
              [t("contractors.card.debt"), c.stats.debt > 0 ? compactSum(c.stats.debt, t) : "—", c.stats.debt > 0 ? "warning.main" : null],
            ].map(([label, value, color]) => (
              <Box key={label} sx={{ px: 1.25, py: 1, border: 1, borderColor: "divider", borderRadius: "10px", minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                  {label}
                </Typography>
                <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 700, color: color ?? "text.primary" }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Box>
          <Box>
            <InfoRow label={t("contractors.drawer.inn")} value={c.inn || "—"} />
            <InfoRow label={t("contractors.drawer.contact")} value={c.contact || "—"} />
            {c.phone && <InfoRow label={t("contractors.drawer.phone")} value={<Link href={`tel:${c.phone}`}>{formatPhoneDisplay(c.phone)}</Link>} />}
            {c.director && <InfoRow label={t("contractors.drawer.director")} value={c.director} />}
            {c.bank && <InfoRow label={t("contractors.drawer.bank")} value={c.bank} />}
            {c.account && <InfoRow label={t("contractors.drawer.account")} value={c.account} />}
            {c.since && <InfoRow label={t("contractors.drawer.since")} value={c.since} />}
          </Box>
          <Box>
            <SectionTitle>{t("contractors.drawer.stats")}</SectionTitle>
            <InfoRow label={t("contractors.drawer.pendingActs")} value={c.stats.pendingActsCount ? `${c.stats.pendingActsCount} · ${formatKGS(c.stats.pendingActsAmount)}` : "—"} />
            <InfoRow label={t("contractors.drawer.openDefects")} value={String(c.stats.openDefects)} tone={c.stats.openDefects > 0 ? "warning" : null} />
            <InfoRow label={t("contractors.drawer.lateStages")} value={String(c.stats.lateStages)} tone={c.stats.lateStages > 0 ? "error" : null} />
            <InfoRow label={t("contractors.drawer.claims")} value={String(c.stats.claimsCount)} />
          </Box>
          {detail && (
            <>
              <Box>
                <SectionTitle>{t("contractors.drawer.contracts")}</SectionTitle>
                {detail.contracts.length === 0 && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("contractors.drawer.contractsEmpty")}</Typography>}
                {detail.contracts.map((ct) => (
                  <Box key={ct.id} sx={{ py: 0.75, display: "flex", alignItems: "baseline", gap: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>{ct.number}</Typography>
                      <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                        {[ct.projectName, ct.subject].filter(Boolean).join(" · ")}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, whiteSpace: "nowrap" }}>{formatKGS(ct.amount)}</Typography>
                    <Typography sx={{ fontSize: "0.72rem", color: "text.secondary", whiteSpace: "nowrap" }}>{ct.statusLabel}</Typography>
                  </Box>
                ))}
              </Box>
              <Box>
                <SectionTitle>{t("contractors.drawer.acts")}</SectionTitle>
                {detail.acts.length === 0 && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("contractors.drawer.actsEmpty")}</Typography>}
                {detail.acts.map((a) => (
                  <Box key={a.id} sx={{ py: 0.75, display: "flex", alignItems: "baseline", gap: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Link component="button" type="button" underline="hover" onClick={() => onOpenAct(a.id)} sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                        {a.number}
                      </Link>
                      <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                        {[a.period, a.subject].filter(Boolean).join(" · ")}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, whiteSpace: "nowrap" }}>{formatKGS(a.amount)}</Typography>
                    <StatusPill label={a.statusLabel} tone={actTone(a.status)} />
                  </Box>
                ))}
              </Box>
            </>
          )}
        </>
      )}
      <ConfirmDialog
        open={blocking}
        title={t("contractors.drawer.blockTitle")}
        text={t("contractors.drawer.blockText", { name: c?.name ?? "" })}
        confirmLabel={t("contractors.drawer.block")}
        busy={block.isPending}
        error={block.error}
        danger
        onConfirm={() => block.mutate()}
        onClose={() => setBlocking(false)}
      >
        <TextField size="small" label={t("contractors.drawer.blockReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
      <ActFormDrawer preset={actPreset} onClose={() => setActPreset(null)} />
    </DrawerShell>
  );
}

/** Карточка акта (`?act=`): суммы, удержание, ЭДО, дефекты, история; приёмка и оплата. */
export function ActDrawer({ id, preview, canManage, onClose }: { id: number | null; preview: Act | null; canManage: boolean; onClose: () => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshConstruction();
  const { enqueueSnackbar } = useSnackbar();
  const [dialog, setDialog] = React.useState<"return" | "pay" | null>(null);
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const query = useQuery({
    queryKey: constructionKeys.act(scope, id ?? 0),
    queryFn: ({ signal }) => getAct(id as number, scope, signal),
    enabled: id != null && scope.orgReady !== false,
    staleTime: 15_000,
  });
  const detail = query.data && query.data.id === id ? query.data : null;
  const act: Act | null = detail ?? (preview && preview.id === id ? preview : null);
  const run = useMutation({
    mutationFn: (action: "submit" | "accept" | "pay") => runActAction(id as number, action, scope),
    onSuccess: (fresh, action) => {
      setDialog(null);
      refresh();
      const text =
        action === "accept" ? t("contractors.act.accepted", { amount: formatKGS(fresh.toPay) }) : action === "pay" ? t("contractors.act.paid") : t("contractors.act.submitted");
      enqueueSnackbar(text, { variant: "success" });
    },
    onError: (error) => {
      if (dialog == null) enqueueSnackbar(message(error, t("common.failed")), { variant: "error" });
    },
  });
  const back = useMutation({
    mutationFn: () => returnAct(id as number, reason, scope),
    onSuccess: () => {
      setDialog(null);
      refresh();
      enqueueSnackbar(t("contractors.act.returned"), { variant: "success" });
    },
  });
  React.useEffect(() => {
    setDialog(null);
    setReason("");
    setTouched(false);
    run.reset();
    back.reset();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- новый акт — новые формы

  const actions = act && canManage ? actActions(act.status) : [];
  const busy = run.isPending || back.isPending;

  return (
    <DrawerShell
      open={id != null}
      onClose={onClose}
      eyebrow={act ? `${act.contractorName}${act.projectName ? ` · ${act.projectName}` : ""}` : ""}
      title={act ? t("contractors.act.title", { number: act.number }) : ""}
      badge={act ? <StatusPill label={act.statusLabel} tone={actTone(act.status)} /> : undefined}
      footer={
        actions.length > 0 && act ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "flex-end" }}>
            {actions.includes("return") && (
              <Button color="error" onClick={() => setDialog("return")} disabled={busy} sx={{ mr: "auto" }}>
                {t("contractors.act.return")}
              </Button>
            )}
            {actions.includes("submit") && (
              <Button variant="contained" onClick={() => run.mutate("submit")} disabled={busy}>
                {t("contractors.act.submit")}
              </Button>
            )}
            {actions.includes("accept") && (
              <Button variant="contained" onClick={() => run.mutate("accept")} disabled={busy}>
                ✓ {t("contractors.act.accept")}
              </Button>
            )}
            {actions.includes("pay") && (
              <Button variant="contained" onClick={() => setDialog("pay")} disabled={busy}>
                {t("contractors.act.pay", { amount: formatKGS(act.toPay) })}
              </Button>
            )}
          </Box>
        ) : undefined
      }
    >
      {!act && query.isLoading && <Skeleton variant="rounded" height={280} />}
      {!act && query.error && <Alert severity="error">{message(query.error, t("contractors.act.notFound"))}</Alert>}
      {act && (
        <>
          {act.defects > 0 && <Alert severity="warning">{t("contractors.acts.defectsWarn", { count: act.defects })}</Alert>}
          {act.status === "rejected" && act.returnReason && <Alert severity="error">{t("contractors.act.returnReason", { reason: act.returnReason })}</Alert>}
          <Box>
            <InfoRow label={t("contractors.act.subject")} value={act.subject || "—"} />
            <InfoRow label={t("contractors.act.period")} value={act.period || "—"} />
            <InfoRow label={t("contractors.act.contract")} value={act.contractNumber || "—"} />
            <InfoRow label={t("contractors.act.date")} value={fullDate(act.date)} />
            {act.checkedBy && <InfoRow label={t("contractors.act.checkedBy")} value={act.checkedBy} />}
          </Box>
          <Box>
            <InfoRow label={t("contractors.act.amount")} value={formatKGS(act.amount)} />
            <InfoRow label={t("contractors.act.retention")} value={act.retention > 0 ? `−${formatKGS(act.retention)}` : "—"} />
            <InfoRow label={t("contractors.act.toPay")} value={formatKGS(act.toPay)} />
            {act.paidAmount > 0 && <InfoRow label={t("contractors.act.paidAmount")} value={formatKGS(act.paidAmount)} tone="success" />}
          </Box>
          {act.documentId != null && (
            <Link component={RouterLink} to={`/edo?doc=${act.documentId}`} underline="hover" sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
              {t("contractors.act.edo", { number: act.edoNumber || act.number })}
            </Link>
          )}
          {detail && detail.defectList.length > 0 && (
            <Box>
              <SectionTitle>{t("contractors.act.defects")}</SectionTitle>
              {detail.defectList.map((d) => (
                <Box key={d.id} sx={{ py: 0.75, display: "flex", alignItems: "baseline", gap: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                  <Link component={RouterLink} to={`/construction/quality?defect=${d.id}`} underline="hover" sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem", fontWeight: 600 }}>
                    {d.number} · {d.title}
                  </Link>
                  <StatusPill label={d.severityLabel || d.statusLabel} tone={d.severityLabel ? severityTone(d.severity) : defectTone(d.status)} />
                </Box>
              ))}
            </Box>
          )}
          {detail && (
            <Box>
              <SectionTitle>{t("common.history")}</SectionTitle>
              <HistoryList items={detail.history} empty="—" />
            </Box>
          )}
        </>
      )}
      <ConfirmDialog
        open={dialog === "return"}
        title={t("contractors.act.returnTitle")}
        text={act?.subject}
        confirmLabel={t("contractors.act.return")}
        busy={back.isPending}
        error={back.error}
        danger
        onConfirm={() => {
          setTouched(true);
          if (reason.trim()) back.mutate();
        }}
        onClose={() => setDialog(null)}
      >
        <TextField
          size="small"
          label={t("contractors.act.returnReasonLabel")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          multiline
          minRows={2}
          error={touched && !reason.trim()}
          helperText={touched && !reason.trim() ? t("common.required") : undefined}
        />
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "pay"}
        title={t("contractors.act.payTitle", { number: act?.number ?? "" })}
        text={act ? t("contractors.act.payText", { amount: formatKGS(act.toPay) }) : null}
        confirmLabel={act ? t("contractors.act.pay", { amount: formatKGS(act.toPay) }) : ""}
        busy={run.isPending}
        error={dialog === "pay" ? run.error : null}
        onConfirm={() => run.mutate("pay")}
        onClose={() => setDialog(null)}
      />
    </DrawerShell>
  );
}
