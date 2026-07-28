import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import { useNavigate } from "react-router";

import {
  BOOKING_ORG_SLUG,
  getBranchProfessionals,
  getOrganizationBranches,
  getProfessionals,
  getSpecialists,
  type BranchPreview,
  type ProfessionalPreview,
  type Specialist,
} from "../../api/publicBooking";
import { isAbortError } from "../../api/client";
import { PublicBookingShell } from "./shell";
import { useT } from "../../i18n/VerticalProvider";

/** Склонение «года/лет» для стажа. */
function experienceLabel(years: number): string {
  if (!years) return "";
  const mod10 = years % 10;
  const mod100 = years % 100;
  let word = "лет";
  if (mod10 === 1 && mod100 !== 11) word = "год";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = "года";
  return `${years} ${word} стажа`;
}

const DoctorCard: React.FC<{ doctor: ProfessionalPreview; onClick: () => void }> = ({
  doctor,
  onClick,
}) => (
  <Paper
    variant="outlined"
    onClick={onClick}
    sx={{
      p: 2,
      borderRadius: "14px",
      cursor: "pointer",
      transition: "border-color .15s",
      "&:hover": { borderColor: "primary.main" },
    }}
  >
    <Stack direction="row" spacing={2} alignItems="center">
      <Avatar src={doctor.photoUrl ?? undefined} sx={{ width: 56, height: 56 }}>
        <PersonOutlined />
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography fontWeight={600} noWrap>
          {doctor.fullName}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {doctor.specialty}
        </Typography>
        {doctor.experienceYears > 0 && (
          <Typography variant="caption" color="text.secondary">
            {experienceLabel(doctor.experienceYears)}
          </Typography>
        )}
      </Box>
    </Stack>
  </Paper>
);

const DoctorsPage: React.FC = () => {
  const { t } = useT("publicBooking");
  const navigate = useNavigate();

  const [specialists, setSpecialists] = React.useState<Specialist[]>([]);
  const [activeSpecialist, setActiveSpecialist] = React.useState<number | null>(null);
  const [branches, setBranches] = React.useState<BranchPreview[]>([]);
  const [activeBranch, setActiveBranch] = React.useState<string>("");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  const [doctors, setDoctors] = React.useState<ProfessionalPreview[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Специализации и филиалы нашей организации для фильтров — грузим один раз.
  React.useEffect(() => {
    const controller = new AbortController();
    getSpecialists({ limit: 100 }, controller.signal)
      .then((r) => setSpecialists(r.items))
      .catch((e) => {
        if (!isAbortError(e)) setSpecialists([]);
      });
    getOrganizationBranches(BOOKING_ORG_SLUG, controller.signal)
      .then((r) => setBranches(r.items))
      .catch((e) => {
        if (!isAbortError(e)) setBranches([]);
      });
    return () => controller.abort();
  }, []);

  // Дебаунс поиска.
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Список врачей — при смене фильтров. Скоуп по организации (BOOKING_ORG_SLUG);
  // фильтр филиала — пересечением с врачами филиала (в списочном эндпоинте
  // branch-фильтра нет, а professional preview не содержит филиала).
  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const base = getProfessionals(
      {
        organizationSlug: BOOKING_ORG_SLUG,
        specialistId: activeSpecialist ?? undefined,
        search: debouncedSearch || undefined,
        limit: 100,
      },
      controller.signal,
    );
    const branch = activeBranch
      ? getBranchProfessionals(activeBranch, { limit: 100 }, controller.signal)
      : null;
    Promise.all([base, branch])
      .then(([baseRes, branchRes]) => {
        if (!branchRes) {
          setDoctors(baseRes.items);
          return;
        }
        const branchIds = new Set(branchRes.items.map((d) => d.id));
        setDoctors(baseRes.items.filter((d) => branchIds.has(d.id)));
      })
      .catch((e) => {
        if (isAbortError(e)) return;
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [activeSpecialist, debouncedSearch, activeBranch]);

  return (
    <PublicBookingShell>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        {t("chooseSpecialist")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t("chooseSpecialistHint")}
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlined fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        {branches.length > 1 && (
          <Select
            size="small"
            displayEmpty
            value={activeBranch}
            onChange={(e) => setActiveBranch(e.target.value)}
            sx={{ minWidth: { xs: "100%", sm: 220 } }}
          >
            <MenuItem value="">Все филиалы</MenuItem>
            {branches.map((b) => (
              <MenuItem key={b.id} value={b.slug || String(b.id)}>
                {b.name}
              </MenuItem>
            ))}
          </Select>
        )}
      </Stack>

      {specialists.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
          <Chip
            label="Все"
            color={activeSpecialist === null ? "primary" : "default"}
            variant={activeSpecialist === null ? "filled" : "outlined"}
            onClick={() => setActiveSpecialist(null)}
          />
          {specialists.map((s) => (
            <Chip
              key={s.id}
              label={s.title}
              color={activeSpecialist === s.id ? "primary" : "default"}
              variant={activeSpecialist === s.id ? "filled" : "outlined"}
              onClick={() => setActiveSpecialist(s.id)}
            />
          ))}
        </Stack>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : doctors.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
          {t("noSpecialistsFound")}
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
          }}
        >
          {doctors.map((d) => (
            <DoctorCard
              key={d.id}
              doctor={d}
              onClick={() => navigate(`/book/doctor/${d.slug || d.id}`)}
            />
          ))}
        </Box>
      )}
    </PublicBookingShell>
  );
};

export default DoctorsPage;
