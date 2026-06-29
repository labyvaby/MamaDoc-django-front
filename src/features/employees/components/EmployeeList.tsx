import React from "react";
import { Stack, Typography, IconButton, Box, Chip } from "@mui/material";
import { alpha } from "@mui/material/styles";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import type { EmployesRow } from "../types";
import { IS_DJANGO_BACKEND } from "../../../config/backend";
import { UserAvatar } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";

export type EmployeeListProps = {
  items: EmployesRow[];
  onSelect: (e: EmployesRow) => void;
  onEdit?: (e: EmployesRow) => void;
  onDelete?: (e: EmployesRow) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  loading?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  isGrouped?: boolean;
  roles?: any[];
  /** id выбранного сотрудника — для подсветки строки. */
  selectedId?: string | null;
};

/** Заголовок группы: приглушённая подпись + счётчик + тонкая линия. */
const GroupHeader: React.FC<{ title: string; count: number; first?: boolean }> = ({
  title,
  count,
  first,
}) => (
  <Stack direction="row" alignItems="center" gap={1} sx={{ px: 0.5, pt: first ? 0.5 : 1.5, pb: 0.25 }}>
    <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
      {title}
    </Typography>
    <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.75rem" }}>
      · {count}
    </Typography>
    <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
  </Stack>
);

const EmployeeList: React.FC<EmployeeListProps> = ({
  items,
  onSelect,
  onEdit,
  onDelete,
  listRef,
  onScroll,
  loading,
  loadingMore,
  isGrouped,
  roles = [],
  selectedId,
}) => {
  /** Пилюля статуса (работает / не работает / уволен). */
  const StatusPill: React.FC<{ status?: string | null }> = ({ status }) => {
    if (!status) return null;
    const isActive = status === "active";
    const isFired = status === "fired";
    const label = isActive ? "Работает" : isFired ? "Уволен" : "Не работает";
    return (
      <Chip
        size="small"
        label={label}
        icon={
          <Box
            component="span"
            sx={(t) => ({
              width: 6,
              height: 6,
              borderRadius: "50%",
              ml: 0.75,
              bgcolor: isActive
                ? t.palette.success.main
                : isFired
                ? t.palette.error.main
                : t.palette.grey[500],
            })}
          />
        }
        sx={(t) => {
          const tone = isActive ? t.palette.success : isFired ? t.palette.error : null;
          return {
            flexShrink: 0,
            height: 22,
            borderRadius: "7px",
            fontSize: "0.72rem",
            fontWeight: 500,
            "& .MuiChip-icon": { ml: 0.75, mr: -0.25 },
            "& .MuiChip-label": { px: 0.85 },
            color: tone ? (t.palette.mode === "dark" ? tone.light : tone.dark) : "text.secondary",
            bgcolor: tone ? alpha(tone.main, t.palette.mode === "dark" ? 0.2 : 0.14) : subtleBg(t, true),
          };
        }}
      />
    );
  };

  const renderItem = (e: EmployesRow) => {
    const statusText =
      e.status === "active" ? "работает" : e.status === "inactive" ? "не работает" : e.status;

    let roleText: string;
    if (IS_DJANGO_BACKEND) {
      roleText = e._djangoRole?.name || statusText || "Сотрудник";
    } else {
      const roleObj = roles.find((r) => r.id === e.role_id);
      roleText =
        roleObj?.display_name ||
        roleObj?.name ||
        (e.role_id === "doctor" ? "Доктор" : e.role_id === "admin" ? "Управляющий" : statusText || "Сотрудник");
    }

    const photoUrl = e.photo_url || null;
    const hasPassports = Boolean(e.passport_photos && e.passport_photos.length > 0);
    const selected = selectedId != null && String(e.id) === String(selectedId);
    const isActive = e.status === "active";
    const isFired = e.status === "fired";
    const subline = e.phone ? `${roleText} · ${e.phone}` : roleText;

    return (
      <Box
        key={e.id}
        onClick={() => onSelect(e)}
        sx={(t) => ({
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          p: 1.5,
          borderRadius: "12px",
          cursor: "pointer",
          border: 1,
          borderColor: selected ? alpha(t.palette.primary.main, 0.45) : "divider",
          bgcolor: selected
            ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.08)
            : "background.paper",
          transition: "background-color .15s ease, border-color .15s ease",
          "&:hover": {
            borderColor: selected ? undefined : alpha(t.palette.primary.main, 0.28),
            bgcolor: selected ? undefined : subtleBg(t),
          },
          "&:hover .row-actions": { opacity: 1 },
        })}
      >
        <Box sx={{ position: "relative", flexShrink: 0 }}>
          <UserAvatar src={photoUrl} name={e.full_name} size={42} sx={{ borderRadius: "11px" }} />
          {e.status && (
            <Box
              sx={(t) => ({
                position: "absolute",
                right: -3,
                bottom: -3,
                width: 13,
                height: 13,
                borderRadius: "50%",
                border: `2.5px solid ${selected ? "transparent" : t.palette.background.paper}`,
                boxShadow: `0 0 0 2.5px ${t.palette.background.paper}`,
                bgcolor: isActive
                  ? t.palette.success.main
                  : isFired
                  ? t.palette.error.main
                  : t.palette.grey[500],
              })}
            />
          )}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={500} noWrap>
              {e.full_name || "Без имени"}
            </Typography>
            {hasPassports && (
              <DescriptionOutlined
                sx={{ fontSize: 15, color: "primary.onSurface", flexShrink: 0 }}
                titleAccess="Паспорт загружен"
              />
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            {subline}
          </Typography>
        </Box>

        <StatusPill status={e.status} />

        {(onEdit || onDelete) && (
          <Stack
            direction="row"
            spacing={0.5}
            className="row-actions"
            sx={{ opacity: { xs: 1, md: selected ? 1 : 0 }, transition: "opacity .15s ease", flexShrink: 0 }}
          >
            {onEdit && (
              <IconButton
                size="small"
                aria-label="Редактировать"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onEdit(e);
                }}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: "8px",
                  color: "text.secondary",
                  "&:hover": { color: "text.primary", bgcolor: "action.hover" },
                }}
              >
                <EditOutlined sx={{ fontSize: 16 }} />
              </IconButton>
            )}
            {onDelete && (
              <IconButton
                size="small"
                aria-label="Уволить"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onDelete(e);
                }}
                sx={(t) => ({
                  border: 1,
                  borderColor: "divider",
                  borderRadius: "8px",
                  color: "text.secondary",
                  "&:hover": {
                    color: t.palette.error.main,
                    borderColor: alpha(t.palette.error.main, 0.4),
                    bgcolor: alpha(t.palette.error.main, 0.1),
                  },
                })}
              >
                <DeleteOutline sx={{ fontSize: 16 }} />
              </IconButton>
            )}
          </Stack>
        )}
      </Box>
    );
  };

  const getGroupedItems = () => {
    if (!isGrouped) return items.map(renderItem);

    if (IS_DJANGO_BACKEND) {
      const grouped: Record<string, { name: string; items: EmployesRow[] }> = {};
      items.forEach((item) => {
        const role = item._djangoRole;
        const gId = role ? String(role.id) : "other";
        const gName = role ? role.name : "Без доступа в систему";
        if (!grouped[gId]) grouped[gId] = { name: gName, items: [] };
        grouped[gId].items.push(item);
      });

      const elements: React.ReactNode[] = [];
      Object.entries(grouped).forEach(([gId, group], idx) => {
        elements.push(
          <GroupHeader key={`header-django-${gId}`} title={group.name} count={group.items.length} first={idx === 0} />,
        );
        group.items.forEach((item) => elements.push(renderItem(item)));
      });
      return elements;
    }

    // Supabase: группировка по role_id из массива roles
    const grouped: Record<string, EmployesRow[]> = {};
    items.forEach((item) => {
      const gId = item.role_id || "other";
      if (!grouped[gId]) grouped[gId] = [];
      grouped[gId].push(item);
    });

    const elements: React.ReactNode[] = [];
    roles.forEach((role) => {
      if (grouped[role.id] && grouped[role.id].length > 0) {
        elements.push(
          <GroupHeader
            key={`header-${role.id}`}
            title={role.display_name || role.name}
            count={grouped[role.id].length}
            first={elements.length === 0}
          />,
        );
        grouped[role.id].forEach((item) => elements.push(renderItem(item)));
        delete grouped[role.id];
      }
    });

    const others = Object.values(grouped).flat();
    if (others.length > 0) {
      elements.push(
        <GroupHeader key="header-other" title="Прочие" count={others.length} first={elements.length === 0} />,
      );
      others.forEach((item) => elements.push(renderItem(item)));
    }

    return elements;
  };

  return (
    <Box
      sx={{ height: { md: "100%" }, minHeight: 0, overflowY: { xs: "visible", md: "auto" }, pr: { md: 0.5 } }}
      ref={listRef as React.RefObject<HTMLDivElement>}
      onScroll={onScroll}
    >
      {items.length === 0 ? (
        <Typography sx={{ p: 2 }} color="text.secondary">
          {loading ? "Загрузка…" : "Нет записей"}
        </Typography>
      ) : (
        <Stack spacing={1}>{getGroupedItems()}</Stack>
      )}
      {loadingMore && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 0.5, py: 1.25 }}>
          Загрузка…
        </Typography>
      )}
    </Box>
  );
};

export default EmployeeList;
