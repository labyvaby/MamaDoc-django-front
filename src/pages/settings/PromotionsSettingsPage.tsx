import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPromoCode,
  createPromotion,
  getGiftCertificates,
  getPromoCodeRedemptions,
  getPromoCodes,
  getPromotions,
  issueGiftCertificate,
  setPromoCodeActive,
  setPromotionStatus,
  type Promotion,
} from "../../api/promotions";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { SettingsLayout } from "./SettingsLayout";

const keys = {
  promotions: ["django", "promotions", "list"] as const,
  certificates: ["django", "promotions", "certificates"] as const,
  codes: (id: number) => ["django", "promotions", "codes", id] as const,
  redemptions: (id: number) => ["django", "promotions", "redemptions", id] as const,
};

const toIso = (value: string) => value ? new Date(value).toISOString() : null;
const datetime = (value: string | null) => value ? new Date(value).toLocaleString("ru-RU") : "Без срока";

export default function PromotionsSettingsPage() {
  usePageTitle("Акции и промокоды");
  const { activeBranch, activeOrganization, canAccess } = usePermissions();
  const cache = useQueryClient();
  const canManage = canAccess("promotions.manage");
  const [selected, setSelected] = React.useState<Promotion | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [promotionName, setPromotionName] = React.useState("");
  const [promotionPercent, setPromotionPercent] = React.useState("10");
  const [promotionEndsAt, setPromotionEndsAt] = React.useState("");
  const [code, setCode] = React.useState("");
  const [codeLimit, setCodeLimit] = React.useState("100");
  const [codeEndsAt, setCodeEndsAt] = React.useState("");
  const [certificateCode, setCertificateCode] = React.useState("");
  const [certificateAmount, setCertificateAmount] = React.useState("");
  const [certificateEndsAt, setCertificateEndsAt] = React.useState("");
  const promotions = useQuery({
    queryKey: keys.promotions,
    queryFn: ({ signal }) => getPromotions(signal),
    enabled: Boolean(activeOrganization),
  });
  const certificates = useQuery({
    queryKey: keys.certificates,
    queryFn: ({ signal }) => getGiftCertificates(signal),
    enabled: Boolean(activeOrganization),
  });
  const codes = useQuery({
    queryKey: selected ? keys.codes(selected.id) : ["django", "promotions", "codes", null],
    queryFn: ({ signal }) => getPromoCodes(selected!.id, signal),
    enabled: selected !== null,
  });
  const redemptions = useQuery({
    queryKey: selected ? keys.redemptions(selected.id) : ["django", "promotions", "redemptions", null],
    queryFn: async ({ signal }) => {
      const all = await Promise.all((codes.data ?? []).map((item) => getPromoCodeRedemptions(item.id, signal)));
      return all.flat();
    },
    enabled: selected !== null && Boolean(codes.data?.length),
  });
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ["django", "promotions"] });
  };
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить изменения.");
    } finally {
      setBusy(false);
    }
  };
  const addPromotion = () => void run(async () => {
    if (!promotionName.trim() || Number(promotionPercent) <= 0 || Number(promotionPercent) > 100) {
      throw new Error("Укажите название и процент от 0,01 до 100.");
    }
    await createPromotion({
      name: promotionName.trim(),
      promotionType: "cart_percent",
      startsAt: new Date().toISOString(),
      endsAt: toIso(promotionEndsAt),
      branchId: activeBranch?.id ?? null,
      discountPercent: promotionPercent,
      requiresPromoCode: true,
      status: "draft",
    });
    setPromotionName("");
    setPromotionPercent("10");
    setPromotionEndsAt("");
  });
  const addCode = () => void run(async () => {
    if (!selected || !code.trim()) throw new Error("Выберите акцию и укажите промокод.");
    const limit = codeLimit.trim() === "" ? null : Number(codeLimit);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) throw new Error("Лимит использований должен быть целым числом от 1.");
    await createPromoCode(selected.id, { code: code.trim(), usageLimit: limit, expiresAt: toIso(codeEndsAt) });
    setCode("");
    setCodeLimit("100");
    setCodeEndsAt("");
  });
  const addCertificate = () => void run(async () => {
    if (!certificateCode.trim() || Number(certificateAmount) <= 0) throw new Error("Укажите код и номинал сертификата.");
    await issueGiftCertificate({ code: certificateCode.trim(), nominal: certificateAmount, expiresAt: toIso(certificateEndsAt) });
    setCertificateCode("");
    setCertificateAmount("");
    setCertificateEndsAt("");
  });

  return (
    <SettingsLayout>
      <Stack gap={3} sx={{ maxWidth: 1080 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>Акции, промокоды и сертификаты</Typography>
          <Typography variant="body2" color="text.secondary">Акция действует только после включения. У промокода есть срок, общий лимит и журнал каждого фактического использования; один покупатель не может использовать его повторно.</Typography>
        </Box>
        {!activeOrganization && <Alert severity="info">Выберите организацию.</Alert>}
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems="start">
          <TextField label="Название акции" value={promotionName} onChange={(e) => setPromotionName(e.target.value)} disabled={!canManage || busy} />
          <TextField label="Скидка, %" value={promotionPercent} onChange={(e) => setPromotionPercent(e.target.value)} inputProps={{ inputMode: "decimal" }} disabled={!canManage || busy} />
          <TextField label="Окончание (необязательно)" type="datetime-local" value={promotionEndsAt} onChange={(e) => setPromotionEndsAt(e.target.value)} InputLabelProps={{ shrink: true }} disabled={!canManage || busy} />
          <Button variant="contained" onClick={addPromotion} disabled={!canManage || busy}>{busy ? <CircularProgress size={18} color="inherit" /> : "Создать черновик"}</Button>
        </Stack>
        <Table size="small"><TableHead><TableRow><TableCell>Акция</TableCell><TableCell>Условия</TableCell><TableCell>Срок</TableCell><TableCell>Статус</TableCell><TableCell /></TableRow></TableHead><TableBody>
          {promotions.isLoading && <TableRow><TableCell colSpan={5}><CircularProgress size={20} /></TableCell></TableRow>}
          {(promotions.data ?? []).map((promotion) => <TableRow key={promotion.id} selected={selected?.id === promotion.id} hover>
            <TableCell>{promotion.name}</TableCell><TableCell>{promotion.discountPercent}% от чека{promotion.requiresPromoCode ? " · по коду" : ""}</TableCell><TableCell>{datetime(promotion.endsAt)}</TableCell>
            <TableCell><Chip size="small" label={promotion.status === "active" ? "Активна" : promotion.status === "draft" ? "Черновик" : promotion.status === "paused" ? "Приостановлена" : "Завершена"} color={promotion.status === "active" ? "success" : "default"} /></TableCell>
            <TableCell align="right"><Stack direction="row" justifyContent="end"><Button size="small" onClick={() => setSelected(promotion)}>Коды</Button>{canManage && <Button size="small" disabled={busy} onClick={() => void run(() => setPromotionStatus(promotion.id, promotion.status === "active" ? "paused" : "active"))}>{promotion.status === "active" ? "Пауза" : "Включить"}</Button>}</Stack></TableCell>
          </TableRow>)}
        </TableBody></Table>
        {selected && <Stack gap={1.5} sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
          <Typography fontWeight={700}>Промокоды акции «{selected.name}»</Typography>
          <Stack direction={{ xs: "column", md: "row" }} gap={1.5}><TextField label="Промокод" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} disabled={!canManage || busy} /><TextField label="Лимит использований" value={codeLimit} onChange={(e) => setCodeLimit(e.target.value)} disabled={!canManage || busy} /><TextField label="Срок кода" type="datetime-local" value={codeEndsAt} onChange={(e) => setCodeEndsAt(e.target.value)} InputLabelProps={{ shrink: true }} disabled={!canManage || busy} /><Button onClick={addCode} disabled={!canManage || busy}>Добавить код</Button></Stack>
          {(codes.data ?? []).map((item) => <Stack key={item.id} direction="row" gap={1} alignItems="center"><Chip label={item.code} color={item.isActive ? "primary" : "default"} /><Typography variant="body2">{item.usedCount} / {item.usageLimit ?? "∞"} · {datetime(item.expiresAt)}</Typography>{canManage && <Button size="small" onClick={() => void run(() => setPromoCodeActive(item.id, !item.isActive))}>{item.isActive ? "Отключить" : "Включить"}</Button>}</Stack>)}
          {redemptions.data && <Typography variant="body2" color="text.secondary">Использования: {redemptions.data.length}. В журнале сохраняются номер чека, покупатель, сумма скидки и время.</Typography>}
        </Stack>}
        <Divider />
        <Typography variant="h6" fontWeight={700}>Подарочные сертификаты</Typography>
        <Stack direction={{ xs: "column", md: "row" }} gap={1.5}><TextField label="Код сертификата" value={certificateCode} onChange={(e) => setCertificateCode(e.target.value.toUpperCase())} disabled={!canManage || busy} /><TextField label="Номинал, сом" value={certificateAmount} onChange={(e) => setCertificateAmount(e.target.value)} inputProps={{ inputMode: "decimal" }} disabled={!canManage || busy} /><TextField label="Срок (необязательно)" type="datetime-local" value={certificateEndsAt} onChange={(e) => setCertificateEndsAt(e.target.value)} InputLabelProps={{ shrink: true }} disabled={!canManage || busy} /><Button onClick={addCertificate} disabled={!canManage || busy}>Выпустить сертификат</Button></Stack>
        <Table size="small"><TableHead><TableRow><TableCell>Код</TableCell><TableCell>Номинал</TableCell><TableCell>Остаток</TableCell><TableCell>Срок</TableCell><TableCell>Статус</TableCell></TableRow></TableHead><TableBody>{(certificates.data ?? []).map((certificate) => <TableRow key={certificate.id}><TableCell>{certificate.code}</TableCell><TableCell>{certificate.nominal}</TableCell><TableCell>{certificate.balance}</TableCell><TableCell>{datetime(certificate.expiresAt)}</TableCell><TableCell>{certificate.isActive && !certificate.isSpent ? "Активен" : "Закрыт"}</TableCell></TableRow>)}</TableBody></Table>
      </Stack>
    </SettingsLayout>
  );
}
