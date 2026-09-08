/**
 * ServicePerformersSection.tsx
 * Секция «Кто оказывает» карточки услуги: сотрудники, которым услуга назначена,
 * с их персональной ценой/длительностью. Клик по строке открывает карточку
 * сотрудника.
 */
import React from "react";
import { Avatar, Box, Chip, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import AccessTimeIcon from "@mui/icons-material/AccessTimeOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import {
  useEmployeeServiceOverride,
  useServicePerformers,
  type ServicePerformer,
} from "../../hooks/useServicePerformers";
import { useCan } from "../../hooks/useCan";
import { AppButton } from "../ui";
import { formatKGS } from "../../utility/format";
import { subtleBg } from "../../theme/uiHelpers";
import { useT } from "../../i18n/VerticalProvider";
import DjangoDoctorQuickViewDrawer from "../employees/DjangoDoctorQuickViewDrawer";
import AssignPerformerDialog from "./AssignPerformerDialog";

/** Сколько исполнителей показываем до нажатия «Показать всех». */
const COLLAPSED_LIMIT = 6;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

type RowProps = {
  performer: ServicePerformer;
  serviceId: number | null;
  onOpen: (employeeId: number) => void;
};

const PerformerRow: React.FC<RowProps> = ({ performer, serviceId, onOpen }) => {
  const { t } = useT("services");
  const specialization = performer.specializations.join(", ");
  // Персональные цена и длительность приезжают отдельным запросом (в
  // service-providers их нет) — чипы появляются, когда данные готовы.
  const { priceOverride, durationOverrideMinutes } = useEmployeeServiceOverride(
    performer.id,
    serviceId,
  );
  const price = priceOverride != null ? Number(priceOverride) : null;

  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={1.25}
      onClick={() => onOpen(performer.id)}
      sx={(theme) => ({
        p: 1,
        borderRadius: "10px",
        border: 1,
        borderColor: "divider",
        bgcolor: subtleBg(theme),
        cursor: "pointer",
        transition: "border-color .15s, background-color .15s",
        "&:hover": {
          borderColor: alpha(theme.palette.primary.main, 0.5),
          bgcolor: subtleBg(theme, true),
        },
      })}
    >
      <Avatar
        src={performer.photoUrl ?? undefined}
        alt={performer.fullName}
        sx={(theme) => ({
          width: 36,
          height: 36,
          borderRadius: "12px",
          fontSize: 13,
          fontWeight: 600,
          color: "primary.onSurface",
          bgcolor: alpha(
            theme.palette.primary.main,
            theme.palette.mode === "dark" ? 0.18 : 0.1,
          ),
        })}
        variant="rounded"
      >
        {initials(performer.fullName)}
      </Avatar>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {performer.fullName}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {specialization || t("performers.noSpecialization")}
        </Typography>
      </Box>
      <Stack direction="row" gap={0.5} flexWrap="wrap" justifyContent="flex-end">
        {price != null && (
          <Tooltip title={t("performers.priceOverrideHint")}>
            <Chip
              size="small"
              icon={<PaymentsOutlinedIcon />}
              label={formatKGS(price)}
              sx={{ borderRadius: "7px", height: 24 }}
            />
          </Tooltip>
        )}
        {durationOverrideMinutes != null && durationOverrideMinutes > 0 && (
          <Tooltip title={t("performers.durationOverrideHint")}>
            <Chip
              size="small"
              icon={<AccessTimeIcon />}
              label={t("performers.durationValue", { minutes: durationOverrideMinutes })}
              sx={{ borderRadius: "7px", height: 24 }}
            />
          </Tooltip>
        )}
        {performer.branchIsForeign && performer.branch && (
          <Tooltip title={t("performers.branchHint")}>
            <Chip
              size="small"
              icon={<PlaceOutlinedIcon />}
              label={performer.branch.name}
              variant="outlined"
              sx={{ borderRadius: "7px", height: 24 }}
            />
          </Tooltip>
        )}
      </Stack>
    </Stack>
  );
};

type Props = {
  serviceId: number | null;
  /** Нужно для заголовка диалога назначения; без него кнопка не показывается. */
  serviceName?: string;
  /** Не тянуть список, пока секция не нужна (закрытый дровер). */
  enabled?: boolean;
  /** Заголовок рисует родитель — секция отдаёт только содержимое и счётчик. */
  renderHeader?: (count: number | null) => React.ReactNode;
};

const ServicePerformersSection: React.FC<Props> = ({
  serviceId,
  serviceName,
  enabled = true,
  renderHeader,
}) => {
  const { t } = useT("services");
  const { performers, isLoading, isError, canView } = useServicePerformers(serviceId, enabled);
  const [expanded, setExpanded] = React.useState(false);
  const [doctorId, setDoctorId] = React.useState<number | null>(null);
  const [assignOpen, setAssignOpen] = React.useState(false);
  // Назначение услуги сотруднику требует тех же прав, что и дровер «Услуги
  // сотрудника»: каталог на чтение, карточка сотрудника на изменение (кодов
  // staff.services.* на бэке нет — см. DjangoEditEmployeeDrawer).
  // Два отдельных вызова: в связке через && второй хук пропускался бы,
  // когда первого права нет, и порядок хуков поехал бы между рендерами.
  const canViewCatalog = useCan("catalog.view");
  const canUpdateStaff = useCan("staff.update");
  const canAssign = canViewCatalog && canUpdateStaff;

  React.useEffect(() => {
    setExpanded(false);
  }, [serviceId]);

  if (!canView) return null;

  const visible = expanded ? performers : performers.slice(0, COLLAPSED_LIMIT);
  const hidden = performers.length - visible.length;

  return (
    <Box>
      {renderHeader?.(isLoading ? null : performers.length)}
      {isLoading ? (
        <Stack gap={1}>
          <Skeleton variant="rounded" height={54} />
          <Skeleton variant="rounded" height={54} />
        </Stack>
      ) : isError ? (
        <Typography variant="body2" color="text.secondary">
          {t("performers.loadError")}
        </Typography>
      ) : performers.length === 0 ? (
        <Stack gap={1} alignItems="flex-start">
          <Typography variant="body2" color="text.secondary">
            {t("performers.empty")}
          </Typography>
          {canAssign && serviceName && (
            <AppButton
              size="small"
              startIcon={<PersonAddAltOutlinedIcon fontSize="small" />}
              onClick={() => setAssignOpen(true)}
            >
              {t("performers.assign")}
            </AppButton>
          )}
        </Stack>
      ) : (
        <Stack gap={1}>
          {visible.map((p) => (
            <PerformerRow
              key={p.id}
              performer={p}
              serviceId={serviceId}
              onOpen={setDoctorId}
            />
          ))}
          {hidden > 0 && (
            <Typography
              variant="body2"
              color="primary.onSurface"
              onClick={() => setExpanded(true)}
              sx={{ cursor: "pointer", fontWeight: 600, px: 0.5 }}
            >
              {t("performers.showAll", { count: hidden })}
            </Typography>
          )}
          {canAssign && serviceName && (
            <AppButton
              size="small"
              startIcon={<PersonAddAltOutlinedIcon fontSize="small" />}
              onClick={() => setAssignOpen(true)}
              sx={{ alignSelf: "flex-start" }}
            >
              {t("performers.assign")}
            </AppButton>
          )}
        </Stack>
      )}
      <DjangoDoctorQuickViewDrawer
        open={doctorId != null}
        onClose={() => setDoctorId(null)}
        doctorId={doctorId}
      />
      {serviceId != null && serviceName && (
        <AssignPerformerDialog
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          serviceId={serviceId}
          serviceName={serviceName}
          assignedIds={performers.map((p) => p.id)}
        />
      )}
    </Box>
  );
};

export default ServicePerformersSection;
