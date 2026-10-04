import React from "react";
import {
  Alert,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppButton } from "../ui";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { applyKrCalendar, getKrPositions, getVaccines } from "../../api/vaccinations";
import { guessVaccine, krAntigens } from "./krMapping";

type Props = {
  open: boolean;
  onClose: () => void;
};

const NONE = "";

/**
 * «Загрузить календарь КР»: для каждого антигена национального календаря —
 * своя карточка вакцины. Совпадения подставляются по названию; строки
 * календаря создаются или обновляются, календари детей пересчитываются в фоне.
 */
const KrCalendarDialog: React.FC<Props> = ({ open, onClose }) => {
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const [mapping, setMapping] = React.useState<Record<string, number | "">>({});
  const [includeAdult, setIncludeAdult] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const positionsQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.krPositions(orgId),
    queryFn: ({ signal }) => getKrPositions(orgId, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const vaccinesQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.vaccines({ orgId, picker: "kr" }),
    queryFn: ({ signal }) => getVaccines({ organizationId: orgId }, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const antigens = React.useMemo(() => krAntigens(positionsQuery.data ?? []), [positionsQuery.data]);

  React.useEffect(() => {
    if (!open || !vaccinesQuery.data || antigens.length === 0) return;
    setMapping(
      Object.fromEntries(
        antigens.map(({ antigen }) => [antigen, guessVaccine(antigen, vaccinesQuery.data) ?? NONE]),
      ),
    );
    setError(null);
  }, [open, antigens, vaccinesQuery.data]);

  const dosesOf = (antigen: string) =>
    (positionsQuery.data ?? [])
      .filter((p) => p.antigen === antigen && (includeAdult || !p.adult))
      .map((p) => p.label)
      .join(", ");

  const mutation = useMutation({
    mutationFn: () =>
      applyKrCalendar(
        {
          vaccines: Object.fromEntries(
            Object.entries(mapping).filter(([, id]) => id !== NONE) as [string, number][],
          ),
          includeAdult,
        },
        orgId,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось загрузить календарь"),
  });

  const mappedCount = Object.values(mapping).filter((id) => id !== NONE).length;

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Календарь прививок КР</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">
            Для каждой инфекции выберите свою карточку вакцины — строки календаря создадутся с
            возрастами, окнами «в сроки» и ограничением по полу (ВПЧ — девочкам). Календари всех
            детей пересчитаются в течение нескольких минут.
          </Typography>
          {antigens.map(({ antigen, label }) => (
            <TextField
              key={antigen}
              select
              size="small"
              fullWidth
              label={label}
              value={mapping[antigen] ?? NONE}
              onChange={(e) =>
                setMapping((m) => ({
                  ...m,
                  [antigen]: e.target.value === NONE ? NONE : Number(e.target.value),
                }))
              }
              helperText={dosesOf(antigen)}
            >
              <MenuItem value={NONE}>
                <em>Не использовать</em>
              </MenuItem>
              {(vaccinesQuery.data ?? []).map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.name}
                  {v.funding === "state" ? " · гос." : ""}
                </MenuItem>
              ))}
            </TextField>
          ))}
          <FormControlLabel
            control={
              <Checkbox checked={includeAdult} onChange={(e) => setIncludeAdult(e.target.checked)} />
            }
            label="Добавить взрослые ревакцинации АДС-М (16, 26, 36, 46, 56 лет)"
          />
        </Stack>
      </DialogContent>
      <Stack direction="row" spacing={1.5} sx={{ px: 3, pb: 2, justifyContent: "flex-end" }}>
        <AppButton variant="outlined" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </AppButton>
        <AppButton
          variant="contained"
          onClick={() => mutation.mutate()}
          disabled={mappedCount === 0 || mutation.isPending}
        >
          Загрузить
        </AppButton>
      </Stack>
    </Dialog>
  );
};

export default KrCalendarDialog;
