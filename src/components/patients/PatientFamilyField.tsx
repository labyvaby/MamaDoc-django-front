import React from "react";
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import {
  createPatientFamily,
  getPatientFamilies,
  type DjangoFamily,
} from "../../api/patients";

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

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
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
    <Box>
      <Autocomplete
        options={options}
        value={value}
        loading={loading}
        onOpen={() => void load()}
        onInputChange={(_, input) => { if (input.length >= 2) void load(input); }}
        onChange={(_, next) => onChange(next)}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        renderInput={(params) => (
          <TextField {...params} label="Семья" placeholder="Выберите семью" disabled={disabled} />
        )}
        disabled={disabled}
        noOptionsText="Семьи не найдены"
      />
      <Button size="small" startIcon={<AddOutlined />} onClick={() => setDialogOpen(true)} disabled={disabled} sx={{ mt: 0.5 }}>
        Создать семью
      </Button>
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Новая семья</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Название семьи" value={name} onChange={(e) => { setName(e.target.value); setCreateError(null); }} error={Boolean(createError)} helperText={createError ?? undefined} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleCreate()} disabled={!name.trim()}>Создать</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PatientFamilyField;
