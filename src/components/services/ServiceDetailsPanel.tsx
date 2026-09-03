import React from "react";
import {
  Box,
  Typography,
  Divider,
  Stack,
  Skeleton,
  Chip,
  Avatar,
  Card,
  CardHeader,
  CardContent,
  IconButton,
  Tooltip,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import MedicalServicesIcon from "@mui/icons-material/MedicalServicesOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import AccessTimeIcon from "@mui/icons-material/AccessTimeOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import {
  getService,
  SERVICE_CATEGORIES_ENABLED,
  SERVICE_CATEGORY_LABELS,
  SERVICE_ONLINE_VISIBILITY_ENABLED,
  SERVICE_RELATED_PRODUCT_ENABLED,
  SERVICE_RELATED_PRODUCTS_MULTI_ENABLED,
} from "../../api/catalog";
import type { Service } from "../../api/catalog";
import { formatKGS, formatQuantity } from "../../utility/format";
import { AppButton, InfoTile } from "../ui";
import { subtleBg } from "../../theme/uiHelpers";
import { useNavigate } from "react-router";
import { useCan } from "../../hooks/useCan";
import { PAGE_PERMISSIONS } from "../../config/accessPermissions";
import { useServicesList } from "../../api/hooks/useServicesQuery";
import { useT } from "../../i18n/VerticalProvider";
import ServicePerformersSection from "./ServicePerformersSection";
import { computeServiceEconomics } from "./serviceEconomics";
import { tt } from "../../i18n/t";

type Props = {
  serviceId: number | null;
  /** Бампается родителем после редактирования — панель перечитывает услугу. */
  refreshToken?: number;
  onEdit?: (s: Service) => void;
  onDelete?: (s: Service) => void;
  /** Создать копию услуги (кнопка «Дублировать»); без колбэка кнопки нет. */
  onDuplicate?: (s: Service) => void;
  /** Переключить панель на другую услугу — блок «Похожие». */
  onSelectService?: (serviceId: number) => void;
};

/** Форматирует длительность из минут в вид «45 мин» / «1 ч 15 мин». */
function formatDuration(min: number): string {
  if (!min || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return tt("services:details.durationMin", { minutes: m });
  if (m === 0) return tt("services:details.durationHour", { hours: h });
  return tt("services:details.durationHourMin", { hours: h, minutes: m });
}

/** Заголовок секции: иконка-акцент + приглушённая подпись (как в карточке сотрудника). */
const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({
  icon,
  title,
}) => (
  <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
    <Box
      sx={{
        color: "primary.onSurface",
        display: "flex",
        "& .MuiSvgIcon-root": { fontSize: 18 },
      }}
    >
      {icon}
    </Box>
    <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
      {title}
    </Typography>
  </Stack>
);

/**
 * Панель с деталями услуги для правой колонки master-detail макета —
 * в едином стиле с карточкой сотрудника.
 */
const ServiceDetailsPanel: React.FC<Props> = ({
  serviceId,
  refreshToken = 0,
  onEdit,
  onDelete,
  onDuplicate,
  onSelectService,
}) => {
  const { t } = useT("services");
  const navigate = useNavigate();
  // Кнопка уводит в Регистратуру (`/appointments?new=1&service=`), а та закрыта
  // отдельным правом `appointments.registry.view`. Врачу обычно дают только
  // кабинет (`appointments.doctor_room.view`), и с гейтом на одном
  // `appointments.create` кнопка была видна, но по клику молча выбрасывала на
  // домашнюю страницу (fallback роута в App.tsx).
  const canCreateAppointment = useCan("appointments.create");
  const canOpenRegistry = useCan(PAGE_PERMISSIONS.appointmentsRegistry);
  // Каталог уже в кеше страницы — тем же ключом, без второго запроса.
  const { data: catalog = [] } = useServicesList();
  const [loading, setLoading] = React.useState(false);
  const [service, setService] = React.useState<Service | null>(null);

  React.useEffect(() => {
    if (!serviceId) {
      setService(null);
      return;
    }
    let active = true;
    setLoading(true);
    getService(serviceId)
      .then((s) => {
        if (active) setService(s);
      })
      .catch(() => {
        if (active) setService(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [serviceId, refreshToken]);

  // Сколько платные позиции состава добавят к цене услуги в приёме.
  const billableExtra = React.useMemo(
    () =>
      (service?.relatedProducts ?? []).reduce(
        (sum, p) => (p.billable ? sum + p.price * p.quantity : sum),
        0,
      ),
    [service],
  );

  const economics = React.useMemo(() => computeServiceEconomics(service), [service]);

  /**
   * Похожие услуги — активные из той же категории. Без категории список был бы
   * «все услуги подряд», поэтому там блок не показываем.
   */
  const similar = React.useMemo(() => {
    if (!service?.category) return [];
    return catalog
      .filter((s) => s.id !== service.id && s.isActive && s.category === service.category)
      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
      .slice(0, 5);
  }, [catalog, service]);

  return (
    <Card
      variant="outlined"
      sx={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <CardHeader
        title={
          <Stack direction="row" alignItems="center" gap={1.25}>
            <Box
              sx={{
                width: 3,
                height: 16,
                borderRadius: 3,
                bgcolor: "primary.main",
              }}
            />
            <Typography variant="subtitle1" fontWeight={600}>
              {t("details.cardTitle")}
            </Typography>
          </Stack>
        }
        action={
          service ? (
            <Stack direction="row" alignItems="center" gap={0.5}>
              {onEdit && (
                <AppButton
                  size="small"
                  startIcon={<EditOutlinedIcon fontSize="small" />}
                  onClick={() => onEdit(service)}
                >
                  {t("details.editButton")}
                </AppButton>
              )}
              {onDuplicate && (
                <Tooltip title={t("details.duplicateTooltip")}>
                  <IconButton size="small" onClick={() => onDuplicate(service)}>
                    <ContentCopyOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {onDelete && (
                <Tooltip title={t("details.deleteTooltip")}>

                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => onDelete(service)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          ) : undefined
        }
      />
      <Divider />
      <CardContent sx={{ flex: 1, overflowY: "auto" }}>
        {!serviceId ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              py: 8,
              opacity: 0.6,
            }}
          >
            <MedicalServicesIcon
              sx={{ fontSize: 64, mb: 2, color: "text.secondary" }}
            />
            <Typography variant="body1" color="text.secondary">
              {t("details.emptySelect")}
            </Typography>
          </Box>
        ) : loading ? (
          <Stack spacing={2}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Skeleton variant="rounded" width={76} height={76} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="60%" height={32} />
                <Skeleton variant="text" width="40%" />
              </Box>
            </Stack>
            <Skeleton variant="rounded" height={72} />
            <Skeleton variant="rounded" height={72} />
          </Stack>
        ) : service ? (
          <Stack spacing={3}>
            {/* Hero: изображение + название + чипы */}
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <Box sx={{ position: "relative", flexShrink: 0 }}>
                <Avatar
                  variant="rounded"
                  src={service.imageUrl ?? undefined}
                  sx={(t) => ({
                    width: 76,
                    height: 76,
                    borderRadius: "18px",
                    color: "primary.onSurface",
                    bgcolor: alpha(
                      t.palette.primary.main,
                      t.palette.mode === "dark" ? 0.16 : 0.1,
                    ),
                  })}
                >
                  <MedicalServicesIcon sx={{ fontSize: 32 }} />
                </Avatar>
                <Box
                  sx={(t) => ({
                    position: "absolute",
                    right: -2,
                    bottom: -2,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `3px solid ${t.palette.background.paper}`,
                    bgcolor: service.isActive
                      ? t.palette.success.main
                      : t.palette.grey[500],
                  })}
                />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="h6"
                  fontWeight={700}
                  sx={{ letterSpacing: -0.2, lineHeight: 1.2 }}
                >
                  {service.name}
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.75 }}
                >
                  <Chip
                    label={t("common.chip")}
                    size="small"
                    sx={(t) => ({
                      fontWeight: 500,
                      height: 24,
                      borderRadius: "7px",
                      color: "primary.onSurface",
                      bgcolor: alpha(
                        t.palette.primary.main,
                        t.palette.mode === "dark" ? 0.18 : 0.1,
                      ),
                    })}
                  />
                  <Chip
                    size="small"
                    label={service.isActive ? t("common.active") : t("common.inactive")}
                    icon={
                      <Box
                        component="span"
                        sx={(t) => ({
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          bgcolor: service.isActive
                            ? t.palette.success.main
                            : t.palette.grey[500],
                          ml: 0.75,
                        })}
                      />
                    }
                    sx={(t) => {
                      const tone = service.isActive ? t.palette.success : null;
                      return {
                        fontWeight: 500,
                        height: 24,
                        borderRadius: "7px",
                        "& .MuiChip-icon": { ml: 0.75, mr: -0.25 },
                        color: tone
                          ? t.palette.mode === "dark"
                            ? tone.light
                            : tone.dark
                          : "text.secondary",
                        bgcolor: tone
                          ? alpha(tone.main, t.palette.mode === "dark" ? 0.2 : 0.14)
                          : subtleBg(t, true),
                      };
                    }}
                  />
                  {SERVICE_CATEGORIES_ENABLED && service.category && (
                    <Chip
                      size="small"
                      icon={<CategoryOutlinedIcon />}
                      label={SERVICE_CATEGORY_LABELS[service.category]}
                      variant="outlined"
                      sx={{ height: 24, borderRadius: "7px", fontWeight: 500 }}
                    />
                  )}
                  {/* Видима на витрине по умолчанию — отмечаем только исключение. */}
                  {SERVICE_ONLINE_VISIBILITY_ENABLED && !service.onlineBookingVisible && (
                    <Chip
                      size="small"
                      icon={<VisibilityOffOutlinedIcon />}
                      label={t("details.hiddenOnline")}
                      variant="outlined"
                      color="warning"
                      sx={{ height: 24, borderRadius: "7px", fontWeight: 500 }}
                    />
                  )}
                  {service.allowPriceOverride && (
                    <Tooltip title={t("details.priceOverrideHint")}>
                      <Chip
                        size="small"
                        icon={<EditNoteOutlinedIcon />}
                        label={t("details.priceOverrideChip")}
                        variant="outlined"
                        sx={{ height: 24, borderRadius: "7px", fontWeight: 500 }}
                      />
                    </Tooltip>
                  )}
                </Stack>
              </Box>
            </Stack>

            {/* Основное: стоимость + длительность */}
            <Box>
              <SectionHeader icon={<PaymentsOutlinedIcon />} title={t("details.sectionMain")} />
              <Box
                sx={{
                  display: "grid",
                  gap: 1.25,
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                }}
              >
                <InfoTile
                  icon={<PaymentsOutlinedIcon />}
                  label={t("details.price")}
                  value={
                    service.basePrice
                      ? formatKGS(Number(service.basePrice))
                      : undefined
                  }
                  active={Boolean(service.basePrice)}
                />
                <InfoTile
                  icon={<AccessTimeIcon />}
                  label={t("details.duration")}
                  value={
                    service.durationMinutes > 0
                      ? formatDuration(service.durationMinutes)
                      : undefined
                  }
                  active={service.durationMinutes > 0}
                />
                {/* Экономика — только когда есть из чего считать: без состава
                    себестоимость нулевая, а «маржа = цена» ничего не говорит. */}
                {SERVICE_RELATED_PRODUCT_ENABLED && economics.cost > 0 && (
                  <>
                    <InfoTile
                      icon={<Inventory2OutlinedIcon />}
                      label={t("details.cost")}
                      value={formatKGS(economics.cost)}
                      active
                    />
                    <InfoTile
                      icon={<TrendingUpOutlinedIcon />}
                      label={
                        economics.marginPercent != null
                          ? t("details.marginWithPercent", {
                              percent: Math.round(economics.marginPercent),
                            })
                          : t("details.margin")
                      }
                      value={
                        <Box
                          component="span"
                          sx={{ color: economics.margin < 0 ? "error.main" : undefined }}
                        >
                          {formatKGS(economics.margin)}
                        </Box>
                      }
                      active
                    />
                  </>
                )}
              </Box>
              {economics.outOfStock.length > 0 && (
                <Stack
                  direction="row"
                  alignItems="flex-start"
                  gap={1}
                  sx={(th) => ({
                    mt: 1.25,
                    p: 1.25,
                    borderRadius: "10px",
                    border: 1,
                    borderColor: alpha(th.palette.warning.main, 0.4),
                    bgcolor: alpha(th.palette.warning.main, th.palette.mode === "dark" ? 0.14 : 0.08),
                  })}
                >
                  <WarningAmberOutlinedIcon
                    fontSize="small"
                    sx={{ color: "warning.main", mt: 0.25 }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {t("details.stockWarning", {
                      products: economics.outOfStock.map((p) => p.name).join(", "),
                    })}
                  </Typography>
                </Stack>
              )}
            </Box>

            {/* Филиалы */}
            {service.branches.length > 0 && (
              <Box>
                <SectionHeader icon={<PlaceOutlinedIcon />} title={t("details.sectionBranches")} />
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {service.branches.map((b) => (
                    <Chip
                      key={b.id}
                      label={b.name}
                      size="small"
                      icon={<PlaceOutlinedIcon />}
                      variant="outlined"
                      sx={{ borderRadius: "7px", height: 30 }}
                    />
                  ))}
                  {service.hasHiddenBranches && (
                    <Chip
                      label="…"
                      size="small"
                      variant="outlined"
                      sx={{ borderRadius: "7px", height: 30 }}
                    />
                  )}
                </Stack>
              </Box>
            )}

            {/* Быстрая запись на эту услугу */}
            {canCreateAppointment && canOpenRegistry && service.isActive && (
              <AppButton
                variant="contained"
                startIcon={<EventAvailableOutlinedIcon fontSize="small" />}
                onClick={() => navigate("/appointments?new=1&service=" + service.id)}
                sx={{ alignSelf: "flex-start" }}
              >
                {t("details.bookButton")}
              </AppButton>
            )}

            {/* Кто оказывает услугу */}
            <ServicePerformersSection
              serviceId={service.id}
              serviceName={service.name}
              renderHeader={(count) => (
                <SectionHeader
                  icon={<GroupsOutlinedIcon />}
                  title={
                    count == null
                      ? t("details.sectionPerformers")
                      : t("details.sectionPerformersCount", { count })
                  }
                />
              )}
            />

            {/* Состав расходников услуги */}
            {SERVICE_RELATED_PRODUCT_ENABLED && service.relatedProducts.length > 0 && (
              <Box>
                <SectionHeader
                  icon={<Inventory2OutlinedIcon />}
                  title={
                    SERVICE_RELATED_PRODUCTS_MULTI_ENABLED
                      ? t("details.sectionComposition")
                      : t("details.sectionCompositionSingle")
                  }
                />
                <Box
                  sx={{
                    display: "grid",
                    gap: 1.25,
                    gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  }}
                >
                  {service.relatedProducts.map((p) => (
                    <InfoTile
                      key={p.id}
                      icon={<Inventory2OutlinedIcon />}
                      label={
                        SERVICE_RELATED_PRODUCTS_MULTI_ENABLED
                          ? `${p.name} × ${formatQuantity(p.quantity)}${p.unit ? ` ${p.unit}` : ""}`
                          : p.name
                      }
                      // Остаток здесь — по всей организации: в справочнике услуги
                      // филиала нет, склад филиала считается в приёме.
                      value={[
                        `${formatKGS(p.price)} · ${t("details.stock", { stock: formatQuantity(p.stock) })}`,
                        ...(SERVICE_RELATED_PRODUCTS_MULTI_ENABLED
                          ? [
                              p.billable
                                ? t("details.extraToPrice", { amount: formatKGS(p.price * p.quantity) })
                                : t("details.included"),
                              ...(p.autoWriteOff ? [] : [t("details.noWriteOff")]),
                            ]
                          : []),
                      ].join(" · ")}
                      active
                    />
                  ))}
                </Box>
                {billableExtra > 0 && (
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="baseline"
                    sx={{ mt: 1.25 }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {t("details.billableFooter")}
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      + {formatKGS(billableExtra)}
                    </Typography>
                  </Stack>
                )}
              </Box>
            )}

            {/* Похожие услуги той же категории */}
            {similar.length > 0 && onSelectService && (
              <Box>
                <SectionHeader
                  icon={<LayersOutlinedIcon />}
                  title={t("details.sectionSimilar")}
                />
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {similar.map((s) => (
                    <Chip
                      key={s.id}
                      label={s.name + " · " + formatKGS(Number(s.basePrice))}
                      size="small"
                      variant="outlined"
                      onClick={() => onSelectService(s.id)}
                      sx={{ borderRadius: "7px", height: 30, maxWidth: "100%" }}
                    />
                  ))}
                </Stack>
              </Box>
            )}

            {/* Описание */}
            {service.description && (
              <Box>
                <SectionHeader icon={<NotesOutlinedIcon />} title={t("details.sectionDescription")} />
                <Box
                  sx={(t) => ({
                    p: 1.75,
                    borderRadius: "10px",
                    border: 1,
                    borderColor: "divider",
                    bgcolor: subtleBg(t),
                  })}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ whiteSpace: "pre-wrap" }}
                  >
                    {service.description}
                  </Typography>
                </Box>
              </Box>
            )}
          </Stack>
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
            align="center"
            sx={{ py: 4 }}
          >
            {t("common.notFound")}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default ServiceDetailsPanel;
