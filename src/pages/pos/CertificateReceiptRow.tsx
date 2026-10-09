import React from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";

import CardGiftcardOutlined from "@mui/icons-material/CardGiftcardOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { posColors } from "./layout";
import { PosAmount } from "./ui";

/** Строка «Подарочный сертификат» в чеке: сумма, на кого, срок. */
export type PosReceiptCertificate = {
  key: string;
  clientName: string;
  amount: number;
  /** «до 07.10.2027» или «бессрочно». */
  expiryLabel: string;
  comment?: string;
  /** Номер с карты; пусто — выдаст CRM при оплате. */
  code?: string;
  /** Ошибка сервера по этой строке (например, номер уже выдан). */
  error?: string;
};

/**
 * Сертификат в чеке. Количества и скидки у него нет — только удалить:
 * скидки, акции и бонусы на сертификат не действуют.
 */
export const CertificateReceiptRow: React.FC<{
  certificate: PosReceiptCertificate;
  readOnly?: boolean;
  onRemove?: () => void;
}> = ({ certificate, readOnly = false, onRemove }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={{ xs: "10px", lg: "12px" }}
      sx={{ py: "10px", borderBottom: `1px solid ${c.hairline}` }}
      data-testid="pos-certificate-line"
    >
      {/* Мини-карта: тот же тёмный градиент, что и у подарочной карты окна продажи. */}
      <Box
        aria-hidden
        sx={{
          width: 46,
          height: 29,
          flexShrink: 0,
          borderRadius: "6px",
          display: "grid",
          placeItems: "center",
          background: `radial-gradient(120% 90% at 90% -10%, ${alpha(theme.palette.primary.main, 0.7)} 0%, transparent 60%), linear-gradient(145deg, #1c1733, #07060e)`,
          border: "1px solid rgba(255,255,255,.14)",
          color: "#e6c98a",
        }}
      >
        <CardGiftcardOutlined sx={{ fontSize: 16 }} />
      </Box>
      <Stack gap="3px" sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25, color: c.text }}>
          Подарочный сертификат
        </Typography>
        {certificate.code ? (
          <Typography
            data-testid="pos-certificate-line-code"
            sx={{
              fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
              fontSize: 12.5,
              fontWeight: 700,
              lineHeight: 1.3,
              letterSpacing: ".06em",
              color: c.textSoft,
              // Длинный номер переносится только там, где не помещается.
              overflowWrap: "anywhere",
            }}
          >
            № {certificate.code}
          </Typography>
        ) : null}
        <Typography sx={{ fontSize: 12, lineHeight: 1.3, color: c.textDim, overflowWrap: "anywhere" }}>
          на {certificate.clientName || "покупателя"} · {certificate.expiryLabel}
          {certificate.comment ? ` · ${certificate.comment}` : ""}
        </Typography>
        {certificate.error ? (
          <Typography role="alert" sx={{ fontSize: 12, lineHeight: 1.3, color: c.danger, overflowWrap: "anywhere" }}>
            {certificate.error}
          </Typography>
        ) : null}
      </Stack>
      <Typography noWrap sx={{ flexShrink: 0, fontSize: 15, fontWeight: 900, color: c.text }}>
        <PosAmount value={certificate.amount} />
      </Typography>
      {onRemove ? (
        <IconButton
          disabled={readOnly}
          onClick={onRemove}
          aria-label="Убрать сертификат из чека"
          sx={{
            width: { xs: 44, lg: 28 },
            height: { xs: 44, lg: 28 },
            flexShrink: 0,
            color: c.textDim,
            "&:hover": { color: c.danger },
          }}
        >
          <CloseOutlined sx={{ fontSize: 18 }} />
        </IconButton>
      ) : null}
    </Stack>
  );
};
