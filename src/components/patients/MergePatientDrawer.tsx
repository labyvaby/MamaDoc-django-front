import React from "react";
import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
  CircularProgress,
  Alert,
  Avatar,
  Radio,
  RadioGroup,
  FormControlLabel,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SearchIcon from "@mui/icons-material/Search";
import MergeIcon from "@mui/icons-material/MergeType";
import dayjs from "dayjs";
import { useNotification } from "@refinedev/core";
import {
  searchPatients,
  mergePatients,
  type DjangoPatient,
} from "../../api/patients";
import { parseBackendError } from "../../api/appointments";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Пациент, с которого начинаем (уже выбран в списке) */
  initialPatient: DjangoPatient | null;
  onMerged: () => void;
};

const MergePatientDrawer: React.FC<Props> = ({
  open,
  onClose,
  initialPatient,
  onMerged,
}) => {
  const { open: notify } = useNotification();

  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<DjangoPatient[]>([]);
  const [searching, setSearching] = React.useState(false);

  // Какой из двух будет основным (primary)
  const [primaryId, setPrimaryId] = React.useState<number | null>(null);
  const [selectedDuplicate, setSelectedDuplicate] =
    React.useState<DjangoPatient | null>(null);

  const [busy, setBusy] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSearchResults([]);
      setSelectedDuplicate(null);
      setPrimaryId(initialPatient?.id ?? null);
    } else {
      setPrimaryId(initialPatient?.id ?? null);
    }
  }, [open, initialPatient]);

  // Поиск с дебаунсом (Django API, только в рамках своей организации)
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchPatients(searchQuery.trim(), 10, ctrl.signal);
        // Исключаем самого initialPatient из результатов
        setSearchResults(data.filter((p) => p.id !== initialPatient?.id));
      } catch {
        if (!ctrl.signal.aborted) setSearchResults([]);
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [searchQuery, initialPatient?.id]);

  const canMerge = Boolean(
    initialPatient && selectedDuplicate && primaryId != null,
  );

  const duplicateId =
    primaryId === initialPatient?.id
      ? selectedDuplicate?.id
      : initialPatient?.id;

  const primaryName =
    primaryId === initialPatient?.id
      ? initialPatient?.fullName
      : selectedDuplicate?.fullName;

  const duplicateName =
    duplicateId === selectedDuplicate?.id
      ? selectedDuplicate?.fullName
      : initialPatient?.fullName;

  const handleMerge = () => {
    if (!initialPatient || !selectedDuplicate || primaryId == null) return;
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (primaryId == null || duplicateId == null) return;
    setConfirmOpen(false);
    setBusy(true);
    try {
      await mergePatients(primaryId, duplicateId);
      notify?.({ type: "success", message: "Пациенты объединены" });
      onMerged();
      onClose();
    } catch (e) {
      notify?.({ type: "error", message: parseBackendError(e) });
    } finally {
      setBusy(false);
    }
  };

  const patientA = initialPatient;
  const patientB = selectedDuplicate;

  return (
    <>
      <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 480 },
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <MergeIcon color="primary" />
          <Typography variant="h6">Объединить пациентов</Typography>
        </Stack>
        <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
          <CloseOutlined />
        </IconButton>
      </Box>

      <Divider />

      <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
        <Stack spacing={3}>
          {/* Текущий пациент */}
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
              Выбранный пациент
            </Typography>
            {patientA && (
              <PatientChip patient={patientA} />
            )}
          </Box>

          {/* Поиск дубля */}
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
              Найти дубликат
            </Typography>
            <TextField
              fullWidth
              placeholder="Поиск по имени или телефону…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedDuplicate(null);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    {searching ? <CircularProgress size={16} /> : <SearchIcon fontSize="small" />}
                  </InputAdornment>
                ),
              }}
            />

            {searchResults.length > 0 && (
              <Box sx={{ mt: 1, border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
                {searchResults.map((p) => (
                  <Box
                    key={p.id}
                    onClick={() => {
                      setSelectedDuplicate(p);
                      setSearchQuery(p.fullName);
                      setSearchResults([]);
                    }}
                    sx={{
                      px: 2,
                      py: 1.25,
                      cursor: "pointer",
                      borderBottom: "1px solid",
                      borderColor: "divider",
                      "&:last-child": { borderBottom: "none" },
                      "&:hover": { bgcolor: "action.hover" },
                      bgcolor: selectedDuplicate?.id === p.id ? "action.selected" : "transparent",
                    }}
                  >
                    <Typography variant="body2" fontWeight={500}>{p.fullName}</Typography>
                    {p.phone && (
                      <Typography variant="caption" color="text.secondary">{p.phone}</Typography>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          {/* Выбор основного */}
          {patientA && patientB && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
                Кого оставить основным?
              </Typography>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Дубликат будет удалён, все его приёмы перенесены на основного
              </Alert>
              <RadioGroup
                value={primaryId != null ? String(primaryId) : ""}
                onChange={(e) => setPrimaryId(Number(e.target.value))}
              >
                <Box sx={{ border: "1px solid", borderColor: primaryId === patientA.id ? "primary.main" : "divider", borderRadius: 1, p: 1.5, mb: 1 }}>
                  <FormControlLabel
                    value={String(patientA.id)}
                    control={<Radio size="small" />}
                    label={<PatientChip patient={patientA} compact />}
                    sx={{ m: 0, width: "100%" }}
                  />
                </Box>
                <Box sx={{ border: "1px solid", borderColor: primaryId === patientB.id ? "primary.main" : "divider", borderRadius: 1, p: 1.5 }}>
                  <FormControlLabel
                    value={String(patientB.id)}
                    control={<Radio size="small" />}
                    label={<PatientChip patient={patientB} compact />}
                    sx={{ m: 0, width: "100%" }}
                  />
                </Box>
              </RadioGroup>
            </Box>
          )}
        </Stack>
      </Box>

      <Box sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
        <Stack direction="row" gap={1} justifyContent="flex-end">
          <Button onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!canMerge || busy}
            onClick={handleMerge}
            startIcon={busy ? <CircularProgress size={16} /> : <MergeIcon />}
          >
            Объединить
          </Button>
        </Stack>
      </Box>
    </Drawer>

    <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <WarningAmberIcon color="warning" />
          <Typography variant="h6">Подтвердите объединение</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1.5 }}>
            <Typography variant="caption" color="text.secondary">Основной (останется)</Typography>
            <Typography variant="body1" fontWeight={600}>{primaryName}</Typography>
          </Box>
          <Box sx={{ bgcolor: "error.lighter", borderRadius: 1, p: 1.5, border: "1px solid", borderColor: "error.light" }}>
            <Typography variant="caption" color="error.main">Дубль (будет удалён)</Typography>
            <Typography variant="body1" fontWeight={600}>{duplicateName}</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Все приёмы, продажи и баланс дубля будут перенесены на основного. Действие необратимо.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => setConfirmOpen(false)}>Отмена</Button>
        <Button variant="contained" color="error" onClick={handleConfirm}>
          Объединить
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
};

const PatientChip: React.FC<{ patient: DjangoPatient; compact?: boolean }> = ({ patient, compact }) => {
  const initials = patient.fullName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const subtitle = [
    patient.phone,
    patient.birthDate ? dayjs(patient.birthDate).format("DD.MM.YYYY") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Stack direction="row" alignItems="center" gap={1.5}>
      <Avatar
        src={patient.photoUrl ?? undefined}
        sx={{ width: compact ? 32 : 40, height: compact ? 32 : 40, fontSize: compact ? 13 : 15 }}
      >
        {initials}
      </Avatar>
      <Box>
        <Typography variant={compact ? "body2" : "body1"} fontWeight={500}>
          {patient.fullName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>
      </Box>
    </Stack>
  );
};

export default MergePatientDrawer;
