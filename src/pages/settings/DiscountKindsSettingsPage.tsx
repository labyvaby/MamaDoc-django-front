import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { createDiscountKind, getDiscountKinds, updateDiscountKind } from "../../api/promotions";
import { usePermissions } from "../../hooks/usePermissions";
import { usePageTitle } from "../../hooks/usePageTitle";
import { SettingsLayout } from "./SettingsLayout";

const key = (branchId: number | null | undefined) =>
  ["django", "promotions", "discount-kinds", "settings", branchId ?? null] as const;

export default function DiscountKindsSettingsPage() {
  usePageTitle("Виды скидок");
  const { activeBranch, activeOrganization, canAccess, loading } = usePermissions();
  const cache = useQueryClient();
  const canManage = canAccess("promotions.manage");
  const [name, setName] = React.useState("");
  const [percent, setPercent] = React.useState("");
  const [branchOnly, setBranchOnly] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const branchId = activeBranch?.id ?? null;
  const list = useQuery({
    queryKey: key(branchId),
    queryFn: ({ signal }) => getDiscountKinds({ includeInactive: true }, signal),
    enabled: !loading && Boolean(activeOrganization),
  });
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ["django", "promotions", "discount-kinds"] });
  };
  const add = async () => {
    const rate = Number(percent);
    if (!name.trim() || !Number.isFinite(rate) || rate <= 0 || rate > 100) {
      setError("Укажите название и процент от 0,01 до 100.");
      return;
    }
    if (branchOnly && branchId == null) {
      setError("Для филиальной скидки выберите филиал в верхней панели.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createDiscountKind({
        name: name.trim(),
        percent,
        branchId: branchOnly ? branchId : null,
      });
      setName("");
      setPercent("");
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить вид скидки.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsLayout>
      <Stack gap={3}>
        <Box>
          <Typography variant="h6" fontWeight={700}>Виды скидок</Typography>
          <Typography variant="body2" color="text.secondary">
            Создайте правила вроде «Пенсионная 25%» или «Студенческая 16%». В кассе выбирают название, а процент берётся с сервера.
          </Typography>
        </Box>
        {!activeOrganization && !loading && <Alert severity="info">Выберите организацию.</Alert>}
        {list.isError && <Alert severity="error">Не удалось загрузить справочник.</Alert>}
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        <Stack gap={1.5} sx={{ maxWidth: 520 }}>
          <TextField label="Название" value={name} onChange={(event) => setName(event.target.value)} disabled={saving || !canManage} />
          <TextField label="Скидка, %" value={percent} onChange={(event) => setPercent(event.target.value)} disabled={saving || !canManage} inputProps={{ inputMode: "decimal" }} />
          <FormControlLabel
            control={<Switch checked={branchOnly} onChange={(_, checked) => setBranchOnly(checked)} disabled={saving || !canManage} />}
            label={branchOnly ? `Только филиал: ${activeBranch?.name ?? "не выбран"}` : "Все филиалы организации"}
          />
          <Box>
            <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <AddOutlined />} onClick={() => void add()} disabled={saving || !activeOrganization || !canManage}>
              Добавить вид скидки
            </Button>
          </Box>
        </Stack>
        <Table size="small">
          <TableHead><TableRow><TableCell>Название</TableCell><TableCell>Скидка</TableCell><TableCell>Область</TableCell><TableCell>Статус</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>
            {list.isLoading && <TableRow><TableCell colSpan={5}><CircularProgress size={20} /></TableCell></TableRow>}
            {(list.data ?? []).map((kind) => (
              <TableRow key={kind.id} hover>
                <TableCell>{kind.name}</TableCell>
                <TableCell>{kind.percent}%</TableCell>
                <TableCell>{kind.branchId == null ? "Все филиалы" : "Отдельный филиал"}</TableCell>
                <TableCell><Chip size="small" label={kind.isActive ? "Активна" : "Отключена"} color={kind.isActive ? "success" : "default"} /></TableCell>
                <TableCell align="right"><Button size="small" disabled={!canManage} onClick={() => void updateDiscountKind(kind.id, { isActive: !kind.isActive }).then(refresh)}>{kind.isActive ? "Отключить" : "Включить"}</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Stack>
    </SettingsLayout>
  );
}
