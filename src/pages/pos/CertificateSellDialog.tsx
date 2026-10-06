import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { ApiError, getErrorFields } from "../../api/client";
import {
  lookupPosCertificate,
  posRequest,
  sellPosCertificate,
  type PosBootstrap,
  type PosCertificateSale,
  type PosScope,
  type PosTender,
} from "../../api/pos";
import { getGiftCertificateSettings, type GiftCertificateDetail } from "../../api/promotions";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import {
  amountToCents,
  centsToAmount,
  certificateExpiryLabel,
  cleanCertificateCode,
} from "../certificates/certificateMeta";
import { PosClientFooter } from "./ClientFooter";
import { formatPosError, toPosUserError } from "./errors";
import { formatPosAmount } from "./format";
import { POS_RADIUS, posColors } from "./layout";
import type { PosClient } from "./types";
import { PosAmount } from "./ui";

/**
 * Продажа подарочного сертификата на кассе (docs/certificates-contract.md §2).
 *
 * Сертификат — физическая карта: номер вводят руками или сканером. Деньги
 * за неё — аванс: в кассе и смене они видны отдельной операцией, но в
 * выручку не входят — выручка появится, когда сертификатом оплатят товар.
 */

type Method = "cash" | "card" | "cashless" | "split";

const METHOD_LABELS: Record<Method, string> = {
  cash: "Наличные",
  card: "Карта",
  cashless: "Безнал",
  split: "Частями",
};

const QUICK_NOMINALS = [1000, 2000, 3000, 5000, 10000];

/** `details.fields` keys shown under their own inputs rather than in the banner. */
const INLINE_FIELDS = new Set(["code", "nominal", "expiresOn"]);

type Props = {
  open: boolean;
  scope: PosScope;
  /** Bootstrap with `actions` already intersected with the user's rights. */
  bootstrap: PosBootstrap;
  /** Card number read by the till's barcode scanner while the dialog is open. */
  scan: { code: string; key: number } | null;
  buyer: PosClient | null;
  onBuyerChange: (client: PosClient | null) => void;
  /** Opens the client form of the till; the created client comes back as `buyer`. */
  onCreateBuyer?: (query: string) => void;
  onClose: () => void;
  onSold: (certificate: GiftCertificateDetail) => void;
};

/** Error text for the cashier: the server's own message for 400, the till catalog otherwise. */
const errorText = (error: unknown) =>
  error instanceof ApiError && error.status === 400 && error.message
    ? error.message
    : formatPosError(toPosUserError(error));

export function CertificateSellDialog({
  open,
  scope,
  bootstrap,
  scan,
  buyer,
  onBuyerChange,
  onCreateBuyer,
  onClose,
  onSold,
}: Props) {
  const theme = useTheme();
  const c = posColors(theme);
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const actions = bootstrap.actions;
  const methods = (["cash", "card", "cashless", "split"] as const).filter(
    (method) => actions[method] && (method !== "split" || (actions.cash && actions.card)),
  );

  const codeRef = React.useRef<HTMLInputElement>(null);
  const [code, setCode] = React.useState("");
  const [nominal, setNominal] = React.useState("");
  const [expiresOn, setExpiresOn] = React.useState("");
  const [noExpiry, setNoExpiry] = React.useState(false);
  const [expiryTouched, setExpiryTouched] = React.useState(false);
  const [recipientName, setRecipientName] = React.useState("");
  const [recipientPhone, setRecipientPhone] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [method, setMethod] = React.useState<Method | "">(methods[0] ?? "");
  const [received, setReceived] = React.useState("");
  const [cashPart, setCashPart] = React.useState("");
  const [cashlessId, setCashlessId] = React.useState<number | "">(bootstrap.cashlessMethods[0]?.id ?? "");
  const [clientQuery, setClientQuery] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  // One key per request body: a retry of the same sale is answered from the
  // idempotency store; a corrected form is a new request with a new key.
  const attempt = React.useRef({ fingerprint: "", key: "" });

  React.useEffect(() => {
    if (!open) return;
    setCode("");
    setNominal("");
    setExpiresOn("");
    setNoExpiry(false);
    setExpiryTouched(false);
    setRecipientName("");
    setRecipientPhone("");
    setComment("");
    setMethod(methods[0] ?? "");
    setReceived("");
    setCashPart("");
    setCashlessId(bootstrap.cashlessMethods[0]?.id ?? "");
    setClientQuery("");
    setError(null);
    setFieldErrors({});
    attempt.current = { fingerprint: "", key: "" };
    // Reset only when the dialog opens: bootstrap refetches every 30 s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The scanner is caught by the till page at any focus — the code lands here.
  React.useEffect(() => {
    if (!open || !scan) return;
    setCode(cleanCertificateCode(scan.code));
    setFieldErrors((current) => ({ ...current, code: "" }));
    codeRef.current?.focus();
  }, [open, scan]);

  const settings = useQuery({
    queryKey: ["django", "promotions", "certificates", "settings", scope.organizationId],
    queryFn: ({ signal }) => getGiftCertificateSettings(scope.organizationId, signal),
    enabled: open && Boolean(scope.organizationId),
    staleTime: 60_000,
    retry: false,
  });
  React.useEffect(() => {
    if (!open || expiryTouched || !settings.data) return;
    setExpiresOn(settings.data.defaultExpiresOn ?? "");
    setNoExpiry(settings.data.defaultExpiresOn == null);
  }, [open, expiryTouched, settings.data]);

  const cleanCode = cleanCertificateCode(code);
  const checkedCode = useDebouncedValue(cleanCode, 400);
  // 404 — номер свободен; 200 — карта с таким номером уже продана или выпущена.
  const codeCheck = useQuery({
    queryKey: ["pos-workspace", scope.organizationId, scope.branchId, "certificate-lookup", checkedCode],
    queryFn: ({ signal }) => lookupPosCertificate(scope, checkedCode, signal),
    enabled: open && Boolean(checkedCode),
    retry: false,
    staleTime: 0,
  });
  const codeTaken = checkedCode === cleanCode && Boolean(codeCheck.data);
  const codeFree =
    checkedCode === cleanCode &&
    codeCheck.isError &&
    codeCheck.error instanceof ApiError &&
    codeCheck.error.status === 404;

  const clientSearch = useDebouncedValue(clientQuery.trim(), 250);
  const clients = useQuery({
    queryKey: ["pos-workspace", scope.organizationId, scope.branchId, "clients", clientSearch],
    queryFn: ({ signal }) =>
      posRequest<PosClient[]>(scope, `clients/?search=${encodeURIComponent(clientSearch)}`, { signal }),
    enabled: open && Boolean(actions.clients) && !buyer && Boolean(clientSearch),
  });

  const nominalCents = amountToCents(nominal);
  const nominalValid = Number.isFinite(nominalCents) && nominalCents > 0;
  const receivedCents = amountToCents(received);
  const cashCents = amountToCents(cashPart);
  const cardCents = nominalValid && Number.isFinite(cashCents) ? nominalCents - cashCents : NaN;
  const change =
    method === "cash" && nominalValid && Number.isFinite(receivedCents) ? Math.max(0, receivedCents - nominalCents) : 0;
  const today = dayjs().format("YYYY-MM-DD");
  const expiryValid = noExpiry || !expiresOn || expiresOn >= today;

  const paymentsValid =
    nominalValid &&
    (method === "cash"
      ? !received.trim() || (Number.isFinite(receivedCents) && receivedCents >= nominalCents)
      : method === "card"
        ? true
        : method === "cashless"
          ? cashlessId !== ""
          : method === "split"
            ? Number.isFinite(cashCents) && cashCents > 0 && cardCents > 0
            : false);
  const valid = Boolean(cleanCode) && !codeTaken && nominalValid && expiryValid && paymentsValid;

  const buildPayments = (): PosTender[] => {
    const withMethod = cashlessId !== "" ? { cashlessMethodId: Number(cashlessId) } : {};
    if (method === "cash") return [{ method: "cash", amount: centsToAmount(nominalCents) }];
    if (method === "card") return [{ method: "card", amount: centsToAmount(nominalCents), ...withMethod }];
    if (method === "cashless") return [{ method: "cashless", amount: centsToAmount(nominalCents), ...withMethod }];
    return [
      { method: "cash", amount: centsToAmount(cashCents) },
      { method: "card", amount: centsToAmount(cardCents), ...withMethod },
    ];
  };

  const submit = async () => {
    if (!valid || pending) return;
    const body: PosCertificateSale = {
      code: cleanCode,
      nominal: centsToAmount(nominalCents),
      payments: buildPayments(),
      ...(noExpiry ? { noExpiry: true } : expiresOn ? { expiresOn } : {}),
      ...(buyer ? { clientId: Number(buyer.id) } : {}),
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim(),
      comment: comment.trim(),
      branchId: scope.branchId,
    };
    const fingerprint = JSON.stringify(body);
    if (fingerprint !== attempt.current.fingerprint) {
      attempt.current = { fingerprint, key: crypto.randomUUID() };
    }
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const certificate = await sellPosCertificate(scope, body, attempt.current.key);
      onSold(certificate);
    } catch (caught) {
      const fields = getErrorFields(caught) ?? {};
      setFieldErrors(fields);
      // Errors of the number, nominal and date sit under their fields;
      // everything else (payments, buyer, shift) goes to the banner.
      const rest = Object.entries(fields).filter(([key]) => !INLINE_FIELDS.has(key));
      if (rest.length) setError(rest.map(([, text]) => text).join(" "));
      else if (Object.keys(fields).length === 0) setError(errorText(caught));
    } finally {
      setPending(false);
    }
  };

  const codeHelper = fieldErrors.code
    ? fieldErrors.code
    : codeTaken
      ? `Сертификат с таким номером уже есть (${codeCheck.data?.soldBranchName || "без филиала"}, ${certificateExpiryLabel(codeCheck.data?.expiresAt)}).`
      : codeFree
        ? "Номер свободен"
        : "Введите номер с карты или отсканируйте её";

  const chipSx = (active: boolean) => ({
    px: "12px",
    py: "7px",
    borderRadius: `${POS_RADIUS.pill}px`,
    bgcolor: active ? c.accentBg : c.tile,
    border: `1px solid ${active ? c.accent : c.hairline}`,
    color: active ? c.text : c.textSoft,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap" as const,
    "&.Mui-disabled": { opacity: 0.45 },
  });

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
      fullWidth
      // `sm` в теме — 360px: форме с оплатой и покупателем этого мало.
      maxWidth="md"
      fullScreen={fullScreen}
      PaperProps={{
        sx: {
          width: { md: 640 },
          borderRadius: fullScreen ? 0 : `${POS_RADIUS.dialog}px`,
          backgroundImage: "none",
        },
      }}
    >
      <DialogTitle sx={{ pr: 6 }}>
        Продажа подарочного сертификата
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Деньги за карту — аванс, а не выручка: выручка появится, когда сертификатом оплатят товар.
        </Typography>
        <IconButton
          aria-label="Закрыть"
          onClick={onClose}
          disabled={pending}
          size="small"
          sx={{ position: "absolute", right: 12, top: 12, color: "text.secondary" }}
        >
          <CloseOutlined fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack gap={2}>
          <TextField
            label="Номер карты"
            value={code}
            inputRef={codeRef}
            autoFocus
            onChange={(event) => {
              setCode(event.target.value);
              if (fieldErrors.code) setFieldErrors((current) => ({ ...current, code: "" }));
            }}
            error={Boolean(fieldErrors.code) || codeTaken}
            helperText={codeHelper}
            disabled={pending}
            inputProps={{ autoComplete: "off", "aria-label": "Номер карты сертификата" }}
            InputProps={{
              endAdornment:
                codeCheck.isFetching && checkedCode ? <CircularProgress size={16} sx={{ color: "text.secondary" }} /> : undefined,
            }}
            FormHelperTextProps={{ sx: { color: codeFree && !fieldErrors.code ? "success.main" : undefined } }}
          />

          <Stack gap={1}>
            <TextField
              label="Номинал, сом"
              value={nominal}
              onChange={(event) => setNominal(event.target.value)}
              error={Boolean(fieldErrors.nominal) || (nominal.trim() !== "" && !nominalValid)}
              helperText={fieldErrors.nominal || (nominal.trim() !== "" && !nominalValid ? "Укажите сумму больше нуля" : " ")}
              disabled={pending}
              inputProps={{ inputMode: "decimal", autoComplete: "off" }}
            />
            <Stack direction="row" gap="6px" sx={{ overflowX: "auto", pb: "2px" }}>
              {QUICK_NOMINALS.map((value) => (
                <ButtonBase
                  key={value}
                  onClick={() => setNominal(String(value))}
                  disabled={pending}
                  sx={chipSx(nominalCents === value * 100)}
                >
                  <PosAmount value={value} />
                </ButtonBase>
              ))}
            </Stack>
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems={{ md: "flex-start" }}>
            <TextField
              label="Действует до (включительно)"
              type="date"
              value={noExpiry ? "" : expiresOn}
              onChange={(event) => {
                setExpiryTouched(true);
                setExpiresOn(event.target.value);
              }}
              disabled={pending || noExpiry}
              error={Boolean(fieldErrors.expiresOn) || !expiryValid}
              helperText={
                fieldErrors.expiresOn ||
                (!expiryValid
                  ? "Дата не может быть в прошлом"
                  : settings.data && settings.data.validityDays > 0
                    ? `По умолчанию — ${settings.data.validityDays} дн. от продажи`
                    : " ")
              }
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: today }}
              sx={{ flex: 1 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={noExpiry}
                  onChange={(event) => {
                    setExpiryTouched(true);
                    setNoExpiry(event.target.checked);
                  }}
                  disabled={pending}
                />
              }
              label="Бессрочно"
              sx={{ mt: { md: 1 } }}
            />
          </Stack>

          {actions.clients && (
            <Stack gap={0.75}>
              <Typography variant="body2" fontWeight={600}>
                Покупатель <Typography component="span" variant="caption" color="text.secondary">— необязательно</Typography>
              </Typography>
              <Box sx={{ opacity: pending ? 0.6 : 1, pointerEvents: pending ? "none" : "auto" }}>
                <PosClientFooter
                  client={buyer}
                  query={clientQuery}
                  onQueryChange={setClientQuery}
                  results={clientSearch && !clients.isFetching ? clients.data ?? [] : null}
                  searching={Boolean(clientSearch) && clients.isFetching}
                  onSelectClient={(value) => {
                    onBuyerChange(value);
                    setClientQuery("");
                  }}
                  canRegister={Boolean(actions.client_create) && Boolean(onCreateBuyer)}
                  onCreateClient={onCreateBuyer}
                  onChangeClient={() => {
                    onBuyerChange(null);
                    setClientQuery("");
                  }}
                  onOpenHistory={() => undefined}
                />
              </Box>
            </Stack>
          )}

          <Stack direction={{ xs: "column", md: "row" }} gap={1.5}>
            <TextField
              label="Получатель (кому дарят)"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              disabled={pending}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Телефон получателя"
              value={recipientPhone}
              onChange={(event) => setRecipientPhone(event.target.value)}
              disabled={pending}
              inputProps={{ inputMode: "tel" }}
              sx={{ flex: 1 }}
            />
          </Stack>

          <TextField
            label="Комментарий"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            disabled={pending}
            multiline
            minRows={1}
            maxRows={4}
          />

          <Stack gap={1}>
            <Typography variant="body2" fontWeight={600}>
              Оплата
            </Typography>
            {methods.length === 0 ? (
              <Alert severity="warning">Нет доступного способа оплаты. Обратитесь к администратору.</Alert>
            ) : (
              <Stack direction="row" gap="6px" sx={{ overflowX: "auto", pb: "2px" }}>
                {methods.map((value) => (
                  <ButtonBase
                    key={value}
                    onClick={() => setMethod(value)}
                    disabled={pending}
                    sx={{ ...chipSx(method === value), flex: 1, minWidth: 84, py: "10px", borderRadius: `${POS_RADIUS.control}px` }}
                  >
                    {METHOD_LABELS[value]}
                  </ButtonBase>
                ))}
              </Stack>
            )}
            {method === "cash" && (
              <TextField
                label="Получено от покупателя (для сдачи)"
                value={received}
                onChange={(event) => setReceived(event.target.value)}
                disabled={pending}
                size="small"
                error={received.trim() !== "" && nominalValid && !(Number.isFinite(receivedCents) && receivedCents >= nominalCents)}
                helperText={change > 0 ? `Сдача: ${formatPosAmount(change / 100)} сом` : "Необязательно"}
                inputProps={{ inputMode: "decimal", autoComplete: "off" }}
              />
            )}
            {method === "split" && (
              <TextField
                label="Наличными, сом"
                value={cashPart}
                onChange={(event) => setCashPart(event.target.value)}
                disabled={pending}
                size="small"
                error={cashPart.trim() !== "" && !(Number.isFinite(cashCents) && cashCents > 0 && cardCents > 0)}
                helperText={
                  Number.isFinite(cardCents) && cardCents > 0
                    ? `Картой: ${formatPosAmount(cardCents / 100)} сом`
                    : "Наличная часть должна быть меньше номинала"
                }
                inputProps={{ inputMode: "decimal", autoComplete: "off" }}
              />
            )}
            {method !== "cash" && method !== "" && bootstrap.cashlessMethods.length > 0 && (
              <Stack direction="row" gap="6px" flexWrap="wrap">
                {bootstrap.cashlessMethods.map((item) => (
                  <ButtonBase key={item.id} onClick={() => setCashlessId(item.id)} disabled={pending} sx={chipSx(cashlessId === item.id)}>
                    {item.name}
                  </ButtonBase>
                ))}
              </Stack>
            )}
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5, gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ mr: "auto" }}>
          <Typography variant="caption" color="text.secondary" display="block">
            К оплате
          </Typography>
          <Typography fontWeight={800} fontSize={20}>
            {nominalValid ? <PosAmount value={nominalCents / 100} /> : "—"}
          </Typography>
        </Box>
        <Button onClick={onClose} disabled={pending}>
          Отмена
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={!valid || pending || methods.length === 0}>
          {pending ? "Сохраняем…" : "Продать сертификат"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
