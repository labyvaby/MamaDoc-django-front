import React from "react";
import {
  Box,
  ButtonBase,
  Dialog,
  FormControlLabel,
  IconButton,
  InputBase,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { posRequest, type PosScope } from "../../api/pos";
import { getGiftCertificateSettings } from "../../api/promotions";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import {
  giftCardExpiryLabel,
  nominalInputToCents,
  validateCertificateForm,
  type PosCertificateDraft,
} from "./certificateCart";
import { PosClientFooter } from "./ClientFooter";
import { GiftCard } from "./GiftCard";
import { POS_RADIUS, posColors } from "./layout";
import type { PosClient } from "./types";
import { PosAmount } from "./ui";

/**
 * Продажа подарочного сертификата — через чек кассы (сертификаты v2).
 *
 * Окно только собирает строку: покупатель, сумма, срок и комментарий. «Далее»
 * кладёт сертификат строкой в текущий чек, а деньги принимает обычная оплата
 * чека вместе с товарами. Номер карты выдаёт сервер при оплате.
 */

type Props = {
  open: boolean;
  scope: PosScope;
  organizationName: string;
  /** Логотип организации — печать на карте; нет — монограмма. */
  organizationLogoUrl?: string | null;
  /** Право искать клиентов кассы (`actions.clients`). */
  canSearchClients: boolean;
  buyer: PosClient | null;
  onBuyerChange: (client: PosClient | null) => void;
  /** Форма нового клиента кассы; созданный клиент вернётся как `buyer`. */
  onCreateBuyer?: (query: string) => void;
  onClose: () => void;
  onAdd: (draft: PosCertificateDraft) => void;
};

export function CertificateSellDialog({
  open,
  scope,
  organizationName,
  organizationLogoUrl,
  canSearchClients,
  buyer,
  onBuyerChange,
  onCreateBuyer,
  onClose,
  onAdd,
}: Props) {
  const theme = useTheme();
  const c = posColors(theme);
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));

  const [nominal, setNominal] = React.useState("");
  const [expiresOn, setExpiresOn] = React.useState("");
  const [noExpiry, setNoExpiry] = React.useState(false);
  const [expiryTouched, setExpiryTouched] = React.useState(false);
  const [comment, setComment] = React.useState("");
  const [clientQuery, setClientQuery] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [nominalTouched, setNominalTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setNominal("");
    setExpiresOn("");
    setNoExpiry(false);
    setExpiryTouched(false);
    setComment("");
    setClientQuery("");
    setSubmitted(false);
    setNominalTouched(false);
  }, [open]);

  const settings = useQuery({
    queryKey: ["django", "promotions", "certificates", "settings", scope.organizationId],
    queryFn: ({ signal }) => getGiftCertificateSettings(scope.organizationId, signal),
    enabled: open && Boolean(scope.organizationId),
    staleTime: 60_000,
    retry: false,
  });
  // Срок по умолчанию — из настроек модуля, пока кассир сам его не менял.
  React.useEffect(() => {
    if (!open || expiryTouched || !settings.data) return;
    setExpiresOn(settings.data.defaultExpiresOn ?? "");
    setNoExpiry(settings.data.defaultExpiresOn == null);
  }, [open, expiryTouched, settings.data]);

  const clientSearch = useDebouncedValue(clientQuery.trim(), 250);
  const clients = useQuery({
    queryKey: ["pos-workspace", scope.organizationId, scope.branchId, "clients", clientSearch],
    queryFn: ({ signal }) =>
      posRequest<PosClient[]>(scope, `clients/?search=${encodeURIComponent(clientSearch)}`, { signal }),
    enabled: open && canSearchClients && !buyer && Boolean(clientSearch),
  });

  const today = dayjs().format("YYYY-MM-DD");
  const nominalCents = nominalInputToCents(nominal);
  const errors = validateCertificateForm({ buyer, nominal, expiresOn, noExpiry }, today);
  const valid = Object.keys(errors).length === 0;
  const showNominalError = (submitted || nominalTouched) && Boolean(errors.nominal);
  const showExpiryError = (submitted || expiryTouched) && Boolean(errors.expiresOn);
  const expiryLabel = giftCardExpiryLabel(noExpiry, expiresOn);

  const submit = () => {
    setSubmitted(true);
    if (!valid || !buyer) return;
    onAdd({
      key: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()),
      client: { id: buyer.id, name: buyer.name, phone: buyer.phone },
      nominalCents,
      expiresOn: noExpiry ? null : expiresOn,
      noExpiry,
      comment: comment.trim(),
    });
  };

  const label = (text: string, required = false) => (
    <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: c.textDim }}>
      {text}
      {required ? <Box component="span" sx={{ color: c.danger, ml: "3px" }}>*</Box> : null}
    </Typography>
  );
  const fieldError = (text?: string) =>
    text ? <Typography role="alert" sx={{ fontSize: 12, lineHeight: 1.35, color: c.danger }}>{text}</Typography> : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth={false}
      aria-labelledby="pos-certificate-sell-title"
      PaperProps={{
        sx: {
          width: fullScreen ? "100%" : 540,
          maxWidth: "100%",
          maxHeight: fullScreen ? "100%" : "calc(100vh - 48px)",
          m: fullScreen ? 0 : 3,
          borderRadius: fullScreen ? 0 : `${POS_RADIUS.dialog}px`,
          bgcolor: c.page,
          color: c.text,
          backgroundImage: "none",
          border: fullScreen ? "none" : `1px solid ${c.outline}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        gap={1}
        sx={{ px: { xs: 2, md: 3 }, pt: { xs: "max(12px, env(safe-area-inset-top))", md: 2.25 }, pb: 1.25, flexShrink: 0 }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography id="pos-certificate-sell-title" sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1.25 }}>
            Подарочный сертификат
          </Typography>
          <Typography sx={{ fontSize: 13, color: c.textDim, lineHeight: 1.35 }}>
            Добавится строкой в текущий чек — оплата вместе с товарами
          </Typography>
        </Box>
        <IconButton aria-label="Закрыть" onClick={onClose} sx={{ width: 44, height: 44, color: c.textDim }}>
          <CloseOutlined />
        </IconButton>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: { xs: 2, md: 3 }, pb: 2 }}>
        <Box sx={{ pt: 0.5, pb: 2.5, maxWidth: { md: 470 }, mx: "auto" }}>
          <GiftCard
            organizationName={organizationName}
            logoUrl={organizationLogoUrl}
            amountCents={nominalCents}
            holderName={buyer?.name}
            expiryLabel={expiryLabel}
          />
        </Box>

        <Stack gap={2.25}>
          <Stack gap={0.75}>
            {label("Покупатель", true)}
            {canSearchClients ? (
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
                canRegister={Boolean(onCreateBuyer)}
                onCreateClient={onCreateBuyer}
                onChangeClient={() => {
                  onBuyerChange(null);
                  setClientQuery("");
                }}
                onOpenHistory={() => undefined}
              />
            ) : (
              <Typography sx={{ fontSize: 13, color: c.danger }}>
                Нет права искать клиентов кассы — сертификат нельзя выдать на покупателя.
              </Typography>
            )}
            {submitted ? fieldError(errors.buyer) : null}
          </Stack>

          <Stack gap={0.75}>
            {label("Сумма сертификата", true)}
            <InputBase
              value={nominal}
              autoFocus={!fullScreen}
              onChange={(event) => setNominal(event.target.value.replace(/[^\d\s.,]/g, ""))}
              onBlur={() => setNominalTouched(Boolean(nominal.trim()))}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="0"
              inputProps={{ inputMode: "decimal", autoComplete: "off", "aria-label": "Сумма сертификата, сом" }}
              endAdornment={<Box component="span" sx={{ pl: 1, fontSize: 18, fontWeight: 700, color: c.textDim, textDecoration: "underline" }}>с</Box>}
              sx={{
                height: 56,
                minHeight: 56,
                px: 2,
                borderRadius: `${POS_RADIUS.control}px`,
                bgcolor: c.card,
                border: `1px solid ${showNominalError ? c.danger : c.hairline}`,
                fontSize: 24,
                fontWeight: 800,
                color: c.text,
                fontVariantNumeric: "tabular-nums",
                transition: "border-color .15s",
                "&.Mui-focused": { borderColor: showNominalError ? c.danger : c.accent },
                "& input::placeholder": { color: c.textDim, opacity: 0.6 },
              }}
            />
            {showNominalError ? fieldError(errors.nominal) : null}
          </Stack>

          <Stack gap={0.75}>
            {label("Действует до")}
            <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
              <TextField
                type="date"
                value={noExpiry ? "" : expiresOn}
                onChange={(event) => {
                  setExpiryTouched(true);
                  setExpiresOn(event.target.value);
                }}
                disabled={noExpiry}
                error={showExpiryError}
                inputProps={{ min: today, "aria-label": "Действует до (включительно)" }}
                sx={{ flex: "1 1 180px", "& .MuiInputBase-root": { minHeight: 48, borderRadius: `${POS_RADIUS.control}px`, bgcolor: c.card } }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={noExpiry}
                    onChange={(event) => {
                      setExpiryTouched(true);
                      setNoExpiry(event.target.checked);
                    }}
                  />
                }
                label="Бессрочно"
                sx={{ m: 0, minHeight: 44, "& .MuiFormControlLabel-label": { fontWeight: 700, fontSize: 14 } }}
              />
            </Stack>
            {showExpiryError ? (
              fieldError(errors.expiresOn)
            ) : (
              <Typography sx={{ fontSize: 12, color: c.textDim }}>
                {settings.isError
                  ? "Не удалось загрузить срок по умолчанию — укажите дату."
                  : settings.data && settings.data.validityDays > 0
                    ? `По умолчанию — ${settings.data.validityDays} дн. от продажи. Последний день включительно.`
                    : "Последний день действия включительно."}
              </Typography>
            )}
          </Stack>

          <Stack gap={0.75}>
            {label("Комментарий")}
            <TextField
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Например: на день рождения"
              multiline
              minRows={1}
              maxRows={4}
              inputProps={{ maxLength: 500, "aria-label": "Комментарий" }}
              sx={{ "& .MuiInputBase-root": { borderRadius: `${POS_RADIUS.control}px`, bgcolor: c.card } }}
            />
          </Stack>
        </Stack>
      </Box>

      <Stack
        direction="row"
        alignItems="center"
        gap={1.25}
        sx={{
          flexShrink: 0,
          px: { xs: 2, md: 3 },
          pt: 1.5,
          pb: { xs: "max(12px, env(safe-area-inset-bottom))", md: 2 },
          borderTop: `1px solid ${c.outline}`,
          bgcolor: c.card,
        }}
      >
        <Box sx={{ mr: "auto", minWidth: 0 }}>
          <Typography sx={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: c.textDim }}>В чек</Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 900, whiteSpace: "nowrap" }}>
            {Number.isFinite(nominalCents) && nominalCents > 0 ? <PosAmount value={nominalCents / 100} /> : "—"}
          </Typography>
        </Box>
        <ButtonBase
          onClick={onClose}
          sx={{
            // Phones (below md; sm here is 360px) close with the cross in the header.
            display: { xs: "none", md: "inline-flex" },
            minHeight: 48,
            px: 2.25,
            borderRadius: `${POS_RADIUS.control}px`,
            border: `1px solid ${c.hairline}`,
            bgcolor: c.tile,
            color: c.textSoft,
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          Отмена
        </ButtonBase>
        <ButtonBase
          onClick={submit}
          aria-disabled={!valid}
          sx={{
            minHeight: 48,
            px: 2.75,
            gap: 1,
            borderRadius: `${POS_RADIUS.control}px`,
            bgcolor: c.accent,
            color: c.onAccent,
            fontSize: 15,
            fontWeight: 800,
            opacity: valid ? 1 : 0.55,
            transition: "opacity .15s",
          }}
        >
          Далее
          <ArrowForwardRounded sx={{ fontSize: 20 }} />
        </ButtonBase>
      </Stack>
    </Dialog>
  );
}
