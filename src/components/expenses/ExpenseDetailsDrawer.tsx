import React from "react";
import {
  Box,
  Button,
  Divider,
  Drawer,
  Grid,
  Stack,
  Typography,
  Avatar,
} from "@mui/material";
import type { Expense } from "../../pages/expenses/types";
import { PaymentInfoBlock } from "../ui";

type ExpenseDetailsDrawerProps = {
  open: boolean;
  onClose: () => void;
  record: Expense | null;
  employeeFullName?: string | null;
  onEdit?: (record: Expense) => void;
  onDelete?: (record: Expense) => void;
};

export const ExpenseDetailsDrawer: React.FC<ExpenseDetailsDrawerProps> = ({
  open,
  onClose,
  record,
  employeeFullName,
  onEdit,
  onDelete,
}) => {
  if (!record) {
    return (
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{ sx: { width: { xs: 320, sm: 480, md: 520 }, maxWidth: "100vw" } }}
      >
        <Box sx={{ width: 1, minWidth: 320 }} p={{ xs: 1.5, md: 2 }}>
          <Typography variant="h6">Нет данных</Typography>
        </Box>
      </Drawer>
    );
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: 320, sm: 480, md: 520 }, maxWidth: "100vw" } }}
    >
      <Box sx={{ width: 1, minWidth: 320 }} p={{ xs: 1.5, md: 2 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          p={{ xs: 1.5, md: 2 }}
          sx={{ borderBottom: (theme) => `1px solid ${theme.palette.divider}` }}
        >
          <Typography variant="h6">Детали расхода</Typography>
          <Stack direction="row" spacing={1.25}>
            <Button variant="outlined" onClick={() => onEdit?.(record)}>Редактировать</Button>
            <Button variant="outlined" color="error" onClick={() => onDelete?.(record)}>Удалить</Button>
          </Stack>
        </Stack>

        <Divider sx={{ my: { xs: 1.5, md: 2 } }} />

        <Stack spacing={2}>
          {record.photo ? (
            <Avatar
              variant="rounded"
              src={record.photo}
              sx={{ width: "100%", height: 200 }}
            />
          ) : (
            <Box
              sx={{
                width: "100%",
                height: 200,
                bgcolor: "action.hover",
                borderRadius: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography variant="body2" color="text.secondary">Фото отсутствует</Typography>
            </Box>
          )}

          <Grid container spacing={{ xs: 1.25, md: 1.5 }}>
            <Grid item xs={5}>
              <Typography variant="body2" color="text.secondary">Название</Typography>
            </Grid>
            <Grid item xs={7}>
              <Typography variant="body1">{record.name}</Typography>
            </Grid>

            <Grid item xs={5}>
              <Typography variant="body2" color="text.secondary">Категория</Typography>
            </Grid>
            <Grid item xs={7}>
              <Typography variant="body1">{record.category ?? "-"}</Typography>
            </Grid>

            <Grid item xs={12}>
              <PaymentInfoBlock
                payment={{
                  baseTotal: record.total_amount ?? 0,
                  cash: record.cash_amount ?? 0,
                  card: record.cashless_amount ?? 0,
                  finalTotal: record.total_amount ?? 0,
                  debt: 0,
                }}
                variant="detailed"
                showIcons={true}
              />
            </Grid>

            <Grid item xs={5}>
              <Typography variant="body2" color="text.secondary">Сотрудник</Typography>
            </Grid>
            <Grid item xs={7}>
              <Typography variant="body1">{employeeFullName ?? "-"}</Typography>
            </Grid>

            <Grid item xs={5}>
              <Typography variant="body2" color="text.secondary">Комментарий</Typography>
            </Grid>
            <Grid item xs={7}>
              <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{record.comment ?? "-"}</Typography>
            </Grid>


          </Grid>
        </Stack>
      </Box>
    </Drawer>
  );
};
