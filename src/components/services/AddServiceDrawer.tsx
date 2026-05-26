/**
 * AddServiceDrawer.tsx
 * Точка сборки (Page/Main Block) для добавления услуги.
 * Вся бизнес-логика вынесена в useAddServiceForm (состояния, эффекты, submit).
 * Вёрстка разбита на презентеры: ServiceEmployeeSelector, ServiceDetailsForm, ServicePhotoUploader.
 * Компонент собирает UI-блоки и передает им данные/колбэки через пропсы.
 */
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
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { useAddServiceForm } from "./useAddServiceForm";
import type { CreatedService } from "./useAddServiceForm";
import ServiceDetailsForm from "./ServiceDetailsForm";
import ServicePhotoUploader from "./ServicePhotoUploader";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (rec: CreatedService) => void;
};

/**
 * DrawerBase — переиспользуемая оболочка для правого дровера с заголовком,
 * контентом и кнопками действия. Не содержит бизнес-логики.
 */
const DrawerBase: React.FC<{
  open: boolean;
  title: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  submitDisabled?: boolean;
  children?: React.ReactNode;
}> = ({ open, title, busy, onClose, onSubmit, submitDisabled, children }) => {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        sx: { width: { xs: 320, sm: 480, md: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" },
      }}
    >
      <Box sx={{ width: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          px={2}
          py={1.5}
        >
          <Typography variant="h6">{title}</Typography>
          <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
            <CloseOutlined />
          </IconButton>
        </Stack>
        <Divider />
        <Box
          px={2}
          py={2}
          sx={{
            flex: 1,
            overflowY: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            '&::-webkit-scrollbar': {
              display: 'none',
            },
          }}
        >
          {children}
        </Box>
        <Divider />
        <Box px={2} py={1.5} display="flex" justifyContent="flex-end" gap={1.5}>
          <Button onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            onClick={onSubmit}
            variant="contained"
            disabled={busy || !!submitDisabled}
          >
            {busy ? (
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircularProgress size={18} />
                <span>Сохранение…</span>
              </Stack>
            ) : (
              "Сохранить"
            )}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

const AddServiceDrawer: React.FC<Props> = ({ open, onClose, onCreated }) => {
  // Вся логика формы — в хуке; компонент только «собирает» UI-блоки
  const { state, handlers, submitDisabled } = useAddServiceForm({
    open,
    onClose,
    onCreated,
  });

  return (
    <DrawerBase
      open={open}
      title="Добавление услуги"
      busy={state.busy}
      onClose={onClose}
      onSubmit={handlers.handleSubmit}
      submitDisabled={submitDisabled}
    >
      <Stack spacing={2}>
        {/* Секция: Картинка (презентер) */}
        <ServicePhotoUploader
          photoFile={state.photoFile}
          photoPreview={state.photoPreview}
          onPickPhoto={handlers.onPickPhoto}
        />

        {/* Секция: Название и цена (презентер) */}
        <ServiceDetailsForm
          name={state.name}
          setName={handlers.setName}
          price={state.price}
          setPrice={handlers.setPrice}
          description={state.description}
          setDescription={handlers.setDescription}
          isActive={state.isActive}
          setIsActive={handlers.setIsActive}
          touched={state.touched}
        />
      </Stack>
    </DrawerBase>
  );
};

export default AddServiceDrawer;
