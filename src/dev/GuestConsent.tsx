/**
 * Согласие гостя на хранение и обработку персональных данных в формах брони и
 * гостя: галочка с текстом согласия (посмотреть, распечатать на подпись) и
 * «шлюз» — пока галочки нет, фото паспорта не прикрепляется и не уходит на
 * распознавание: сначала открывается текст согласия, «Гость согласен» — и
 * загрузка продолжается сама. Текст и его редакция — hotelConsent.ts.
 */
import React from "react";
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import PrivacyTipOutlined from "@mui/icons-material/PrivacyTipOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import dayjs from "dayjs";

import type { HotelProperty } from "../api/hotel";
import { consentOperatorGaps, consentParagraphs, renderConsent, useConsentTemplate, type ConsentTemplate, type ConsentVars } from "./hotelConsent";
import { esc, printHtmlDocument } from "./hotelPrintDocs";
import { useHotelProperty } from "./useHotelProperty";

/**
 * Подстановки из объекта: юрлицо и адрес — только из реквизитов на сервере
 * (адрес — юридический, иначе адрес объекта). Реквизиты одного компьютера в
 * юридический документ не идут.
 */
export function useConsentVars(property: HotelProperty | null | undefined): ConsentVars {
  const own = property && "legalName" in property ? property : null;
  return {
    hotel: property?.name ?? "",
    legalName: own?.legalName,
    address: own?.legalAddress || property?.address,
  };
}

export const consentEditionLabel = (t: ConsentTemplate) =>
  `ред. ${t.version}${t.updatedAt ? ` от ${dayjs(t.updatedAt).format("D MMM YYYY")}` : ""}`;

/** Бланк согласия на подпись: текст с подстановками, ФИО гостя (если уже известно), подпись и дата. */
export function printConsent(template: ConsentTemplate, vars: ConsentVars, guestName?: string) {
  if (consentOperatorGaps(vars).length) return;
  const paragraphs = consentParagraphs(renderConsent(template.body, vars));
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(template.title)}</title><style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font: 12.5px/1.55 "Inter", Arial, sans-serif; color: #111; }
    .hotel { text-align: center; font-weight: 700; font-size: 14px; }
    .muted { color: #666; font-size: 11px; }
    h1 { font-size: 16px; text-align: center; margin: 18px 0 4px; }
    p { margin: 0 0 9px; text-align: justify; }
    .row { display: flex; gap: 16px; align-items: flex-end; margin-top: 26px; }
    .line { flex: 1; border-bottom: 1px solid #111; min-height: 18px; padding: 0 4px; }
    .cap { font-size: 10.5px; color: #666; }
  </style></head><body>
    <div class="hotel">Отель «${esc(vars.hotel)}»</div>
    ${vars.legalName ? `<div class="muted" style="text-align:center">${esc(vars.legalName)}</div>` : ""}
    <h1>${esc(template.title)}</h1>
    <div class="muted" style="text-align:center;margin-bottom:16px">Редакция ${esc(template.version)}</div>
    ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}
    <div class="row"><div style="min-width:120px">Гость</div><div class="line">${esc(guestName ?? "")}</div></div>
    <div class="cap" style="margin-left:136px">фамилия, имя, отчество</div>
    <div class="row"><div style="min-width:120px">Подпись</div><div class="line"></div><div style="min-width:50px">Дата</div><div class="line" style="flex:0 0 140px">${esc(dayjs().format("DD.MM.YYYY"))}</div></div>
  </body></html>`;
  printHtmlDocument(html);
}

interface ConsentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Есть — показывается кнопка согласия (в «шлюзе» — «Гость согласен — продолжить»). */
  onAgree?: () => void;
  agreeLabel?: string;
  /** Пояснение над текстом — зачем окно открылось само. */
  lead?: string;
  guestName?: string;
  /** Предпросмотр из настроек — несохранённая редакция. */
  template?: ConsentTemplate;
}

export const ConsentDialog: React.FC<ConsentDialogProps> = ({ open, onClose, onAgree, agreeLabel = "Гость согласен", lead, guestName, template: draft }) => {
  const theme = useTheme();
  const { property } = useHotelProperty();
  const saved = useConsentTemplate(property?.id);
  const template = draft ?? saved;
  const vars = useConsentVars(property);
  const paragraphs = consentParagraphs(renderConsent(template.body, vars));
  const operatorGaps = consentOperatorGaps(vars);

  return (
    <Dialog open={open} onClose={onClose} maxWidth={false} fullWidth PaperProps={{ sx: { maxWidth: 600, borderRadius: "16px", backgroundImage: "none" } }}>
      <Stack direction="row" gap={1.5} alignItems="center" sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: "12px",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            color: "primary.main",
            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.18 : 0.1),
          }}
        >
          <PrivacyTipOutlined />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={800} sx={{ lineHeight: 1.25, textWrap: "balance" }}>
            {template.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Отель «{vars.hotel}» · {consentEditionLabel(template)}
          </Typography>
        </Box>
      </Stack>
      <DialogContent sx={{ pt: 0.5 }}>
        {lead && (
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 600 }}>
            {lead}
          </Typography>
        )}
        {operatorGaps.length > 0 && (
          <Alert severity="warning" variant="outlined" sx={{ mb: 1.5 }}>
            В согласии не назван оператор персональных данных — не заполнены {operatorGaps.join(" и ")} в реквизитах (Настройки → Отель →
            Реквизиты). Пока их нет, бланк на подпись не печатается.
          </Alert>
        )}
        <Box
          sx={{
            maxHeight: "48vh",
            overflowY: "auto",
            px: 2,
            py: 1.5,
            borderRadius: "12px",
            border: 1,
            borderColor: "divider",
            bgcolor: theme.palette.mode === "dark" ? alpha("#fff", 0.03) : alpha("#000", 0.02),
          }}
        >
          {paragraphs.map((p, i) => (
            <Typography key={i} variant="body2" sx={{ lineHeight: 1.6, mb: i === paragraphs.length - 1 ? 0 : 1.25, whiteSpace: "pre-line" }}>
              {p}
            </Typography>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          «Печать» — бланк с этим текстом на подпись гостю. Текст меняется в настройках объекта.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 0, gap: 1, flexWrap: "wrap" }}>
        <Tooltip title={operatorGaps.length ? "Сначала заполните реквизиты отеля" : "Распечатать бланк, чтобы гость подписал"}>
          <Box component="span" sx={{ mr: "auto" }}>
            <Button
              color="inherit"
              startIcon={<PrintOutlined fontSize="small" />}
              onClick={() => printConsent(template, vars, guestName)}
              disabled={operatorGaps.length > 0}
            >
              Печать
            </Button>
          </Box>
        </Tooltip>
        <Button color="inherit" onClick={onClose}>
          {onAgree ? "Отмена" : "Закрыть"}
        </Button>
        {onAgree && (
          <Button variant="contained" disableElevation onClick={onAgree} sx={{ borderRadius: "10px", fontWeight: 700 }}>
            {agreeLabel}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

/** Галочка согласия над фото документа. */
export const GuestConsentField: React.FC<{ checked: boolean; onChange: (v: boolean) => void; guestName?: string; disabled?: boolean }> = ({
  checked,
  onChange,
  guestName,
  disabled,
}) => {
  const theme = useTheme();
  const { property } = useHotelProperty();
  const template = useConsentTemplate(property?.id);
  const [open, setOpen] = React.useState(false);
  const tone = checked ? theme.palette.success.main : theme.palette.text.primary;

  return (
    <>
      <Stack
        direction="row"
        gap={0.5}
        alignItems="flex-start"
        sx={{
          pr: 1.5,
          py: 0.75,
          borderRadius: "10px",
          border: "1px solid",
          borderColor: checked ? alpha(tone, 0.45) : "divider",
          bgcolor: checked ? alpha(tone, theme.palette.mode === "dark" ? 0.1 : 0.05) : "transparent",
          transition: "border-color .2s ease, background-color .2s ease",
        }}
      >
        <Checkbox
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          color="success"
          inputProps={{ "aria-label": "Гость согласен на хранение и обработку персональных данных" }}
          sx={{ mt: -0.25 }}
        />
        <Box sx={{ minWidth: 0, pt: 0.75 }}>
          <Typography
            variant="body2"
            fontWeight={600}
            onClick={() => !disabled && onChange(!checked)}
            sx={{ cursor: disabled ? "default" : "pointer", lineHeight: 1.35 }}
          >
            Гость согласен на хранение и обработку персональных данных
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
            {checked ? "Можно прикрепить и распознать паспорт. " : "Без согласия паспорт не прикрепляется. "}
            <Box
              component="button"
              type="button"
              onClick={() => setOpen(true)}
              sx={{
                p: 0,
                border: 0,
                background: "none",
                font: "inherit",
                color: "primary.main",
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              Текст согласия
            </Box>{" "}
            · {consentEditionLabel(template)}
          </Typography>
        </Box>
      </Stack>
      <ConsentDialog
        open={open}
        onClose={() => setOpen(false)}
        guestName={guestName}
        onAgree={
          checked
            ? undefined
            : () => {
                onChange(true);
                setOpen(false);
              }
        }
      />
    </>
  );
};

/**
 * Шлюз перед прикреплением паспорта: согласие уже отмечено — действие сразу;
 * нет — окно с текстом, и «Гость согласен — продолжить» отмечает галочку и
 * выполняет отложенное действие (прикрепить и распознать выбранный файл).
 */
export function useConsentGate(consent: boolean, setConsent: (v: boolean) => void, guestName?: string) {
  const pendingRef = React.useRef<(() => void) | null>(null);
  const [open, setOpen] = React.useState(false);

  const request = React.useCallback(
    (action: () => void) => {
      if (consent) {
        action();
        return;
      }
      pendingRef.current = action;
      setOpen(true);
    },
    [consent],
  );

  const close = () => {
    pendingRef.current = null;
    setOpen(false);
  };

  const dialog = (
    <ConsentDialog
      open={open}
      onClose={close}
      guestName={guestName}
      lead="Прежде чем прикрепить паспорт, гость должен согласиться на хранение и обработку данных."
      agreeLabel="Гость согласен — продолжить"
      onAgree={() => {
        const action = pendingRef.current;
        pendingRef.current = null;
        setConsent(true);
        setOpen(false);
        action?.();
      }}
    />
  );

  return { request, dialog };
}
