import React from "react";
import { Drawer, Box, Typography, IconButton, Divider } from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import dayjs from "dayjs";
import ShiftForm from "./ShiftForm";
import { useEmployees } from "../../hooks/useEmployees";
// import { fetchEmployees } from "../../services/employees"; // Removed direct fetch
import type { EmployeesRow } from "../../pages/expenses/types";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data?: any) => void;
  shiftToEdit?: any;
};

const ShiftFormSidebar: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  shiftToEdit
}) => {
  // Загружаем сотрудников через кэшированный хук
  const { employees, loading } = useEmployees(isOpen);

  // No manual useEffect needed anymore

  const handleSuccess = (data: any) => {
    onSuccess(data);
    onClose(); // Закрываем панель после успеха
  };

  const title = shiftToEdit ? "Редактировать смену" : "Добавить смену";

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: 320, sm: 620 }, maxWidth: "100vw" } }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1,
        }}
      >
        <Typography variant="h6">{title}</Typography>
        <IconButton onClick={onClose} aria-label="Закрыть">
          <CloseOutlined />
        </IconButton>
      </Box>
      <Divider />

      <Box sx={{ width: '100%' }}>
        {/* При вызове из главного меню, дата по умолчанию - сегодня */}
        <ShiftForm
          initialDate={dayjs()}
          allEmployees={employees}
          onSuccess={handleSuccess}
          onCancel={onClose}
          shiftToEdit={shiftToEdit}
        />
      </Box>
    </Drawer>
  );
};

export default ShiftFormSidebar;
