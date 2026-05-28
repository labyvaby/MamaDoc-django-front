import React from "react";
import {
  Card,
  CardContent,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemAvatar, // ✅ Добавлен компонент для обертки аватара
  Avatar,         // ✅ Добавлен компонент аватара
  Stack,
  Typography,
  IconButton,
  Box,
} from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import ListSubheader from "@mui/material/ListSubheader";
import type { EmployesRow } from "../types";

export type EmployeeListProps = {
  items: EmployesRow[];
  onSelect: (e: EmployesRow) => void;
  onEdit?: (e: EmployesRow) => void;
  onDelete?: (e: EmployesRow) => void;
  /** Django-only: открыть drawer управления услугами */
  onOpenServices?: (e: EmployesRow) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  loading?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  isGrouped?: boolean;
  roles?: any[];
};

const EmployeeList: React.FC<EmployeeListProps> = ({
  items,
  onSelect,
  onEdit,
  onDelete,
  onOpenServices,
  listRef,
  onScroll,
  loading,
  loadingMore,
  isGrouped,
  roles = [],
}) => {
  const renderItem = (e: EmployesRow) => {
    // Логика отображения роли (вместо тире)
    const statusText =
      e.status === "active"
        ? "работает"
        : e.status === "inactive"
          ? "не работает"
          : e.status;

    // Ищем имя роли в массиве ролей
    const roleObj = roles.find((r) => r.id === e.role_id);
    const roleText = roleObj?.display_name || roleObj?.name || (e.role_id === "doctor" ? "Доктор" : e.role_id === "admin" ? "Управляющий" : statusText || "Сотрудник");

    const photoUrl = e.photo_url || null;
    const hasPassports = e.passport_photos && e.passport_photos.length > 0;

    return (
      <ListItem
        key={e.id}
        disableGutters
        divider
        sx={{ alignItems: "center" }}
        secondaryAction={
          (onEdit || onDelete || onOpenServices) && (
            <Stack direction="row" spacing={0.5}>
              {onOpenServices && (
                <IconButton
                  aria-label="Услуги"
                  size="small"
                  onClick={() => onOpenServices(e)}
                  title="Управление услугами"
                >
                  <MedicalServicesOutlined fontSize="small" />
                </IconButton>
              )}
              {onEdit && (
                <IconButton aria-label="Редактировать" onClick={() => onEdit(e)}>
                  <EditOutlined />
                </IconButton>
              )}
              {onDelete && (
                <IconButton aria-label="Удалить" onClick={() => onDelete(e)}>
                  <DeleteOutline />
                </IconButton>
              )}
            </Stack>
          )
        }
      >
        <ListItemButton onClick={() => onSelect(e)} sx={{ pr: 9 }}>
          <Avatar
            variant="rounded"
            src={photoUrl || undefined}
            alt={e.full_name}
            sx={{
              width: 48,
              height: 48,
              mr: 2,
              bgcolor: photoUrl ? "transparent" : "primary.main",
            }}
          >
            {e.full_name ? e.full_name[0].toUpperCase() : "?"}
          </Avatar>

          <ListItemText
            sx={{ minWidth: 0, pr: 1 }}
            primaryTypographyProps={{
              sx: { whiteSpace: "normal", wordBreak: "break-word", fontWeight: 500 },
            }}
            secondaryTypographyProps={{ component: "div" }}
            primary={
              <Stack direction="row" alignItems="center" gap={0.5}>
                {e.full_name || "Без имени"}
                {hasPassports && (
                  <DescriptionOutlined 
                    sx={{ fontSize: 16, color: 'primary.main', mb: -0.2 }} 
                    titleAccess="Паспорт загружен"
                  />
                )}
              </Stack>
            }
            secondary={
              <Stack direction="column" spacing={0.5} sx={{ minWidth: 0 }}>
                <Typography variant="body2" component="span" color="text.secondary">
                  {roleText}
                </Typography>
                {e.phone && (
                  <Typography
                    variant="body2"
                    component="span"
                    sx={{ wordBreak: "break-word" }}
                  >
                    {e.phone}
                  </Typography>
                )}
              </Stack>
            }
          />
        </ListItemButton>
      </ListItem>
    );
  };

  const getGroupedItems = () => {
    if (!isGrouped) return items.map(renderItem);

    const grouped: Record<string, EmployesRow[]> = {};

    // Сначала распределяем по ролям
    items.forEach((item) => {
      const gId = item.role_id || "other";
      if (!grouped[gId]) grouped[gId] = [];
      grouped[gId].push(item);
    });

    const elements: React.ReactNode[] = [];

    // Проходим по всем известным ролям, чтобы сохранить порядок или просто вывести их
    // Сначала выведем те роли, которые есть в roles
    roles.forEach((role) => {
      if (grouped[role.id] && grouped[role.id].length > 0) {
        elements.push(
          <ListSubheader
            key={`header-${role.id}`}
            sx={{
              bgcolor: 'background.default',
              fontWeight: 600,
              py: 0.5,
              borderRadius: 1,
              mt: elements.length > 0 ? 1 : 0
            }}
          >
            {role.display_name || role.name}
          </ListSubheader>
        );
        grouped[role.id].forEach((item) => {
          elements.push(renderItem(item));
        });
        delete grouped[role.id];
      }
    });

    // Остальные (без роли или неизвестные)
    const others = Object.values(grouped).flat();
    if (others.length > 0) {
      elements.push(
        <ListSubheader
          key="header-other"
          sx={{
            bgcolor: 'background.default',
            fontWeight: 600,
            py: 0.5,
            borderRadius: 1,
            mt: 1
          }}
        >
          Прочие
        </ListSubheader>
      );
      others.forEach((item) => {
        elements.push(renderItem(item));
      });
    }

    return elements;
  };

  return (
    <Card variant="outlined" sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <CardContent
        sx={{ p: 0, overflowY: { xs: "visible", md: "auto" }, flex: 1, minHeight: 0 }}
        // Приводим тип ref к ожидаемому React.Ref<HTMLDivElement>, чтобы удовлетворить типы MUI
        ref={listRef as React.RefObject<HTMLDivElement>}
        onScroll={onScroll}
      >
        {items.length === 0 ? (
          <Typography sx={{ p: 2 }} color="text.secondary">
            {loading ? "Загрузка…" : "Нет записей"}
          </Typography>
        ) : (
          <List sx={{ py: 0 }}>
            {getGroupedItems()}
          </List>
        )}
        <Box sx={{ px: 2, py: 1.25 }}>
          {loadingMore && (
            <Typography variant="caption" color="text.secondary">Загрузка…</Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default EmployeeList;
