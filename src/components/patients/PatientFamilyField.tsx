import React from "react";
import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import {
  createPatientFamily,
  getPatientFamilies,
  type DjangoFamily,
} from "../../api/patients";
import { useFormValidation } from "../../hooks/useFormValidation";
import { capitalizeFullName } from "../../utility/name";
import { FieldLabel } from "../ui";

type Props = {
  value: DjangoFamily | null;
  onChange: (family: DjangoFamily | null) => void;
  branchId?: number | null;
  disabled?: boolean;
};

const PatientFamilyField: React.FC<Props> = ({ value, onChange, branchId, disabled }) => {
  const [options, setOptions] = React.useState<DjangoFamily[]>(value ? [value] : []);
  const [loading, setLoading] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [createError, setCreateError] = React.useState<string | null>(null);

  const load = React.useCallback(async (search = "") => {
    setLoading(true);
    try {
      const families = await getPatientFamilies(search);
      setOptions((prev) => {
        const merged = [...families, ...prev.filter((item) => !families.some((f) => f.id === item.id))];
        return merged;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (value && !options.some((item) => item.id === value.id)) setOptions((prev) => [value, ...prev]);
  }, [value, options]);

  const v = useFormValidation({
    name: name.trim() ? null : "Введите название семьи",
  });

  const handleCreate = async () => {
    if (!v.validate()) return;
    const trimmed = capitalizeFullName(name);
    try {
      const family = await createPatientFamily({ name: trimmed, branchId: branchId ?? null });
      setOptions((prev) => [family, ...prev]);
      onChange(family);
      setName("");
      setCreateError(null);
      setDialogOpen(false);
    } catch {
      setCreateError("Не удалось создать семью");
    }
  };

  return (
    <Stack spacing={0.5}>
      <FieldLabel>Семья</FieldLabel>
      <Stack direction="row" gap={1}>
        <Autocomplete
          sx={{ flex: 1, minWidth: 0 }}
          options={options}
          value={value}
          loading={loading}
          onOpen={() => void load()}
          onInputChange={(_, input) => { if (input.length >= 2) void load(input); }}
          onChange={(_, next) => onChange(next)}
          getOptionLabel={(option) => option.name}
          isOptionEqualToValue={(option, selected) => option.id === selected.id}
          renderInput={(params) => (
            <TextField {...params} placeholder="Выберите семью" disabled={disabled} size="small" />
          )}
          disabled={disabled}
          noOptionsText="Семьи не найдены"
        />
        <Tooltip title="Создать семью">
          <span>
            <IconButton
              onClick={() => setDialogOpen(true)}
              disabled={disabled}
              aria-label="Создать семью"
              sx={(theme) => ({
                width: theme.appLayout.controls.inputHeight,
                height: theme.appLayout.controls.inputHeight,
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                color: "primary.onSurface",
              })}
            >
              <AddOutlined fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Новая семья</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Название семьи"
            value={name}
            onChange={(e) => { setName(e.target.value); setCreateError(null); }}
            onBlur={() => setName(capitalizeFullName(name))}
            sx={{ mt: 1 }}
            ref={v.anchor("name")}
            error={Boolean(createError) || Boolean(v.errorOf("name"))}
            helperText={createError ?? v.errorOf("name") ?? undefined}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleCreate()}>Создать</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default PatientFamilyField;
