import React from "react";
import { Box, Button, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";

import { UserAvatar } from "../../components/ui";
import { isCleaningBackdated, type CleaningRecord } from "../../api/cleaning";
import { formatCleaningDate, formatCleaningCreatedAt } from "./recordDate";
import { StatusChip } from "./meta";
import PhotoStrip from "./PhotoStrip";

export interface RecordCardProps {
  record: CleaningRecord;
  canManage: boolean;
  busy: boolean;
  onOpenPhoto: (index: number) => void;
  onApprove: (record: CleaningRecord) => void;
  onReject: (record: CleaningRecord) => void;
  onDelete: (record: CleaningRecord) => void;
}

/**
 * Карточка записи для телефона. Таблица на узком экране прятала половину
 * колонок и всё равно требовала горизонтальной прокрутки, а уборку отмечают и
 * проверяют как раз с телефона — поэтому на мобильном показываем карточки:
 * фотоотчёт лентой во всю ширину и решения крупными кнопками.
 */
export const RecordCard: React.FC<RecordCardProps> = ({
  record,
  canManage,
  busy,
  onOpenPhoto,
  onApprove,
  onReject,
  onDelete,
}) => (
  <Stack
    gap={1.25}
    sx={{
      p: 1.5,
      borderRadius: "12px",
      border: 1,
      borderColor: "divider",
      bgcolor: "background.paper",
    }}
  >
    <Stack direction="row" alignItems="flex-start" gap={1}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle2" fontWeight={600} noWrap>
          {record.typeName}
        </Typography>
        <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
          <Typography variant="caption" color="text.secondary">
            {formatCleaningDate(record)}
          </Typography>
          {isCleaningBackdated(record) && (
            <Tooltip title={`Запись создана ${formatCleaningCreatedAt(record)}`}>
              <Typography variant="caption" color="text.secondary">
                · задним числом
              </Typography>
            </Tooltip>
          )}
          {record.branchName && (
            <Stack direction="row" alignItems="center" gap={0.25} sx={{ color: "text.secondary" }}>
              <StoreOutlined sx={{ fontSize: 13 }} />
              <Typography variant="caption" noWrap>
                {record.branchName}
              </Typography>
            </Stack>
          )}
        </Stack>
      </Box>
      <Stack direction="row" alignItems="center" gap={0.5}>
        <StatusChip status={record.status} />
        {record.status === "rejected" && record.rejectReason && (
          <Tooltip title={`Причина: ${record.rejectReason}`} arrow>
            <InfoOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
          </Tooltip>
        )}
      </Stack>
    </Stack>

    <Stack direction="row" alignItems="center" gap={1}>
      <UserAvatar name={record.employeeName} size={28} />
      <Typography variant="body2" noWrap>
        {record.employeeName}
      </Typography>
    </Stack>

    <PhotoStrip photos={record.photos} onOpen={onOpenPhoto} size={56} scrollable />

    {canManage && (
      <Stack direction="row" alignItems="center" gap={1}>
        {busy ? (
          <CircularProgress size={20} />
        ) : (
          <>
            {record.status === "pending" && (
              <>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={<CheckOutlined />}
                  onClick={() => onApprove(record)}
                  sx={{ flex: 1 }}
                >
                  Подтвердить
                </Button>
                <Button
                  size="small"
                  color="error"
                  startIcon={<CloseOutlined />}
                  onClick={() => onReject(record)}
                  sx={{ flex: 1 }}
                >
                  Отклонить
                </Button>
              </>
            )}
            <Tooltip title="Удалить запись">
              <IconButton size="small" onClick={() => onDelete(record)} sx={{ ml: "auto" }}>
                <DeleteOutlineOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Stack>
    )}
  </Stack>
);

export default RecordCard;
