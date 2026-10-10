import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Skeleton,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";
import AttachFileOutlined from "@mui/icons-material/AttachFileOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DrawOutlined from "@mui/icons-material/DrawOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import MoreHorizOutlined from "@mui/icons-material/MoreHorizOutlined";

import { getErrorCode } from "../../api/client";
import {
  EDO_FILE_ACCEPT,
  EDO_FILE_MAX_BYTES,
  currentStep,
  edoKeys,
  getEdoDocument,
  hasSignature,
  overdueDays,
  runEdoAction,
  uploadEdoFile,
  type EdoAction,
  type EdoDocument,
  type EdoFile,
  type EdoStep,
} from "../../api/edo";
import { downloadProtectedFile } from "../../api/protectedFile";
import { CustomDatePicker } from "../../components/ui";
import { useCanChecker } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatDateRu, formatKGS } from "../../utility/format";
import { EdoStatusChip } from "./EdoStatusChip";

const dateTime = (value: string | null | undefined) => (value ? dayjs(value).format("DD.MM.YYYY, HH:mm") : "");

/** Карточка документа ЭДО: маршрут согласования, подписи, реквизиты, файлы и действия. */
export function DocumentDrawer({ docId, onClose, onOpenDoc }: { docId: number | null; onClose: () => void; onOpenDoc: (id: number) => void }) {
  return (
    <Drawer anchor="right" open={docId != null} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", md: 920 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      {docId != null && <DocumentContent key={docId} docId={docId} onClose={onClose} onOpenDoc={onOpenDoc} />}
    </Drawer>
  );
}

type DialogKind = "approve" | "approveStep" | "reject" | "rework" | "terminate" | "signCompany" | "signCounterparty" | "agreement" | "archive" | "version" | null;

function DocumentContent({ docId, onClose, onOpenDoc }: { docId: number; onClose: () => void; onOpenDoc: (id: number) => void }) {
  const { t } = useT("edo");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { can } = useCanChecker();
  const canManage = can("edo.manage");
  const [tab, setTab] = React.useState<"document" | "history" | "files" | "comments">("document");
  const [dialog, setDialog] = React.useState<DialogKind>(null);
  const [moreAnchor, setMoreAnchor] = React.useState<HTMLElement | null>(null);
  const attachInput = React.useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: edoKeys.document(scope, docId),
    queryFn: ({ signal }) => getEdoDocument(docId, scope, signal),
    enabled: scope.orgReady !== false,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: edoKeys.all });

  const action = useMutation({
    mutationFn: (next: EdoAction) => runEdoAction(docId, next, scope),
    onSuccess: (_, next) => {
      enqueueSnackbar(t(next.kind === "archive" && next.exportTo1C ? "action.done.archiveExported" : `action.done.${next.kind}`), { variant: "success" });
      setDialog(null);
      refresh();
    },
    onError: (error) => {
      // Шаг уже согласовали из другого окна — перечитываем карточку, а не держим устаревшие кнопки.
      const code = getErrorCode(error);
      if (code === "STEP_NOT_CURRENT") {
        enqueueSnackbar(t("action.stepNotCurrent"), { variant: "warning" });
        setDialog(null);
        refresh();
        return;
      }
      if (code === "NOT_STEP_APPROVER") {
        enqueueSnackbar(t("action.notStepApprover"), { variant: "error" });
        return;
      }
      enqueueSnackbar(error instanceof Error ? error.message : t("action.failed"), { variant: "error" });
    },
  });
  const upload = useMutation({
    mutationFn: ({ kind, file, note }: { kind: "attachments" | "versions"; file: File; note?: string }) => uploadEdoFile(docId, kind, file, scope, note),
    onSuccess: () => {
      enqueueSnackbar(t("action.done.upload"), { variant: "success" });
      setDialog(null);
      refresh();
    },
    onError: (error) => enqueueSnackbar(error instanceof Error ? error.message : t("action.failed"), { variant: "error" }),
  });

  const pickAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > EDO_FILE_MAX_BYTES) return void enqueueSnackbar(t("action.fileTooBig"), { variant: "error" });
    upload.mutate({ kind: "attachments", file });
  };

  const doc = query.data;
  const busy = action.isPending || upload.isPending;

  return (
    <>
      <Box sx={{ px: { xs: 2, md: 3 }, pt: 2.5, pb: 2, display: "flex", alignItems: "flex-start", gap: 2, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {doc ? (
            <>
              <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "primary.onSurface" }}>
                {doc.typeName} · {doc.number}
              </Typography>
              <Typography component="h2" sx={{ mt: 0.5, fontSize: "1.3rem", fontWeight: 700 }}>
                {doc.title}
              </Typography>
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                {[doc.counterparty, doc.projectName, doc.amount ? formatKGS(doc.amount) : null].filter(Boolean).join(" · ")}
              </Typography>
            </>
          ) : (
            <Skeleton width={320} height={60} />
          )}
        </Box>
        {doc && (
          <Box sx={{ display: "grid", justifyItems: "end", gap: 0.5 }}>
            <EdoStatusChip status={doc.status} label={doc.statusLabel || t(`status.${doc.status}`)} />
            {overdueDays(doc) > 0 && <EdoStatusChip status="rejected" tone="error" label={t("table.overdueDays", { count: overdueDays(doc) })} />}
            {doc.responsibleName && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("card.responsible", { name: doc.responsibleName })}</Typography>}
          </Box>
        )}
        <IconButton aria-label={t("common.close")} onClick={onClose} sx={{ mt: -0.5, mr: -1 }}>
          <CloseOutlined />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", px: { xs: 2, md: 3 }, py: 2 }}>
        {query.isError ? (
          <Alert severity="error">
            {t("card.loadError")}: {query.error instanceof Error ? query.error.message : ""}
          </Alert>
        ) : !doc ? (
          <Skeleton variant="rounded" height={460} />
        ) : (
          <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1.5fr) minmax(0, 1fr)" }, alignItems: "start" }}>
            <Box sx={{ minWidth: 0 }}>
              <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" sx={{ mb: 1.5, minHeight: 40, "& .MuiTab-root": { minHeight: 40, textTransform: "none" } }}>
                <Tab value="document" label={t("card.tabDocument")} />
                <Tab value="history" label={t("card.tabHistory", { count: doc.history.length })} />
                <Tab value="files" label={t("card.tabFiles", { count: doc.attachments.length + doc.versions.length })} />
                <Tab value="comments" label={t("card.tabComments", { count: doc.comments.length })} />
              </Tabs>
              {tab === "document" && <DocumentTab doc={doc} onOpenDoc={onOpenDoc} />}
              {tab === "history" && <HistoryTab doc={doc} />}
              {tab === "files" && <FilesTab doc={doc} />}
              {tab === "comments" && <CommentsTab doc={doc} canManage={canManage} busy={busy} onSend={(text) => action.mutate({ kind: "comment", text })} />}
            </Box>
            <Box sx={{ display: "grid", gap: 2.5, minWidth: 0 }}>
              <RouteBlock doc={doc} />
              <Requisites doc={doc} />
            </Box>
          </Box>
        )}
      </Box>

      {doc && (
        <ActionBar
          doc={doc}
          canManage={canManage}
          busy={busy}
          onAction={(next) => action.mutate(next)}
          onDialog={setDialog}
          onAttach={() => attachInput.current?.click()}
          onMore={setMoreAnchor}
        />
      )}
      <input ref={attachInput} type="file" hidden accept={EDO_FILE_ACCEPT} onChange={pickAttachment} />

      {doc && (
        <>
          <MoreMenu anchor={moreAnchor} doc={doc} onClose={() => setMoreAnchor(null)} onAction={(next) => action.mutate(next)} onDialog={setDialog} onAttach={() => attachInput.current?.click()} />
          <TextDialog
            kind={dialog}
            doc={doc}
            busy={action.isPending}
            onClose={() => setDialog(null)}
            onSubmit={(next) => action.mutate(next)}
          />
          <SignDialog open={dialog === "signCompany" || dialog === "signCounterparty"} party={dialog === "signCounterparty" ? "counterparty" : "company"} busy={action.isPending} onClose={() => setDialog(null)} onSubmit={(next) => action.mutate(next)} />
          <ArchiveDialog open={dialog === "archive"} busy={action.isPending} onClose={() => setDialog(null)} onSubmit={(next) => action.mutate(next)} />
          <AgreementDialog open={dialog === "agreement"} busy={action.isPending} onClose={() => setDialog(null)} onSubmit={(next) => action.mutate(next)} />
          <VersionDialog open={dialog === "version"} busy={upload.isPending} onClose={() => setDialog(null)} onSubmit={(file, note) => upload.mutate({ kind: "versions", file, note })} />
        </>
      )}
    </>
  );
}

// ─── Действия ──────────────────────────────────────────────────────────────

/**
 * Кнопки внизу карточки. «Согласовать / Отклонить» — по полям документа
 * (`canApprove`, `canApproveOnBehalf`), остальное — по `edo.manage` и статусу.
 */
function ActionBar({
  doc,
  canManage,
  busy,
  onAction,
  onDialog,
  onAttach,
  onMore,
}: {
  doc: EdoDocument;
  canManage: boolean;
  busy: boolean;
  onAction: (action: EdoAction) => void;
  onDialog: (kind: DialogKind) => void;
  onAttach: () => void;
  onMore: (anchor: HTMLElement) => void;
}) {
  const { t } = useT("edo");
  const step = currentStep(doc);
  const companySigned = hasSignature(doc, "company");
  const counterpartySigned = hasSignature(doc, "counterparty");
  const buttons: React.ReactNode[] = [];

  if (doc.status === "review") {
    if (doc.canApprove || step?.canApprove) {
      buttons.push(
        <Button key="reject" variant="outlined" color="error" disabled={busy} onClick={() => onDialog("reject")}>
          {t("action.reject")}
        </Button>,
        <Button key="approve" variant="contained" color="success" startIcon={<CheckOutlined />} disabled={busy} onClick={() => onDialog("approve")}>
          {t("action.approve")}
        </Button>,
      );
    } else if (step && (doc.canApproveOnBehalf || step.canApproveOnBehalf)) {
      buttons.push(
        <Button key="behalf" variant="contained" color="success" startIcon={<CheckOutlined />} disabled={busy} onClick={() => onDialog("approveStep")}>
          {t("action.approveOnBehalf")}
        </Button>,
      );
    }
  }
  if (canManage) {
    if (doc.status === "draft")
      buttons.push(
        <Button key="submit" variant="contained" disabled={busy} onClick={() => onAction({ kind: "submit" })}>
          {t("action.submit")}
        </Button>,
      );
    if (doc.status === "rejected")
      buttons.push(
        <Button key="rework" variant="contained" disabled={busy} onClick={() => onDialog("rework")}>
          {t("action.rework")}
        </Button>,
      );
    if (doc.status === "signing") {
      if (!companySigned)
        buttons.push(
          <Button key="signCompany" variant="contained" startIcon={<DrawOutlined />} disabled={busy} onClick={() => onDialog("signCompany")}>
            {t("action.signCompany")}
          </Button>,
        );
      else if (!doc.waitingCounterparty && !doc.sentAt)
        buttons.push(
          <Button key="send" variant="contained" disabled={busy} onClick={() => onAction({ kind: "sendToCounterparty" })}>
            {t("action.sendToCounterparty")}
          </Button>,
        );
      // Подпись контрагента — только после подписи компании (иначе бэк ответит 409).
      else if (!counterpartySigned)
        buttons.push(
          <Button key="signCounterparty" variant="contained" startIcon={<DrawOutlined />} disabled={busy} onClick={() => onDialog("signCounterparty")}>
            {t("action.signCounterparty")}
          </Button>,
        );
    }
    if (doc.status === "signed")
      buttons.push(
        <Button key="archive" variant="contained" disabled={busy} onClick={() => onDialog("archive")}>
          {t("action.archive")}
        </Button>,
      );
    if (doc.status === "archived" && !doc.exported)
      buttons.push(
        <Button key="export" variant="contained" disabled={busy} onClick={() => onAction({ kind: "export1c" })}>
          {t("action.export1c")}
        </Button>,
      );
  }

  const waiting = doc.status === "review" && step && !(doc.canApprove || step.canApprove);

  if (!buttons.length && !canManage && !waiting) return null;
  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 1.5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, borderTop: 1, borderColor: "divider" }}>
      {waiting && step && (
        <Typography sx={(th) => ({ px: 1.25, py: 0.75, borderRadius: "8px", fontSize: "0.8125rem", bgcolor: subtleBg(th) })}>
          {t("card.waitingDecision", { name: step.approverName || step.name, position: step.position })}
        </Typography>
      )}
      <Box sx={{ ml: "auto", display: "flex", flexWrap: "wrap", gap: 1 }}>
        {canManage && (
          <>
            <Button variant="outlined" startIcon={<AttachFileOutlined />} disabled={busy} onClick={onAttach}>
              {t("action.addAttachment")}
            </Button>
            <IconButton aria-label={t("action.more")} disabled={busy} onClick={(e) => onMore(e.currentTarget)} sx={{ border: 1, borderColor: "divider", borderRadius: "10px" }}>
              <MoreHorizOutlined />
            </IconButton>
          </>
        )}
        {buttons}
      </Box>
    </Box>
  );
}

function MoreMenu({
  anchor,
  doc,
  onClose,
  onAction,
  onDialog,
  onAttach,
}: {
  anchor: HTMLElement | null;
  doc: EdoDocument;
  onClose: () => void;
  onAction: (action: EdoAction) => void;
  onDialog: (kind: DialogKind) => void;
  onAttach: () => void;
}) {
  const { t } = useT("edo");
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const items: [string, () => void][] = [];
  if (doc.status === "review" || (doc.status === "signing" && (doc.waitingCounterparty || Boolean(doc.sentAt)))) items.push([t("action.remind"), () => onAction({ kind: "remind" })]);
  if (doc.status === "review" || doc.status === "signing") items.push([t("action.rework"), () => onDialog("rework")]);
  items.push([t("action.addVersion"), () => onDialog("version")]);
  items.push([t("action.addAttachment"), onAttach]);
  if (doc.status === "signed" || doc.status === "archived") items.push([t("action.additionalAgreement"), () => onDialog("agreement")]);
  if (doc.status === "signed") items.push([t("action.terminate"), () => onDialog("terminate")]);
  if ((doc.status === "signed" || doc.status === "archived") && !doc.exported) items.push([t("action.export1c"), () => onAction({ kind: "export1c" })]);
  return (
    <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={onClose} anchorOrigin={{ vertical: "top", horizontal: "right" }} transformOrigin={{ vertical: "bottom", horizontal: "right" }}>
      {items.map(([label, fn]) => (
        <MenuItem key={label} onClick={run(fn)}>
          {label}
        </MenuItem>
      ))}
    </Menu>
  );
}

// ─── Диалоги ───────────────────────────────────────────────────────────────

/** Решение с текстом: согласовать, отклонить (причина обязательна), вернуть, расторгнуть. */
function TextDialog({ kind, doc, busy, onClose, onSubmit }: { kind: DialogKind; doc: EdoDocument; busy: boolean; onClose: () => void; onSubmit: (action: EdoAction) => void }) {
  const { t } = useT("edo");
  const [text, setText] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const open = kind === "approve" || kind === "approveStep" || kind === "reject" || kind === "rework" || kind === "terminate";
  React.useEffect(() => {
    if (open) {
      setText("");
      setTouched(false);
    }
  }, [open, kind]);
  if (!open) return null;
  const step = currentStep(doc);
  const required = kind === "reject" || kind === "terminate";
  const title = { approve: "approveTitle", approveStep: "approveOnBehalfTitle", reject: "rejectTitle", rework: "reworkTitle", terminate: "terminateTitle" }[kind];
  const label = { approve: "commentOptional", approveStep: "commentOptional", reject: "rejectReason", rework: "reworkNote", terminate: "terminateReason" }[kind];
  const submit = () => {
    setTouched(true);
    if (required && !text.trim()) return;
    const value = text.trim();
    if (kind === "approve") onSubmit({ kind: "approve", comment: value });
    if (kind === "approveStep" && step) onSubmit({ kind: "approveStep", stepId: step.id, comment: value });
    if (kind === "reject") onSubmit({ kind: "reject", comment: value });
    if (kind === "rework") onSubmit({ kind: "rework", note: value });
    if (kind === "terminate") onSubmit({ kind: "terminate", reason: value });
  };
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 460 } }}>
      <DialogTitle>{t(`dialog.${title}`)}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {kind === "approveStep" && step && <Alert severity="info">{t("dialog.approveOnBehalfHint", { name: step.approverName || step.name, position: step.position })}</Alert>}
        <TextField
          autoFocus
          multiline
          minRows={3}
          size="small"
          label={t(`dialog.${label}`)}
          value={text}
          onChange={(e) => setText(e.target.value)}
          error={touched && required && !text.trim()}
          helperText={touched && required && !text.trim() ? t("dialog.reasonRequired") : undefined}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("dialog.cancel")}
        </Button>
        <Button variant="contained" color={kind === "reject" || kind === "terminate" ? "error" : "primary"} disabled={busy} onClick={submit}>
          {t("dialog.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SignDialog({ open, party, busy, onClose, onSubmit }: { open: boolean; party: "company" | "counterparty"; busy: boolean; onClose: () => void; onSubmit: (action: EdoAction) => void }) {
  const { t } = useT("edo");
  const { activeEmployee } = usePermissions();
  const [name, setName] = React.useState("");
  const [position, setPosition] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    // Подпись компании по умолчанию ставит текущий сотрудник; контрагента вводим руками.
    setName(party === "company" ? (activeEmployee?.fullName ?? "") : "");
    setPosition("");
  }, [open, party, activeEmployee]);
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 440 } }}>
      <DialogTitle>{party === "company" ? t("dialog.signTitle") : t("dialog.signCounterpartyTitle")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <TextField size="small" label={t("dialog.signerName")} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <TextField size="small" label={t("dialog.signerPosition")} value={position} onChange={(e) => setPosition(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("dialog.cancel")}
        </Button>
        <Button variant="contained" disabled={busy || !name.trim()} onClick={() => onSubmit({ kind: "sign", party, signerName: name.trim(), signerPosition: position.trim() })}>
          {t("dialog.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** «В архив»: по умолчанию без выгрузки в 1С — выгрузить можно и позже кнопкой «Выгрузить в 1С». */
function ArchiveDialog({ open, busy, onClose, onSubmit }: { open: boolean; busy: boolean; onClose: () => void; onSubmit: (action: EdoAction) => void }) {
  const { t } = useT("edo");
  const [exportTo1C, setExportTo1C] = React.useState(false);
  React.useEffect(() => {
    if (open) setExportTo1C(false);
  }, [open]);
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 440 } }}>
      <DialogTitle>{t("dialog.archiveTitle")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1, pt: "8px !important" }}>
        <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{t("dialog.archiveText")}</Typography>
        <FormControlLabel control={<Checkbox size="small" checked={exportTo1C} onChange={(e) => setExportTo1C(e.target.checked)} />} label={t("dialog.archiveExport")} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("dialog.cancel")}
        </Button>
        <Button variant="contained" disabled={busy} onClick={() => onSubmit({ kind: "archive", exportTo1C })}>
          {t("action.archive")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AgreementDialog({ open, busy, onClose, onSubmit }: { open: boolean; busy: boolean; onClose: () => void; onSubmit: (action: EdoAction) => void }) {
  const { t } = useT("edo");
  const [title, setTitle] = React.useState("");
  const [changes, setChanges] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [deadline, setDeadline] = React.useState<Dayjs | null>(null);
  React.useEffect(() => {
    if (open) {
      setTitle("");
      setChanges("");
      setAmount("");
      setDeadline(null);
    }
  }, [open]);
  const lines = changes.split("\n").map((line) => line.trim()).filter(Boolean);
  const amountValue = amount.trim() ? Number(amount.replace(/\s/g, "").replace(",", ".")) : null;
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 520 } }}>
      <DialogTitle>{t("dialog.agreementTitle")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <TextField size="small" label={t("dialog.agreementName")} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <TextField size="small" multiline minRows={3} label={t("dialog.agreementChanges")} value={changes} onChange={(e) => setChanges(e.target.value)} />
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
          <TextField size="small" inputMode="decimal" label={t("dialog.agreementAmount")} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <CustomDatePicker label={t("dialog.agreementDeadline")} value={deadline} onChange={(value) => setDeadline(value as Dayjs | null)} slotProps={{ textField: { size: "small" } }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("dialog.cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={busy || !title.trim() || lines.length === 0 || (amountValue != null && !(amountValue >= 0))}
          onClick={() => onSubmit({ kind: "additionalAgreement", title: title.trim(), changes: lines, amount: amountValue, deadline: deadline ? deadline.format("YYYY-MM-DD") : null })}
        >
          {t("dialog.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function VersionDialog({ open, busy, onClose, onSubmit }: { open: boolean; busy: boolean; onClose: () => void; onSubmit: (file: File, note: string) => void }) {
  const { t } = useT("edo");
  const { enqueueSnackbar } = useSnackbar();
  const [file, setFile] = React.useState<File | null>(null);
  const [note, setNote] = React.useState("");
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (open) {
      setFile(null);
      setNote("");
    }
  }, [open]);
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 460 } }}>
      <DialogTitle>{t("dialog.versionTitle")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <Box>
          <Button variant="outlined" startIcon={<AttachFileOutlined />} onClick={() => input.current?.click()}>
            {file ? file.name : t("dialog.pickFile")}
          </Button>
          <Typography sx={{ mt: 0.5, fontSize: "0.75rem", color: "text.secondary" }}>{t("dialog.fileHint")}</Typography>
          <input
            ref={input}
            type="file"
            hidden
            accept={EDO_FILE_ACCEPT}
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (picked && picked.size > EDO_FILE_MAX_BYTES) return void enqueueSnackbar(t("action.fileTooBig"), { variant: "error" });
              setFile(picked);
            }}
          />
        </Box>
        <TextField size="small" multiline minRows={2} label={t("dialog.versionNote")} value={note} onChange={(e) => setNote(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("dialog.cancel")}
        </Button>
        <Button variant="contained" disabled={busy || !file} onClick={() => file && onSubmit(file, note.trim())}>
          {t("dialog.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Правая колонка ────────────────────────────────────────────────────────

const sectionTitleSx = { mb: 1, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.secondary" } as const;

function StepDot({ state, index }: { state: EdoStep["state"] | "sign" | "signed"; index: number | null }) {
  return (
    <Box
      sx={(th) => {
        const done = state === "done" || state === "signed";
        const color = done ? th.palette.success.main : state === "rejected" ? th.palette.error.main : state === "current" ? th.palette.warning.main : th.palette.text.disabled;
        return {
          width: 26,
          height: 26,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          borderRadius: "50%",
          fontSize: "0.75rem",
          fontWeight: 700,
          color: done || state === "rejected" ? th.palette.getContrastText(color) : color,
          bgcolor: done || state === "rejected" ? color : "transparent",
          border: `2px solid ${color}`,
          "& .MuiSvgIcon-root": { fontSize: 15 },
        };
      }}
    >
      {state === "done" || state === "signed" ? <CheckOutlined /> : state === "rejected" ? <CloseOutlined /> : state === "sign" ? <DrawOutlined /> : index}
    </Box>
  );
}

function RouteBlock({ doc }: { doc: EdoDocument }) {
  const { t } = useT("edo");
  const company = doc.signatures.find((s) => s.party === "company");
  const counterparty = doc.signatures.find((s) => s.party === "counterparty");
  const rows: { key: string; dot: React.ReactNode; title: string; hint: string; active?: boolean }[] = doc.route.map((step, i) => ({
    key: `step-${step.id}`,
    dot: <StepDot state={step.state} index={i + 1} />,
    title: step.approverName || step.name,
    hint: [step.position, step.at ? dateTime(step.at) : t(`card.stepState.${step.state}`), step.comment ? `«${step.comment}»` : ""].filter(Boolean).join(" · "),
    active: step.state === "current",
  }));
  if (doc.requiresEsign) {
    rows.push({
      key: "sign-company",
      dot: <StepDot state={company ? "signed" : "sign"} index={null} />,
      title: t("card.signCompany"),
      hint: company ? t("card.signedBy", { name: company.name, date: dateTime(company.at) }) : t("card.signPending"),
    });
    rows.push({
      key: "sign-counterparty",
      dot: <StepDot state={counterparty ? "signed" : "sign"} index={null} />,
      title: t("card.signCounterparty"),
      hint: counterparty ? t("card.signedBy", { name: counterparty.name, date: dateTime(counterparty.at) }) : t("card.signPendingCounterparty"),
    });
  }
  return (
    <Box>
      <Typography sx={sectionTitleSx}>{t("card.route")}</Typography>
      {rows.length === 0 ? (
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("card.routeEmpty")}</Typography>
      ) : (
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none" }}>
          {rows.map((row, i) => (
            <Box component="li" key={row.key} sx={{ display: "flex", gap: 1.25, position: "relative", pb: i === rows.length - 1 ? 0 : 1.5 }}>
              {i < rows.length - 1 && <Box aria-hidden sx={{ position: "absolute", left: 12, top: 28, bottom: 2, width: 2, bgcolor: "divider" }} />}
              {row.dot}
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: row.active ? 700 : 600, fontSize: "0.8125rem" }}>{row.title}</Typography>
                <Typography sx={{ fontSize: "0.72rem", color: row.active ? "warning.onSurface" : "text.secondary" }}>{row.hint}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function Requisites({ doc }: { doc: EdoDocument }) {
  const { t } = useT("edo");
  const items: [string, React.ReactNode][] = [
    [t("card.type"), doc.typeName],
    [t("card.date"), formatDateRu(doc.date)],
    [t("card.deadline"), doc.deadline ? formatDateRu(doc.deadline) : "—"],
    [t("card.direction"), t(`directionFull.${doc.direction}`, { defaultValue: doc.direction })],
    [t("card.author"), doc.authorName || "—"],
    [t("card.amount"), doc.amount ? formatKGS(doc.amount) : "—"],
  ];
  if (doc.validUntil) items.push([t("card.validUntil"), formatDateRu(doc.validUntil)]);
  return (
    <Box>
      <Typography sx={sectionTitleSx}>{t("card.requisites")}</Typography>
      <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr" }}>
        {items.map(([label, value]) => (
          <Box key={label} sx={{ p: 1.25, border: 1, borderColor: "divider", borderRadius: "10px", minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>{label}</Typography>
            <Typography sx={{ fontWeight: 600, fontSize: "0.8125rem", overflowWrap: "anywhere" }}>{value}</Typography>
          </Box>
        ))}
      </Box>
      {doc.exportedTo1CAt && <Typography sx={{ mt: 1, fontSize: "0.75rem", color: "success.onSurface" }}>{t("card.exported", { date: formatDateRu(doc.exportedTo1CAt) })}</Typography>}
    </Box>
  );
}

// ─── Вкладки ───────────────────────────────────────────────────────────────

const fieldValue = (value: unknown): string => {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.map(fieldValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

function DocumentTab({ doc, onOpenDoc }: { doc: EdoDocument; onOpenDoc: (id: number) => void }) {
  const { t } = useT("edo");
  // PDF по шаблону бэк не рендерит — показываем поля шаблона и файлы документа.
  const fields = Object.entries(doc.fields).filter(([, value]) => value !== null && value !== "");
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box>
        <Typography sx={sectionTitleSx}>{t("card.fields")}</Typography>
        {fields.length === 0 ? (
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("card.fieldsEmpty")}</Typography>
        ) : (
          <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "minmax(120px, 0.8fr) 1.2fr", rowGap: 0.75, columnGap: 2, fontSize: "0.8125rem" }}>
            {fields.map(([key, value]) => (
              <React.Fragment key={key}>
                <Box component="dt" sx={{ color: "text.secondary" }}>
                  {key}
                </Box>
                <Box component="dd" sx={{ m: 0, overflowWrap: "anywhere" }}>
                  {fieldValue(value)}
                </Box>
              </React.Fragment>
            ))}
          </Box>
        )}
      </Box>
      {doc.attachments.length + doc.versions.length > 0 && <FilesTab doc={doc} />}
      {(doc.parent || doc.children.length > 0) && (
        <Box>
          <Typography sx={sectionTitleSx}>{t("card.links")}</Typography>
          <Box sx={{ display: "grid", gap: 0.75 }}>
            {doc.parent && <LinkRow label={t("card.parent")} item={doc.parent} onOpen={onOpenDoc} />}
            {doc.children.map((child) => (
              <LinkRow key={child.id} label={t("card.children")} item={child} onOpen={onOpenDoc} />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function LinkRow({ label, item, onOpen }: { label: string; item: EdoDocument["children"][number]; onOpen: (id: number) => void }) {
  const { t } = useT("edo");
  return (
    <ButtonBase onClick={() => onOpen(item.id)} sx={{ p: 1.25, display: "flex", justifyContent: "space-between", gap: 1, textAlign: "left", border: 1, borderColor: "divider", borderRadius: "10px" }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>{label}</Typography>
        <Typography noWrap sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
          {item.number} · {item.title}
        </Typography>
      </Box>
      <EdoStatusChip status={item.status} label={t(`status.${item.status}`, { defaultValue: item.status })} />
    </ButtonBase>
  );
}

function HistoryTab({ doc }: { doc: EdoDocument }) {
  const { t } = useT("edo");
  if (!doc.history.length) return <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("card.historyEmpty")}</Typography>;
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
      {doc.history.map((entry, i) => (
        <Box component="li" key={`${entry.at}-${i}`} sx={{ py: 1, borderBottom: 1, borderColor: "divider" }}>
          <Typography sx={{ fontSize: "0.8125rem" }}>{entry.text}</Typography>
          <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
            {[entry.by, dateTime(entry.at)].filter(Boolean).join(" · ")}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function FilesTab({ doc }: { doc: EdoDocument }) {
  const { t } = useT("edo");
  if (!doc.attachments.length && !doc.versions.length) return <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("card.filesEmpty")}</Typography>;
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {doc.versions.length > 0 && (
        <Box>
          <Typography sx={sectionTitleSx}>{t("card.versions")}</Typography>
          {doc.versions.map((file) => (
            <FileRow key={`v-${file.id}`} file={file} title={t("card.version", { v: file.version })} />
          ))}
        </Box>
      )}
      {doc.attachments.length > 0 && (
        <Box>
          <Typography sx={sectionTitleSx}>{t("card.attachments")}</Typography>
          {doc.attachments.map((file) => (
            <FileRow key={`a-${file.id}`} file={file} title={file.name} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function FileRow({ file, title }: { file: EdoFile; title: string }) {
  const { t } = useT("edo");
  const scope = useRealtyScope();
  const { enqueueSnackbar } = useSnackbar();
  const [busy, setBusy] = React.useState(false);
  const download = async () => {
    if (!file.url) return;
    setBusy(true);
    try {
      await downloadProtectedFile(file.url, file.name, scope);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t("card.downloadFailed"), { variant: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box sx={{ py: 0.75, display: "flex", alignItems: "center", gap: 1, borderBottom: 1, borderColor: "divider" }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
          {title}
        </Typography>
        <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
          {[file.version != null ? file.name : file.size, file.by, dateTime(file.at), file.note].filter(Boolean).join(" · ")}
        </Typography>
      </Box>
      {file.url && (
        <IconButton aria-label={t("card.download")} disabled={busy} onClick={download} size="small">
          <FileDownloadOutlined fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}

function CommentsTab({ doc, canManage, busy, onSend }: { doc: EdoDocument; canManage: boolean; busy: boolean; onSend: (text: string) => void }) {
  const { t } = useT("edo");
  const [text, setText] = React.useState("");
  const count = React.useRef(doc.comments.length);
  // Комментарий ушёл и пришёл в карточке — очищаем поле.
  React.useEffect(() => {
    if (doc.comments.length > count.current) setText("");
    count.current = doc.comments.length;
  }, [doc.comments.length]);
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      {doc.comments.length === 0 ? (
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("card.commentsEmpty")}</Typography>
      ) : (
        doc.comments.map((comment) => (
          <Box key={comment.id} sx={(th) => ({ p: 1.25, borderRadius: "10px", bgcolor: subtleBg(th) })}>
            <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
              {comment.by} · {dateTime(comment.at)}
            </Typography>
            <Typography sx={{ fontSize: "0.8125rem", whiteSpace: "pre-wrap" }}>{comment.text}</Typography>
          </Box>
        ))
      )}
      {canManage && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
          <TextField size="small" fullWidth multiline maxRows={6} placeholder={t("card.commentPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />
          <Button variant="contained" disabled={busy || !text.trim()} onClick={() => onSend(text.trim())} sx={{ flexShrink: 0 }}>
            {t("card.send")}
          </Button>
        </Box>
      )}
    </Box>
  );
}

