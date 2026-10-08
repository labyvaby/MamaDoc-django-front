import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";

import { CertificateReceiptRow, type PosReceiptCertificate } from "./CertificateReceiptRow";

import { POS_RADIUS, posColors } from "./layout";
import { PosReceiptRow, RECEIPT_GRID } from "./ReceiptRow";
import type { PosReceiptLine } from "./types";

type Props = {
  canHold?: boolean;
  /** Право `pos.discount` — показывать ли кнопку скидки на позицию. */
  canDiscount?: boolean;
  readOnly?: boolean;
  number: string;
  lines: PosReceiptLine[];
  /** Продаваемые сертификаты — отдельные строки без количества и скидки. */
  certificates?: PosReceiptCertificate[];
  onRemoveCertificate?: (key: string) => void;
  /** Почему «Отложить» недоступно — подсказка на кнопке. */
  holdHint?: string;
  onChangeColor: (lineId: string, colorId: string) => void;
  onChangeSize: (lineId: string, sizeId: string) => void;
  onChangeQuantity: (lineId: string, quantity: number) => void;
  onChangeLineDiscount: (lineId: string, discountAmount: number, discountPercent?: number) => void;
  onRemoveLine: (lineId: string) => void;
  onRestoreLine: (lineId: string) => void;
  onHold: () => void;
  onCancel: () => void;
};

const HEADER_LABELS = ["товар", "кол-во", "цена", "сумма", ""];

/** Кнопка-«таблетка» шапки чека. */
const HeaderButton: React.FC<{ label: string; onClick: () => void; disabled?: boolean; danger?: boolean; title?: string }> = ({
  label,
  onClick,
  disabled,
  danger,
  title,
}) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      title={title}
      sx={{
        height: { xs: 44, md: 40, lg: 30 },
        px: "12px",
        borderRadius: `${POS_RADIUS.pill}px`,
        bgcolor: danger ? "transparent" : c.tile,
        border: `1px solid ${c.outline}`,
        color: danger ? c.danger : c.textSoft,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        "&:hover": { borderColor: danger ? c.danger : c.accent },
        "&.Mui-disabled": { opacity: 0.45 },
      }}
    >
      {label}
    </ButtonBase>
  );
};

/** Чек: номер, счётчики позиций, действия и таблица товаров. */
export const PosReceipt: React.FC<Props> = ({
  number,
  lines,
  onChangeColor,
  onChangeSize,
  onChangeQuantity,
  onChangeLineDiscount,
  onRemoveLine,
  onRestoreLine,
  onHold,
  onCancel,
  canHold = false,
  canDiscount = false,
  readOnly = false,
  certificates = [],
  onRemoveCertificate,
  holdHint,
}) => {
  const theme = useTheme();
  const c = posColors(theme);

  const activeCount = lines.filter((line) => !line.removed).length;
  const removedCount = lines.length - activeCount;
  const units = lines.filter((line) => !line.removed).reduce((total, line) => total + line.quantity, 0);
  const hasContent = lines.length > 0 || certificates.length > 0;
  const counts = [
    activeCount ? `${activeCount} поз. · ${units} шт.` : "",
    certificates.length ? `${certificates.length} серт.` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: c.checkArea,
        border: `1px solid ${c.outline}`,
        borderRadius: `${POS_RADIUS.card}px`,
        overflow: "hidden",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap="8px"
        sx={{ px: { xs: "12px", md: "16px" }, py: "10px", flexShrink: 0, borderBottom: `1px solid ${c.hairline}` }}
      >
        <Stack direction="row" alignItems="baseline" gap="10px" sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 15, fontWeight: 800, color: c.text }}>Чек №{number}</Typography>
          <Typography noWrap sx={{ fontSize: 12, color: c.textDim }}>
            {counts || "пусто"}
            {removedCount > 0 ? (
              <Box component="span" sx={{ color: c.danger }}> · удалено {removedCount}</Box>
            ) : null}
          </Typography>
        </Stack>

        {hasContent && (
          <Stack direction="row" alignItems="center" gap="6px">
            <HeaderButton label="Отложить" onClick={onHold} disabled={!canHold} title={holdHint} />
            <HeaderButton label="Отменить чек" onClick={onCancel} danger />
          </Stack>
        )}
      </Stack>

      {lines.length > 0 && (
        <Box
          sx={{
            display: { xs: "none", lg: "grid" },
            gridTemplateColumns: RECEIPT_GRID,
            columnGap: "12px",
            px: "16px",
            pt: "8px",
            pb: "2px",
            flexShrink: 0,
          }}
        >
          {HEADER_LABELS.map((label, index) => (
            <Typography
              key={index}
              sx={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: ".04em",
                textTransform: "uppercase",
                color: c.textDim,
                textAlign: index === 0 ? "left" : index === 1 ? "center" : "right",
              }}
            >
              {label}
            </Typography>
          ))}
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: { xs: "12px", md: "16px" } }}>
        {lines.map((line) => (
          <PosReceiptRow
            key={line.id}
            line={line}
            readOnly={readOnly}
            canDiscount={canDiscount}
            onChangeColor={(colorId) => onChangeColor(line.id, colorId)}
            onChangeSize={(sizeId) => onChangeSize(line.id, sizeId)}
            onChangeQuantity={(quantity) => onChangeQuantity(line.id, quantity)}
            onChangeLineDiscount={(amount, percent) => onChangeLineDiscount(line.id, amount, percent)}
            onRemove={() => onRemoveLine(line.id)}
            onRestore={() => onRestoreLine(line.id)}
          />
        ))}
        {certificates.map((certificate) => (
          <CertificateReceiptRow
            key={certificate.key}
            certificate={certificate}
            readOnly={readOnly}
            onRemove={onRemoveCertificate ? () => onRemoveCertificate(certificate.key) : undefined}
          />
        ))}
        {!hasContent ? (
          <Stack alignItems="center" justifyContent="center" gap="8px" sx={{ py: { xs: "28px", md: "48px" }, textAlign: "center" }}>
            <Box sx={{ width: 44, height: 44, borderRadius: "50%", bgcolor: c.tile, display: "grid", placeItems: "center" }}>
              <ReceiptLongOutlined sx={{ fontSize: 22, color: c.textDim }} />
            </Box>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: c.textSoft }}>Чек пуст</Typography>
            <Typography sx={{ fontSize: 12, color: c.textDim, maxWidth: 320 }}>
              Найдите товар по названию или отсканируйте штрихкод — он появится здесь.
            </Typography>
          </Stack>
        ) : null}
      </Box>
    </Box>
  );
};
