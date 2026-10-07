import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Skeleton,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { useNavigate } from "react-router";
import dayjs from "dayjs";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import RadioButtonUncheckedOutlined from "@mui/icons-material/RadioButtonUncheckedOutlined";
import SendOutlined from "@mui/icons-material/SendOutlined";

import { estateDashboardKeys } from "../../api/estateDashboard";
import { realtyLeadKeys } from "../../api/realtyLeads";
import {
  BANK_DECISIONS,
  addApplicationDocument,
  bankFits,
  chooseBank,
  getBanks,
  getMortgageApplication,
  realtyMortgageKeys,
  recordBankDecision,
  sendToBanks,
  type ApplicationBank,
  type BankDecision,
  type MortgageApplication,
} from "../../api/realtyMortgage";
import { useCan } from "../../hooks/useCan";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { parseAmount } from "./catalogFormat";
import { BankDecisionChip, MortgageStatusPill } from "./MortgageChips";

/**
 * Карточка ипотечной заявки — шторка `?application=<id>`. Решения банков,
 * «Отправить в банки» (неподходящие по сроку/взносу — серые), решение банка
 * вручную (пока нет интеграции с банками), «Выбрать банк» у одобренных,
 * документы и история. Действия — `realty.manage`.
 */
export function MortgageDrawer({ applicationId, onClose }: { applicationId: number | null; onClose: () => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("realty.manage");
  const [sendOpen, setSendOpen] = React.useState(false);
  const [decisionFor, setDecisionFor] = React.useState<ApplicationBank | null>(null);
  const [doc, setDoc] = React.useState({ name: "", fileUrl: "" });
  const open = applicationId != null;

  React.useEffect(() => {
    setSendOpen(false);
    setDecisionFor(null);
    setDoc({ name: "", fileUrl: "" });
  }, [applicationId]);

  const application = useQuery({
    queryKey: realtyMortgageKeys.detail(scope, applicationId ?? 0),
    queryFn: ({ signal }) => getMortgageApplication(applicationId as number, scope, signal),
    enabled: open && scope.orgReady !== false,
    staleTime: 15_000,
  });

  const done = (fresh: MortgageApplication, toast: string) => {
    queryClient.setQueryData(realtyMortgageKeys.detail(scope, fresh.id), fresh);
    void queryClient.invalidateQueries({ queryKey: realtyMortgageKeys.all });
    enqueueSnackbar(toast, { variant: "success" });
  };
  const failed = (error: unknown) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" });

  // Выбор банка необратим (кредит «выдан», заявка CRM уходит на «Договор / оплата») — через подтверждение.
  const [chooseFor, setChooseFor] = React.useState<{ bankId: number; bankName: string } | null>(null);
  const choose = useMutation({
    mutationFn: (bankId: number) => chooseBank(applicationId as number, bankId, scope),
    onSuccess: (fresh) => {
      setChooseFor(null);
      done(fresh, t("mortgage.card.chosenToast"));
      // Выбор банка двигает заявку CRM на «Договор / оплата».
      void queryClient.invalidateQueries({ queryKey: realtyLeadKeys.all });
      void queryClient.invalidateQueries({ queryKey: estateDashboardKeys.all });
    },
    onError: failed,
  });
  const addDoc = useMutation({
    mutationFn: () => addApplicationDocument(applicationId as number, { name: doc.name.trim(), ...(doc.fileUrl.trim() ? { fileUrl: doc.fileUrl.trim() } : {}) }, scope),
    onSuccess: (fresh) => {
      setDoc({ name: "", fileUrl: "" });
      done(fresh, t("mortgage.card.docAdded"));
    },
    onError: failed,
  });

  const data = application.data;
  const facts: [string, string][] = data
    ? [
        ["unit", [data.unitNumber != null ? `№${data.unitNumber}` : null, data.projectName].filter(Boolean).join(" · ") || "—"],
        ["price", formatKGS(data.price)],
        ["down", `${formatKGS(data.downPayment)} · ${data.downPct}%`],
        ["amount", formatKGS(data.amount)],
        ["term", data.term ? t("mortgage.table.years", { count: data.term }) : "—"],
        ["program", data.programLabel || "—"],
        ["income", data.income != null && data.income > 0 ? formatKGS(data.income) : "—"],
        ["manager", data.manager || "—"],
      ]
    : [];

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{ sx: { width: { xs: "100vw", sm: 560 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
      >
        <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "flex-start", gap: 1, borderBottom: 1, borderColor: "divider" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{data ? [data.number, data.createdAt && dayjs(data.createdAt).format("DD.MM.YYYY")].filter(Boolean).join(" · ") : t("mortgage.card.title")}</Typography>
            {data ? (
              <>
                <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.2rem" }}>
                  {data.buyer}
                </Typography>
                {data.phone && (
                  <Box component="a" href={`tel:${data.phone}`} sx={{ color: "primary.main", fontSize: "0.875rem", textDecoration: "none" }}>
                    {formatPhoneDisplay(data.phone)}
                  </Box>
                )}
              </>
            ) : (
              <Skeleton width={220} height={32} />
            )}
          </Box>
          {data && <MortgageStatusPill status={data.status} label={data.statusLabel} />}
          <IconButton aria-label={t("common.close")} onClick={onClose}>
            <CloseOutlined />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2.25, alignContent: "start" }}>
          {application.isError && <Alert severity="error">{application.error instanceof Error ? application.error.message : t("mortgage.loadError")}</Alert>}
          {!data && !application.isError && [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={56} />)}
          {data && (
            <>
              <Box sx={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr)", rowGap: 0.75, columnGap: 1.5 }}>
                {facts.map(([key, value]) => (
                  <React.Fragment key={key}>
                    <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t(`mortgage.card.${key}`)}</Typography>
                    <Typography sx={{ fontSize: "0.875rem", fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
                  </React.Fragment>
                ))}
              </Box>

              <Divider />
              <Box>
                <Box sx={{ mb: 0.75, display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ flex: 1, fontWeight: 700, fontSize: "0.9rem" }}>{t("mortgage.card.banks")}</Typography>
                  {canManage && data.status !== "signed" && (
                    <Button size="small" variant="outlined" startIcon={<SendOutlined />} onClick={() => setSendOpen(true)}>
                      {t("mortgage.card.send")}
                    </Button>
                  )}
                </Box>
                {data.banks.length === 0 && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("mortgage.card.noBanks")}</Typography>}
                {data.banks.map((bank) => (
                  <Box key={bank.bankId} sx={{ py: 0.9, display: "flex", alignItems: "center", gap: 1, borderTop: 1, borderColor: "divider", flexWrap: "wrap" }}>
                    <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
                      <BankDecisionChip bank={bank} />
                      {(bank.comment || (bank.status === "approved" && bank.monthly != null && bank.monthly > 0)) && (
                        <Typography sx={{ mt: 0.25, fontSize: "0.75rem", color: "text.secondary" }}>
                          {[bank.status === "approved" && bank.monthly != null && bank.monthly > 0 && t("mortgage.card.monthly", { value: formatKGS(bank.monthly) }), bank.comment].filter(Boolean).join(" · ")}
                        </Typography>
                      )}
                    </Box>
                    {data.bankChosen === bank.bankId ? (
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: "success.main" }}>{t("mortgage.card.chosen")}</Typography>
                    ) : (
                      canManage &&
                      data.status !== "signed" && (
                        <>
                          <Button size="small" onClick={() => setDecisionFor(bank)}>
                            {t("mortgage.card.decision")}
                          </Button>
                          {bank.status === "approved" && (
                            <Button size="small" variant="contained" disabled={choose.isPending} onClick={() => setChooseFor({ bankId: bank.bankId, bankName: bank.name })}>
                              {t("mortgage.card.choose")}
                            </Button>
                          )}
                        </>
                      )
                    )}
                  </Box>
                ))}
              </Box>

              <Box>
                <Typography sx={{ mb: 0.5, fontWeight: 700, fontSize: "0.9rem" }}>{t("mortgage.card.docs")}</Typography>
                {data.docs.length === 0 && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("mortgage.card.noDocs")}</Typography>}
                {data.docs.map((d) => (
                  <Box key={d.id} sx={{ py: 0.4, display: "flex", alignItems: "center", gap: 1 }}>
                    {d.ok ? <CheckCircleOutlined sx={{ fontSize: 18, color: "success.main" }} /> : <RadioButtonUncheckedOutlined sx={{ fontSize: 18, color: "text.disabled" }} />}
                    {d.fileUrl ? (
                      <Box component="a" href={d.fileUrl} target="_blank" rel="noreferrer" sx={{ fontSize: "0.875rem", color: "primary.main" }}>
                        {d.name}
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: "0.875rem" }}>{d.name}</Typography>
                    )}
                  </Box>
                ))}
                {canManage && (
                  <Box
                    component="form"
                    onSubmit={(e: React.FormEvent) => {
                      e.preventDefault();
                      if (doc.name.trim()) addDoc.mutate();
                    }}
                    sx={{ mt: 1, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr auto" }, gap: 1, alignItems: "start" }}
                  >
                    <TextField size="small" placeholder={t("mortgage.card.docName")} inputProps={{ "aria-label": t("mortgage.card.docName") }} value={doc.name} onChange={(e) => setDoc({ ...doc, name: e.target.value })} />
                    <TextField size="small" placeholder={t("mortgage.card.docUrl")} inputProps={{ "aria-label": t("mortgage.card.docUrl") }} value={doc.fileUrl} onChange={(e) => setDoc({ ...doc, fileUrl: e.target.value })} />
                    <Button type="submit" variant="outlined" disabled={!doc.name.trim() || addDoc.isPending} sx={{ whiteSpace: "nowrap" }}>
                      {t("mortgage.card.addDoc")}
                    </Button>
                  </Box>
                )}
              </Box>

              {data.history.length > 0 && (
                <Box>
                  <Typography sx={{ mb: 0.5, fontWeight: 700, fontSize: "0.9rem" }}>{t("mortgage.card.history")}</Typography>
                  {data.history.map((h, i) => (
                    <Box key={`${h.at}-${i}`} sx={{ py: 0.5 }}>
                      <Typography sx={{ fontSize: "0.875rem" }}>{h.text}</Typography>
                      <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{[h.by, h.at && dayjs(h.at).format("DD.MM.YYYY HH:mm")].filter(Boolean).join(" · ")}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </>
          )}
        </Box>

        {data?.leadId != null && (
          <Box sx={{ px: 2.5, py: 1.5, display: "flex", borderTop: 1, borderColor: "divider" }}>
            <Button onClick={() => navigate(`/realestate/leads?lead=${data.leadId}`)}>{t("mortgage.card.openLead")}</Button>
          </Box>
        )}
      </Drawer>

      <Dialog open={chooseFor != null} onClose={choose.isPending ? undefined : () => setChooseFor(null)} fullWidth PaperProps={{ sx: { maxWidth: 440 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>{t("mortgage.card.chooseTitle", { bank: chooseFor?.bankName ?? "" })}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{t("mortgage.card.chooseText")}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setChooseFor(null)} disabled={choose.isPending}>
            {t("common.cancel")}
          </Button>
          <Button variant="contained" disabled={choose.isPending} onClick={() => chooseFor && choose.mutate(chooseFor.bankId)}>
            {t("mortgage.card.choose")}
          </Button>
        </DialogActions>
      </Dialog>
      {canManage && data && <SendDialog open={sendOpen} application={data} onClose={() => setSendOpen(false)} onSent={(fresh) => {
        setSendOpen(false);
        done(fresh, t("mortgage.card.sent"));
      }} />}
      {canManage && data && (
        <DecisionDialog
          bank={decisionFor}
          applicationId={data.id}
          onClose={() => setDecisionFor(null)}
          onSaved={(fresh) => {
            setDecisionFor(null);
            done(fresh, t("mortgage.card.decisionSaved"));
          }}
        />
      )}
    </>
  );
}

function SendDialog({ open, application, onClose, onSent }: { open: boolean; application: MortgageApplication; onClose: () => void; onSent: (fresh: MortgageApplication) => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const [picked, setPicked] = React.useState<number[]>([]);
  const banks = useQuery({ queryKey: realtyMortgageKeys.banks(scope), queryFn: ({ signal }) => getBanks(scope, signal), enabled: open && scope.orgReady !== false, staleTime: 5 * 60_000 });
  const sentIds = new Set(application.banks.map((b) => b.bankId));
  React.useEffect(() => {
    if (open) setPicked([]);
  }, [open]);
  const send = useMutation({ mutationFn: () => sendToBanks(application.id, picked, scope), onSuccess: onSent });
  React.useEffect(() => send.reset(), [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при открытии
  return (
    <Dialog open={open} onClose={send.isPending ? undefined : onClose} maxWidth={false} PaperProps={{ sx: { width: 480, maxWidth: "calc(100vw - 32px)" } }}>
      <DialogTitle>{t("mortgage.sendDialog.title")}</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("mortgage.sendDialog.hint")}</Typography>
        {!banks.data && <Skeleton variant="rounded" height={120} />}
        {banks.data?.map((bank) => {
          const fits = bankFits(bank, application);
          const sent = sentIds.has(bank.id);
          return (
            <Box key={bank.id} sx={{ py: 0.25 }}>
              <FormControlLabel
                disabled={!fits || sent}
                control={
                  <Checkbox
                    checked={picked.includes(bank.id)}
                    onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, bank.id] : prev.filter((id) => id !== bank.id)))}
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontSize: "0.875rem" }}>
                      {bank.name} · {bank.mortgageRate}%
                    </Typography>
                    {(sent || !fits) && (
                      <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                        {sent ? t("mortgage.sendDialog.alreadySent") : t("mortgage.sendDialog.unfit", { term: bank.maxTerm, down: bank.minDown })}
                      </Typography>
                    )}
                  </Box>
                }
              />
            </Box>
          );
        })}
        {send.isError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {send.error instanceof Error && send.error.message ? send.error.message : t("common.failed")}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={send.isPending}>
          {t("common.cancel")}
        </Button>
        <Button variant="contained" disabled={picked.length === 0 || send.isPending} onClick={() => send.mutate()}>
          {t("mortgage.sendDialog.submit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DecisionDialog({ bank, applicationId, onClose, onSaved }: { bank: ApplicationBank | null; applicationId: number; onClose: () => void; onSaved: (fresh: MortgageApplication) => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const [form, setForm] = React.useState<{ status: BankDecision; rate: string; comment: string }>({ status: "approved", rate: "", comment: "" });
  React.useEffect(() => {
    if (bank)
      setForm({
        status: (BANK_DECISIONS as readonly string[]).includes(bank.status) ? (bank.status as BankDecision) : "approved",
        rate: bank.rate != null ? String(bank.rate) : "",
        comment: bank.comment,
      });
  }, [bank]);
  const save = useMutation({
    mutationFn: () =>
      recordBankDecision(applicationId, bank?.bankId as number, { status: form.status, rate: form.status === "approved" ? parseAmount(form.rate) : null, comment: form.comment.trim() }, scope),
    onSuccess: onSaved,
  });
  React.useEffect(() => save.reset(), [bank]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при новом банке
  return (
    <Dialog open={bank != null} onClose={save.isPending ? undefined : onClose} maxWidth={false} PaperProps={{ sx: { width: 440, maxWidth: "calc(100vw - 32px)" } }}>
      <DialogTitle>{t("mortgage.decisionDialog.title", { bank: bank?.name ?? "" })}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <TextField select size="small" label={t("mortgage.decisionDialog.status")} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BankDecision })}>
          {BANK_DECISIONS.map((value) => (
            <MenuItem key={value} value={value}>
              {t(`mortgage.decision.${value}`)}
            </MenuItem>
          ))}
        </TextField>
        {form.status === "approved" && (
          <TextField size="small" label={t("mortgage.decisionDialog.rate")} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} inputMode="decimal" />
        )}
        <TextField size="small" label={t("mortgage.decisionDialog.comment")} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} multiline minRows={2} />
        {save.isError && <Alert severity="error">{save.error instanceof Error && save.error.message ? save.error.message : t("common.failed")}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.isPending}>
          {t("common.cancel")}
        </Button>
        <Button variant="contained" disabled={save.isPending || (form.status === "approved" && form.rate.trim() !== "" && parseAmount(form.rate) == null)} onClick={() => save.mutate()}>
          {t("mortgage.decisionDialog.submit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
