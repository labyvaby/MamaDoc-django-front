import { Box, Button, Stack, Typography } from "@mui/material";
import type { RecognitionResult } from "../../api/procurement";

const Details = ({ rows }: { rows: Array<{ label: string; value: string }> }) => (
  <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "minmax(100px, 1fr) 2fr" }, gap: 0.5 }}>
    {rows.map((row, index) => (
      <Box key={index} sx={{ display: "contents" }}>
        <Typography component="dt" variant="caption" color="text.secondary">{row.label}</Typography>
        <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{row.value}</Typography>
      </Box>
    ))}
  </Box>
);

/** Nonstandard columns stay reviewable even when the receipt has no matching field. */
export function RecognitionDetails({ result }: { result: RecognitionResult }) {
  const { document } = result;
  const header = [
    { label: "Номер документа", value: document.number },
    { label: "Дата документа", value: document.date },
    { label: "Поставщик", value: document.supplier.name },
    { label: "ИНН поставщика", value: document.supplier.taxId },
    { label: "Телефон", value: document.supplier.phone },
    { label: "Адрес поставщика", value: document.supplier.address },
    { label: "Покупатель", value: document.buyerName },
    { label: "Условия оплаты", value: document.paymentTerms },
    { label: "Сумма до налогов", value: document.subtotal },
    { label: "НДС", value: document.vatTotal },
    { label: "Итого в документе", value: document.total },
    { label: "Валюта", value: document.currency },
    { label: "Количество в документе", value: document.totalQuantity },
    ...(document.details ?? []),
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json;charset=utf-8" }));
    const link = window.document.createElement("a");
    link.href = url;
    link.download = "invoice-recognition.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Box component="details" sx={{ mt: 1.5, border: 1, borderColor: "divider", borderRadius: 1.5, p: 1.5 }}>
      <Typography component="summary" variant="body2" sx={{ cursor: "pointer", fontWeight: 600 }}>
        Все извлечённые данные · {result.lines.length} поз.
        {document.pagesRead ? ` · страниц: ${document.pagesRead}` : ""}
      </Typography>
      <Stack spacing={2} sx={{ mt: 1.5 }}>
        <Typography variant="caption" color="text.secondary">Сверьте данные с оригиналом. Реквизиты и дополнительные колонки можно скачать целиком.</Typography>
        <Button size="small" variant="outlined" onClick={download} sx={{ alignSelf: "flex-start" }}>Скачать данные JSON</Button>
        <Details rows={header} />
        {result.lines.map((line, index) => (
          <Box component="details" key={index}>
            <Typography component="summary" variant="body2" sx={{ cursor: "pointer", overflowWrap: "anywhere" }}>{index + 1}. {line.name}</Typography>
            <Box sx={{ mt: 1 }}>
              <Details rows={[
                { label: "Страница", value: line.page == null ? null : String(line.page) },
                { label: "Бренд", value: line.brand },
                { label: "Название в документе", value: line.sourceName },
                { label: "Описание", value: line.description },
                { label: "Код модели", value: line.modelCode },
                { label: "Артикул", value: line.sku },
                { label: "Цвет", value: line.color },
                { label: "Размер", value: line.size },
                { label: "Штрихкод", value: line.barcode },
                { label: "Серия", value: line.lotNumber },
                { label: "Срок годности", value: line.expiresAt },
                { label: "Количество", value: line.quantity },
                { label: "Единица", value: line.unit },
                { label: "Цена", value: line.price },
                { label: "Сумма строки", value: line.total },
                ...(line.details ?? []),
                { label: "Исходная строка", value: line.rawText },
              ].filter((row): row is { label: string; value: string } => Boolean(row.value))} />
            </Box>
          </Box>
        ))}
        {document.fullText && <Box component="details">
          <Typography component="summary" variant="body2" sx={{ cursor: "pointer" }}>Полный текст документа</Typography>
          <Typography variant="body2" sx={{ mt: 1, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{document.fullText}</Typography>
        </Box>}
      </Stack>
    </Box>
  );
}
