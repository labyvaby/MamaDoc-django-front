import React from "react";
import { Alert, Autocomplete, Box, Button, Drawer, IconButton, Link, MenuItem, Rating, Skeleton, Step, StepLabel, Stepper, TextField, Tooltip, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "react-router";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";

import {
  ORDER_STEPS,
  addTenderOffer,
  awardTender,
  createRequest,
  getOrder,
  getRequest,
  getSupplier,
  getSuppliers,
  getTender,
  inviteTender,
  orderStep,
  receiveOrder,
  rejectRequest,
  requestActions,
  runRequestAction,
  shipOrder,
  supplyKeys,
  type Nomenclature,
  type RequestAction,
  type Supplier,
  type SupplyOrder,
  type SupplyRequest,
  type Tender,
  type TenderOffer,
} from "../../api/supply";
import { CustomDatePicker } from "../../components/ui";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { ConfirmDialog, FormDrawer, InfoRow } from "../realty-finance/shared";
import { fullDate, isoDate, orderTone, parseNumber, positiveAmount, requestTone, tenderTone } from "./format";
import { useConstructionProjects, useNomenclature, useRefreshSupply } from "./hooks";
import { HistoryList, SectionTitle, StatusPill } from "./shared";

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
const qty = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

function Shell({ open, onClose, eyebrow, title, badge, footer, children }: { open: boolean; onClose: () => void; eyebrow: React.ReactNode; title: React.ReactNode; badge?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode }) {
  const { t } = useT("construction");
  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 600 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
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
      {footer && <Box sx={{ px: 2.5, py: 1.5, display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "flex-end", borderTop: 1, borderColor: "divider" }}>{footer}</Box>}
    </Drawer>
  );
}

/** Небольшая таблица внутри шторки: прокрутка по горизонтали — внутри неё, не всей шторки. */
function MiniTable({ head, rows, minWidth = 480 }: { head: React.ReactNode[]; rows: React.ReactNode[][]; minWidth?: number }) {
  return (
    <Box sx={{ overflowX: "auto", border: 1, borderColor: "divider", borderRadius: "10px" }}>
      <Box
        component="table"
        sx={{
          width: "100%",
          minWidth,
          borderCollapse: "collapse",
          "& td, & th": { px: 1.25, py: 0.8, fontSize: "0.8125rem", borderTop: 1, borderColor: "divider", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
          "& th": { fontWeight: 600, color: "text.secondary", borderTop: 0 },
          "& td:first-of-type, & th:first-of-type": { textAlign: "left", whiteSpace: "normal" },
        }}
      >
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

/** Карточка заявки (`?request=`): позиции с покрытием, история; согласование и дальнейший путь. */
export function RequestDrawer({ id, preview, can, onClose, onOpenTender, onOpenOrder }: { id: number | null; preview: SupplyRequest | null; can: { manage: boolean; approve: boolean }; onClose: () => void; onOpenTender: (id: number) => void; onOpenOrder: (id: number) => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshSupply();
  const { enqueueSnackbar } = useSnackbar();
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const query = useQuery({ queryKey: supplyKeys.request(scope, id ?? 0), queryFn: ({ signal }) => getRequest(id as number, scope, signal), enabled: id != null && scope.orgReady !== false, staleTime: 15_000 });
  const detail = query.data && query.data.id === id ? query.data : null;
  const r = detail ?? (preview && preview.id === id ? preview : null);
  const done: Record<RequestAction, string> = { approve: t("procurement.request.approved"), issue: t("procurement.request.issued"), tender: t("procurement.request.tenderCreated"), order: t("procurement.request.orderCreated") };
  const run = useMutation({
    mutationFn: (action: RequestAction) => runRequestAction(id as number, action, scope),
    onSuccess: (result, action) => {
      refresh();
      enqueueSnackbar(done[action], { variant: "success" });
      if (action === "tender" && result.tenderId != null) onOpenTender(result.tenderId);
      if (action === "order" && result.orderId != null) onOpenOrder(result.orderId);
    },
    onError: (error) => enqueueSnackbar(message(error, t("common.failed")), { variant: "error" }),
  });
  const reject = useMutation({
    mutationFn: () => rejectRequest(id as number, reason, scope),
    onSuccess: () => {
      setRejecting(false);
      refresh();
      enqueueSnackbar(t("procurement.request.rejected"), { variant: "success" });
    },
  });
  React.useEffect(() => {
    setRejecting(false);
    setReason("");
    reject.reset();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- новая заявка — новая форма

  const actions = r ? requestActions(detail ?? r, can) : [];
  const label: Record<string, string> = {
    approve: `✓ ${t("procurement.request.approve")}`,
    issue: t("procurement.request.issue"),
    tender: t("procurement.request.toTender"),
    order: t("procurement.request.toOrder"),
  };
  const showCoverage = Boolean(detail?.items.some((i) => i.coverage != null));

  return (
    <Shell
      open={id != null}
      onClose={onClose}
      eyebrow={r ? [r.projectName, r.number].filter(Boolean).join(" · ") : ""}
      title={r?.title ?? ""}
      badge={r ? <StatusPill label={r.statusLabel || r.status} tone={requestTone(r.status)} /> : undefined}
      footer={
        actions.length > 0 ? (
          <>
            {actions.includes("reject") && (
              <Button color="error" onClick={() => setRejecting(true)} disabled={run.isPending} sx={{ mr: "auto" }}>
                {t("procurement.request.reject")}
              </Button>
            )}
            {(["issue", "order", "tender", "approve"] as const)
              .filter((a) => actions.includes(a))
              .map((a, i, all) => (
                <Button key={a} variant={i === all.length - 1 ? "contained" : "outlined"} onClick={() => run.mutate(a)} disabled={run.isPending}>
                  {label[a]}
                </Button>
              ))}
          </>
        ) : undefined
      }
    >
      {!r && query.isLoading && <Skeleton variant="rounded" height={280} />}
      {!r && query.error && <Alert severity="error">{message(query.error, t("procurement.request.notFound"))}</Alert>}
      {r && (
        <>
          <Box>
            <InfoRow label={t("procurement.request.requester")} value={r.requester || "—"} />
            <InfoRow label={t("procurement.request.created")} value={fullDate(r.created)} />
            <InfoRow label={t("procurement.request.needBy")} value={fullDate(r.needBy)} tone={r.overdue ? "error" : null} />
            {r.warehouseName && <InfoRow label={t("procurement.request.warehouse")} value={r.warehouseName} />}
            {r.note && <InfoRow label={t("procurement.request.note")} value={r.note} />}
            {r.tenderId != null && (
              <InfoRow
                label={t("procurement.request.tender")}
                value={
                  <Link component="button" type="button" underline="hover" onClick={() => onOpenTender(r.tenderId as number)}>
                    {r.tenderNumber || `#${r.tenderId}`}
                  </Link>
                }
              />
            )}
            {r.orderId != null && (
              <InfoRow
                label={t("procurement.request.order")}
                value={
                  <Link component="button" type="button" underline="hover" onClick={() => onOpenOrder(r.orderId as number)}>
                    {r.orderNumber || `#${r.orderId}`}
                  </Link>
                }
              />
            )}
          </Box>
          {detail && (
            <Box>
              <SectionTitle>{t("procurement.request.items")}</SectionTitle>
              <MiniTable
                minWidth={showCoverage ? 640 : 460}
                head={[
                  t("procurement.request.nom"),
                  t("procurement.request.qty"),
                  t("procurement.request.price"),
                  t("procurement.request.amount"),
                  ...(showCoverage ? [t("procurement.request.local"), t("procurement.request.central"), t("procurement.request.coverage")] : []),
                ]}
                rows={[
                  ...detail.items.map((i) => [
                    <Box key="n">
                      {i.nomName}
                      {i.category && (
                        <Typography component="span" sx={{ display: "block", fontSize: "0.72rem", color: "text.secondary" }}>
                          {i.category}
                        </Typography>
                      )}
                    </Box>,
                    `${qty(i.qty)} ${i.unit}`,
                    formatKGS(i.price),
                    formatKGS(i.amount),
                    ...(showCoverage
                      ? [
                          i.localAvailable != null ? qty(i.localAvailable) : "—",
                          i.centralQty != null ? qty(i.centralQty) : "—",
                          i.coverage ? <StatusPill key="c" label={t(`procurement.request.coverage_${i.coverage}`, { defaultValue: i.coverage })} tone={i.coverage === "stock" ? "success" : i.coverage === "transfer" ? "info" : "warning"} /> : "—",
                        ]
                      : []),
                  ]),
                  [<strong key="t">{t("procurement.request.total")}</strong>, "", "", <strong key="s">{formatKGS(detail.total)}</strong>, ...(showCoverage ? ["", "", ""] : [])],
                ]}
              />
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
      <ConfirmDialog open={rejecting} title={t("procurement.request.rejectTitle")} text={r?.title} confirmLabel={t("procurement.request.reject")} busy={reject.isPending} error={reject.error} danger onConfirm={() => reject.mutate()} onClose={() => setRejecting(false)}>
        <TextField size="small" label={t("procurement.request.rejectReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </Shell>
  );
}

/** Карточка тендера (`?tender=`): предложения по баллу, «Выбрать» (`supply.approve`), приглашения. */
export function TenderDrawer({ id, preview, can, onClose, onOpenOrder }: { id: number | null; preview: Tender | null; can: { manage: boolean; approve: boolean }; onClose: () => void; onOpenOrder: (id: number) => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshSupply();
  const { enqueueSnackbar } = useSnackbar();
  const [award, setAward] = React.useState<TenderOffer | null>(null);
  const [offerOpen, setOfferOpen] = React.useState(false);
  const query = useQuery({ queryKey: supplyKeys.tender(scope, id ?? 0), queryFn: ({ signal }) => getTender(id as number, scope, signal), enabled: id != null && scope.orgReady !== false, staleTime: 15_000 });
  const detail = query.data && query.data.id === id ? query.data : null;
  const tn = detail ?? (preview && preview.id === id ? preview : null);
  const invite = useMutation({
    mutationFn: () => inviteTender(id as number, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("procurement.tender.invitedAgain"), { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(message(error, t("common.failed")), { variant: "error" }),
  });
  const choose = useMutation({
    mutationFn: () => awardTender(id as number, award?.supplierId as number, scope),
    onSuccess: ({ orderId }) => {
      setAward(null);
      refresh();
      enqueueSnackbar(t("procurement.tender.awarded"), { variant: "success" });
      if (orderId != null) onOpenOrder(orderId);
    },
  });
  React.useEffect(() => {
    setAward(null);
    choose.reset();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- новый тендер — новый выбор
  const open = tn != null && tn.winnerId == null && tn.orderId == null;

  return (
    <Shell
      open={id != null}
      onClose={onClose}
      eyebrow={tn ? [tn.projectName, tn.requestNumber && `${t("procurement.tender.request")} ${tn.requestNumber}`].filter(Boolean).join(" · ") : ""}
      title={tn ? `${t("procurement.tender.title", { number: tn.number })} · ${tn.title}` : ""}
      badge={tn ? <StatusPill label={tn.statusLabel || tn.status} tone={tenderTone(tn.status)} /> : undefined}
      footer={
        tn && can.manage && open ? (
          <>
            <Button onClick={() => invite.mutate()} disabled={invite.isPending} sx={{ mr: "auto" }}>
              {t("procurement.tender.invite")}
            </Button>
            <Button variant="outlined" startIcon={<AddOutlined />} onClick={() => setOfferOpen(true)}>
              {t("procurement.tender.addOffer")}
            </Button>
          </>
        ) : undefined
      }
    >
      {!tn && query.isLoading && <Skeleton variant="rounded" height={280} />}
      {!tn && query.error && <Alert severity="error">{message(query.error, t("procurement.tender.notFound"))}</Alert>}
      {tn && (
        <>
          <Box>
            <InfoRow label={t("procurement.tender.deadline")} value={fullDate(tn.deadline)} />
            <InfoRow label={t("procurement.tender.invited")} value={tn.invited.length ? tn.invited.map((i) => `${i.supplierName}${i.responded ? " ✓" : ""}`).join(", ") : "—"} />
            {tn.winnerName && <InfoRow label={t("procurement.tender.winner")} value={tn.winnerName} tone="success" />}
            {tn.orderId != null && (
              <InfoRow
                label={t("procurement.request.order")}
                value={
                  <Link component="button" type="button" underline="hover" onClick={() => onOpenOrder(tn.orderId as number)}>
                    {tn.orderNumber || `#${tn.orderId}`}
                  </Link>
                }
              />
            )}
          </Box>
          {tn.notResponded.length > 0 && <Alert severity="info">{t("procurement.tender.notResponded", { names: tn.notResponded.join(", ") })}</Alert>}
          <Box>
            <SectionTitle>
              {t("procurement.tender.offers")} · {t("procurement.tenders.offersValue", { count: tn.offersCount, total: tn.invited.length || tn.offersCount })}
            </SectionTitle>
            {tn.offers.length === 0 ? (
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("procurement.tender.offersEmpty")}</Typography>
            ) : (
              <Box sx={{ display: "grid", gap: 1 }}>
                {tn.offers.map((o) => (
                  <Box key={o.id} sx={{ p: 1.5, border: 1, borderColor: o.isWinner ? "success.main" : o.recommended ? "primary.main" : "divider", borderRadius: "10px", display: "grid", gap: 0.5 }}>
                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
                      <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: "0.875rem" }}>{o.supplierName}</Typography>
                      <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatKGS(o.price)}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      <Rating value={o.rating} precision={0.1} readOnly size="small" />
                      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                        {[o.supplierCategory, t("procurement.tender.deliveryDays", { count: o.deliveryDays }), o.terms, `${t("procurement.tender.score")} ${o.score}`].filter(Boolean).join(" · ")}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                      {o.isBest && <StatusPill label={t("procurement.tender.best")} tone="success" />}
                      {!o.isBest && o.aboveBestPct > 0 && <StatusPill label={t("procurement.tender.above", { pct: o.aboveBestPct.toLocaleString("ru-RU") })} tone="warning" />}
                      {o.recommended && <StatusPill label={t("procurement.tender.recommended")} tone="primary" />}
                      {o.isWinner && <StatusPill label={t("procurement.tender.winner")} tone="success" />}
                      {can.approve && open && (
                        <Button size="small" variant={o.recommended ? "contained" : "outlined"} sx={{ ml: "auto" }} onClick={() => setAward(o)}>
                          {t("procurement.tender.award")}
                        </Button>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </>
      )}
      <ConfirmDialog
        open={award != null}
        title={t("procurement.tender.awardTitle")}
        text={award ? t("procurement.tender.awardText", { supplier: award.supplierName, price: formatKGS(award.price) }) : null}
        confirmLabel={t("procurement.tender.award")}
        busy={choose.isPending}
        error={choose.error}
        onConfirm={() => choose.mutate()}
        onClose={() => setAward(null)}
      />
      <OfferDrawer tenderId={offerOpen ? id : null} onClose={() => setOfferOpen(false)} />
    </Shell>
  );
}

function OfferDrawer({ tenderId, onClose }: { tenderId: number | null; onClose: () => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshSupply();
  const { enqueueSnackbar } = useSnackbar();
  const open = tenderId != null;
  const suppliers = useQuery({ queryKey: supplyKeys.suppliers(scope), queryFn: ({ signal }) => getSuppliers(scope, signal), enabled: open && scope.orgReady !== false, staleTime: 60_000 }).data ?? [];
  const [supplierId, setSupplierId] = React.useState<number | "">("");
  const [price, setPrice] = React.useState("");
  const [days, setDays] = React.useState("");
  const [terms, setTerms] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => addTenderOffer(tenderId as number, { supplierId: supplierId as number, price: Number(positiveAmount(price)), deliveryDays: Math.round(parseNumber(days) as number), terms }, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("procurement.offerForm.created"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!open) return;
    setSupplierId("");
    setPrice("");
    setDays("");
    setTerms("");
    setTouched(false);
    save.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const daysBad = parseNumber(days) == null || (parseNumber(days) as number) < 0;
  const invalid = { supplier: supplierId === "", price: positiveAmount(price) == null, days: daysBad };
  return (
    <FormDrawer
      open={open}
      title={t("procurement.offerForm.title")}
      submitLabel={t("procurement.offerForm.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!Object.values(invalid).some(Boolean)) save.mutate();
      }}
    >
      <TextField select size="small" label={t("procurement.offerForm.supplier")} value={supplierId} onChange={(e) => setSupplierId(Number(e.target.value))} error={touched && invalid.supplier} helperText={touched && invalid.supplier ? t("common.required") : undefined}>
        {suppliers.map((s) => (
          <MenuItem key={s.id} value={s.id}>
            {s.name}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <TextField size="small" label={t("procurement.offerForm.price")} value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} error={touched && invalid.price} helperText={touched && invalid.price ? t("common.amountInvalid") : undefined} />
        <TextField size="small" label={t("procurement.offerForm.deliveryDays")} value={days} inputMode="numeric" onChange={(e) => setDays(e.target.value)} error={touched && invalid.days} helperText={touched && invalid.days ? t("common.number") : undefined} />
      </Box>
      <TextField size="small" label={t("procurement.offerForm.terms")} value={terms} onChange={(e) => setTerms(e.target.value)} />
    </FormDrawer>
  );
}

/** Карточка заказа (`?order=`): степпер, состав, ТТН; отгрузка и приёмка на склад. */
export function OrderDrawer({ id, preview, canManage, onClose, onOpenRequest }: { id: number | null; preview: SupplyOrder | null; canManage: boolean; onClose: () => void; onOpenRequest: (id: number) => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshSupply();
  const { enqueueSnackbar } = useSnackbar();
  const [shipping, setShipping] = React.useState(false);
  const [waybill, setWaybill] = React.useState("");
  const query = useQuery({ queryKey: supplyKeys.order(scope, id ?? 0), queryFn: ({ signal }) => getOrder(id as number, scope, signal), enabled: id != null && scope.orgReady !== false, staleTime: 15_000 });
  const detail = query.data && query.data.id === id ? query.data : null;
  const o = detail ?? (preview && preview.id === id ? preview : null);
  const ship = useMutation({
    mutationFn: () => shipOrder(id as number, waybill, scope),
    onSuccess: () => {
      setShipping(false);
      refresh();
      enqueueSnackbar(t("procurement.orderDrawer.shipped"), { variant: "success" });
    },
  });
  const receive = useMutation({
    mutationFn: () => receiveOrder(id as number, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("procurement.orderDrawer.received"), { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(message(error, t("common.failed")), { variant: "error" }),
  });
  React.useEffect(() => {
    setShipping(false);
    setWaybill("");
    ship.reset();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- новый заказ — новая форма
  const step = o ? orderStep(o.status) : 0;

  return (
    <Shell
      open={id != null}
      onClose={onClose}
      eyebrow={o ? [o.projectName, o.supplierName].filter(Boolean).join(" · ") : ""}
      title={o ? t("procurement.orderDrawer.title", { number: o.number }) : ""}
      badge={o ? <StatusPill label={o.overdue ? `${o.statusLabel} · ${t("procurement.orders.overdue")}` : o.statusLabel || o.status} tone={orderTone(o.status, o.overdue)} /> : undefined}
      footer={
        o && canManage && (o.status === "ordered" || o.status === "in_transit" || o.status === "delivered") ? (
          <>
            {o.status === "ordered" && (
              <Button variant="outlined" onClick={() => setShipping(true)}>
                {t("procurement.orderDrawer.ship")}
              </Button>
            )}
            {(o.status === "in_transit" || o.status === "delivered") && (
              <Button variant="contained" onClick={() => receive.mutate()} disabled={receive.isPending}>
                ✓ {t("procurement.orderDrawer.receive")}
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {!o && query.isLoading && <Skeleton variant="rounded" height={280} />}
      {!o && query.error && <Alert severity="error">{message(query.error, t("procurement.orderDrawer.notFound"))}</Alert>}
      {o && (
        <>
          <Stepper activeStep={step} alternativeLabel sx={{ "& .MuiStepLabel-label": { fontSize: "0.75rem" } }}>
            {ORDER_STEPS.map((s, i) => (
              <Step key={s} completed={i < step || (i === step && s === "closed")}>
                <StepLabel optional={i === 0 && o.orderedAt ? <Typography sx={{ fontSize: "0.68rem", textAlign: "center" }}>{fullDate(o.orderedAt)}</Typography> : i === 1 && o.eta ? <Typography sx={{ fontSize: "0.68rem", textAlign: "center", color: o.overdue ? "error.main" : "text.secondary" }}>{fullDate(o.eta)}</Typography> : i === 2 && o.deliveredAt ? <Typography sx={{ fontSize: "0.68rem", textAlign: "center" }}>{fullDate(o.deliveredAt)}</Typography> : undefined}>
                  {t(`procurement.orderDrawer.step_${s}`)}
                </StepLabel>
              </Step>
            ))}
          </Stepper>
          <Box>
            <InfoRow label={t("procurement.orderDrawer.supplier")} value={o.supplierName || "—"} />
            {(o.supplierContact || o.supplierPhone) && <InfoRow label={t("procurement.orderDrawer.contact")} value={[o.supplierContact, o.supplierPhone && formatPhoneDisplay(o.supplierPhone)].filter(Boolean).join(" · ")} />}
            {o.requestId != null && (
              <InfoRow
                label={t("procurement.orderDrawer.request")}
                value={
                  <Link component="button" type="button" underline="hover" onClick={() => onOpenRequest(o.requestId as number)}>
                    {o.requestNumber || `#${o.requestId}`}
                  </Link>
                }
              />
            )}
            {o.warehouseName && <InfoRow label={t("procurement.orderDrawer.warehouse")} value={o.warehouseName} />}
            {o.terms && <InfoRow label={t("procurement.orderDrawer.terms")} value={o.terms} />}
            {o.doc && <InfoRow label={t("procurement.orderDrawer.doc")} value={o.doc} />}
            {o.waybill && <InfoRow label={t("procurement.orderDrawer.waybill")} value={o.waybill} />}
          </Box>
          {o.docId != null && (
            <Link component={RouterLink} to={`/edo?doc=${o.docId}`} underline="hover" sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
              {t("procurement.orderDrawer.edo")}
            </Link>
          )}
          {detail && detail.items.length > 0 && (
            <Box>
              <SectionTitle>{t("procurement.orderDrawer.items")}</SectionTitle>
              <MiniTable
                head={[t("procurement.request.nom"), t("procurement.request.qty"), t("procurement.request.price"), t("procurement.request.amount")]}
                rows={[...detail.items.map((i) => [i.nomName, `${qty(i.qty)} ${i.unit}`, formatKGS(i.price), formatKGS(i.amount)]), [<strong key="t">{t("procurement.request.total")}</strong>, "", "", <strong key="s">{formatKGS(detail.total)}</strong>]]}
              />
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
      <ConfirmDialog open={shipping} title={t("procurement.orderDrawer.shipTitle")} text={o?.number} confirmLabel={t("procurement.orderDrawer.ship")} busy={ship.isPending} error={ship.error} onConfirm={() => ship.mutate()} onClose={() => setShipping(false)}>
        <TextField size="small" label={t("procurement.orderDrawer.waybillLabel")} value={waybill} onChange={(e) => setWaybill(e.target.value)} />
      </ConfirmDialog>
    </Shell>
  );
}

export function SupplierDrawer({ id, preview, onClose, onOpenOrder }: { id: number | null; preview: Supplier | null; onClose: () => void; onOpenOrder: (id: number) => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const query = useQuery({ queryKey: supplyKeys.supplier(scope, id ?? 0), queryFn: ({ signal }) => getSupplier(id as number, scope, signal), enabled: id != null && scope.orgReady !== false, staleTime: 30_000 });
  const detail = query.data && query.data.id === id ? query.data : null;
  const s = detail ?? (preview && preview.id === id ? preview : null);
  return (
    <Shell open={id != null} onClose={onClose} eyebrow={s?.category ?? ""} title={s?.name ?? ""}>
      {!s && query.isLoading && <Skeleton variant="rounded" height={240} />}
      {!s && query.error && <Alert severity="error">{message(query.error, t("procurement.supplierDrawer.notFound"))}</Alert>}
      {s && (
        <>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Rating value={s.rating} precision={0.1} readOnly size="small" />
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>{s.rating.toLocaleString("ru-RU")}</Typography>
          </Box>
          <Box>
            <InfoRow label={t("procurement.supplierDrawer.inn")} value={s.inn || "—"} />
            <InfoRow label={t("procurement.supplierDrawer.contact")} value={s.contact || "—"} />
            {s.phone && <InfoRow label={t("procurement.supplierDrawer.phone")} value={<Link href={`tel:${s.phone}`}>{formatPhoneDisplay(s.phone)}</Link>} />}
            {s.terms && <InfoRow label={t("procurement.supplierDrawer.terms")} value={s.terms} />}
            {s.bank && <InfoRow label={t("procurement.supplierDrawer.bank")} value={s.bank} />}
            <InfoRow label={t("procurement.supplierDrawer.ordersCount")} value={String(s.ordersCount)} />
            <InfoRow label={t("procurement.supplierDrawer.ordersTotal")} value={formatKGS(s.ordersTotal)} />
            <InfoRow label={t("procurement.supplierDrawer.edoDocs")} value={String(s.edoDocsCount)} />
            <InfoRow label={t("procurement.supplierDrawer.onTime")} value={s.onTimePct != null ? `${s.onTimePct}%` : "—"} tone={s.onTimePct != null && s.onTimePct < 80 ? "warning" : null} />
          </Box>
          {detail && detail.orders.length > 0 && (
            <Box>
              <SectionTitle>{t("procurement.supplierDrawer.orders")}</SectionTitle>
              {detail.orders.map((o) => (
                <Box key={o.id} sx={{ py: 0.75, display: "flex", alignItems: "baseline", gap: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                  <Link component="button" type="button" underline="hover" onClick={() => onOpenOrder(o.id)} sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                    {o.number}
                  </Link>
                  <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: "0.75rem", color: "text.secondary" }}>
                    {[o.projectName, fullDate(o.orderedAt)].filter(Boolean).join(" · ")}
                  </Typography>
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>{formatKGS(o.total)}</Typography>
                  <StatusPill label={o.statusLabel || o.status} tone={orderTone(o.status, o.overdue)} />
                </Box>
              ))}
            </Box>
          )}
        </>
      )}
    </Shell>
  );
}

export interface RequestPreset {
  projectId: number | null;
  items: { nomId: number; qty: number }[];
}

interface ItemDraft {
  nom: Nomenclature | null;
  qty: string;
}

/** «＋ Заявка» на материалы; «заказать» у позиции ниже минимума приходит с готовой строкой. */
export function RequestFormDrawer({ preset, onClose, onCreated }: { preset: RequestPreset | null; onClose: () => void; onCreated?: (r: SupplyRequest) => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshSupply();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const open = preset != null;
  const projects = useConstructionProjects(open).data ?? [];
  const nomsData = useNomenclature(open).data;
  const noms = React.useMemo(() => nomsData ?? [], [nomsData]);
  const [title, setTitle] = React.useState("");
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [needBy, setNeedBy] = React.useState<Dayjs | null>(null);
  const [items, setItems] = React.useState<ItemDraft[]>([]);
  const [note, setNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () =>
      createRequest(
        {
          title,
          projectId: projectId as number,
          needBy: isoDate(needBy),
          items: items.filter((i) => i.nom && parseNumber(i.qty) != null).map((i) => ({ nomId: (i.nom as Nomenclature).id, qty: parseNumber(i.qty) as number })),
          note,
        },
        scope,
      ),
    onSuccess: (r) => {
      refresh();
      enqueueSnackbar(t("procurement.requestForm.created"), { variant: "success" });
      onClose();
      if (onCreated) onCreated(r);
      else navigate(`/supply/procurement?request=${r.id}`);
    },
  });
  React.useEffect(() => {
    if (!preset) return;
    setTitle("");
    setProjectId(preset.projectId ?? "");
    setNeedBy(dayjs().add(7, "day"));
    setNote("");
    setTouched(false);
    save.reset();
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  // Строки из «заказать» подставляем, когда справочник номенклатуры загрузился.
  React.useEffect(() => {
    if (!preset) return;
    const rows = preset.items.map((i) => ({ nom: noms.find((n) => n.id === i.nomId) ?? null, qty: String(i.qty) }));
    setItems(rows.length ? rows : [{ nom: null, qty: "" }]);
    if (rows.length === 1 && rows[0].nom) setTitle((prev) => prev || rows[0].nom?.name || "");
  }, [preset, noms]);

  const filled = items.filter((i) => i.nom && (parseNumber(i.qty) ?? 0) > 0);
  const rowBad = (i: ItemDraft) => (i.nom != null || i.qty.trim() !== "") && (!i.nom || !((parseNumber(i.qty) ?? 0) > 0));
  const invalid = { title: !title.trim(), project: projectId === "", items: filled.length === 0 || items.some(rowBad) };
  const total = filled.reduce((sum, i) => sum + (i.nom as Nomenclature).price * (parseNumber(i.qty) as number), 0);

  return (
    <FormDrawer
      open={open}
      title={t("procurement.requestForm.title")}
      submitLabel={t("procurement.requestForm.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!Object.values(invalid).some(Boolean)) save.mutate();
      }}
    >
      <TextField size="small" label={t("procurement.requestForm.name")} value={title} onChange={(e) => setTitle(e.target.value)} error={touched && invalid.title} helperText={touched && invalid.title ? t("common.required") : undefined} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
        <TextField select size="small" label={t("procurement.requestForm.project")} value={projectId} onChange={(e) => setProjectId(Number(e.target.value))} error={touched && invalid.project} helperText={touched && invalid.project ? t("common.required") : undefined}>
          {projects.map((p) => (
            <MenuItem key={p.projectId} value={p.projectId}>
              {p.projectName}
            </MenuItem>
          ))}
        </TextField>
        <CustomDatePicker label={t("procurement.requestForm.needBy")} value={needBy} onChange={(v) => setNeedBy(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true } }} />
      </Box>
      <Typography sx={{ fontWeight: 700, fontSize: "0.875rem" }}>{t("procurement.requestForm.items")}</Typography>
      {items.map((item, i) => (
        <Box key={i} sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 110px auto", gap: 1, alignItems: "start" }}>
          <Autocomplete
            size="small"
            options={noms}
            value={item.nom}
            onChange={(_, value) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, nom: value } : x)))}
            getOptionLabel={(o) => o.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderOption={(props, o) => (
              <li {...props} key={o.id}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: "0.875rem" }}>{o.name}</Typography>
                  <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{[o.category, `${formatKGS(o.price)} / ${o.unit}`].filter(Boolean).join(" · ")}</Typography>
                </Box>
              </li>
            )}
            renderInput={(params) => <TextField {...params} label={t("procurement.requestForm.nom")} error={touched && rowBad(item) && !item.nom} />}
          />
          <TextField
            size="small"
            label={item.nom ? `${t("procurement.requestForm.qty")}, ${item.nom.unit}` : t("procurement.requestForm.qty")}
            value={item.qty}
            inputMode="decimal"
            onChange={(e) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
            error={touched && rowBad(item) && !((parseNumber(item.qty) ?? 0) > 0)}
          />
          <Tooltip title={t("procurement.requestForm.removeItem")}>
            <span>
              <IconButton aria-label={t("procurement.requestForm.removeItem")} disabled={items.length === 1} onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))} sx={{ color: "error.main" }}>
                <DeleteOutlineOutlined fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ))}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Button size="small" startIcon={<AddOutlined />} onClick={() => setItems((prev) => [...prev, { nom: null, qty: "" }])}>
          {t("procurement.requestForm.addItem")}
        </Button>
        {total > 0 && <Typography sx={{ ml: "auto", fontSize: "0.8125rem", fontWeight: 700 }}>{formatKGS(total)}</Typography>}
      </Box>
      {touched && invalid.items && <Alert severity="warning">{t("procurement.requestForm.itemsRequired")}</Alert>}
      <TextField size="small" label={t("procurement.requestForm.note")} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
    </FormDrawer>
  );
}
