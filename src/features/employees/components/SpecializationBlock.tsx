import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import WorkOutlined from "@mui/icons-material/WorkOutlined";
import {
  getSpecializations,
  linkSpecializationToEmployee,
  unlinkSpecializationFromEmployee,
  type DjangoSpecialization,
  type DjangoSpecializationShort,
} from "../../../api/staff";

export type SpecializationBlockProps = {
  employeeId: number;
  currentSpecializations: DjangoSpecializationShort[];
  onSpecializationsChange: (updated: DjangoSpecializationShort[]) => void;
  canView: boolean;
  canManage: boolean;
  disabled?: boolean;
};

const SpecializationBlock: React.FC<SpecializationBlockProps> = ({
  employeeId,
  currentSpecializations,
  onSpecializationsChange,
  canView,
  canManage,
  disabled,
}) => {
  const [allSpecs, setAllSpecs] = React.useState<DjangoSpecialization[]>([]);
  const [loadingAll, setLoadingAll] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  React.useEffect(() => {
    if (!canView || !canManage) return;
    let cancelled = false;
    setLoadingAll(true);
    getSpecializations()
      .then((list) => {
        if (!cancelled) setAllSpecs(list);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить список специализаций");
      })
      .finally(() => {
        if (!cancelled) setLoadingAll(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canView, canManage]);

  if (!canView) return null;

  const currentIds = new Set(currentSpecializations.map((s) => s.id));
  const available = allSpecs.filter((s) => !currentIds.has(s.id));

  const handleLink = async (spec: DjangoSpecialization) => {
    if (!spec || disabled) return;
    setPendingId(spec.id);
    setError(null);
    try {
      const updated = await linkSpecializationToEmployee(employeeId, spec.id);
      onSpecializationsChange(updated.specializations);
    } catch {
      setError("Не удалось добавить специализацию");
    } finally {
      setPendingId(null);
      setAdding(false);
    }
  };

  const handleUnlink = async (specId: number) => {
    if (disabled) return;
    setPendingId(specId);
    setError(null);
    try {
      const updated = await unlinkSpecializationFromEmployee(employeeId, specId);
      onSpecializationsChange(updated.specializations);
    } catch {
      setError("Не удалось убрать специализацию");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
        Специализации
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ py: 0 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, minHeight: 32 }}>
        {currentSpecializations.map((sp) => (
          <Chip
            key={sp.id}
            label={sp.name}
            size="small"
            icon={<WorkOutlined />}
            variant="outlined"
            onDelete={
              canManage && !disabled
                ? () => handleUnlink(sp.id)
                : undefined
            }
            deleteIcon={
              pendingId === sp.id ? (
                <CircularProgress size={14} />
              ) : undefined
            }
            disabled={pendingId === sp.id}
          />
        ))}
        {currentSpecializations.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Не назначены
          </Typography>
        )}
      </Box>

      {canManage && (
        <>
          {adding ? (
            <Autocomplete
              size="small"
              options={available}
              getOptionLabel={(o) => o.name}
              loading={loadingAll}
              disabled={disabled || loadingAll}
              onChange={(_, val) => {
                if (val) handleLink(val);
                else setAdding(false);
              }}
              onBlur={() => setAdding(false)}
              autoHighlight
              openOnFocus
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Выберите специализацию"
                  autoFocus
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingAll ? <CircularProgress size={16} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          ) : (
            <Typography
              variant="body2"
              color="primary"
              sx={{ cursor: "pointer", width: "fit-content" }}
              onClick={() => !disabled && setAdding(true)}
            >
              + Добавить специализацию
            </Typography>
          )}
        </>
      )}
    </Stack>
  );
};

export default SpecializationBlock;
