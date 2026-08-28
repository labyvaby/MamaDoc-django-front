import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { motion } from "framer-motion";

import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";

import { AppButton } from "../../components/ui";
import { cascadeContainer, cascadeItem } from "../../components/ui/motionPresets";
import { subtleBg, subtleBorder } from "../../theme/uiHelpers";
import { usePermissions } from "../../hooks/usePermissions";
import type { ChatwootUnavailableReason } from "../../api/chatwoot";

/**
 * Экран раздела «Чаты», когда дашборд показать нельзя.
 *
 * Главный из трёх случаев — `no_account`: сотрудник в CRM есть, места в
 * Чат-центре у него нет. Это тупик только на вид: администратору, чтобы связать
 * учётки, нужны ровно имя и почта — поэтому экран не извиняется, а
 * подготавливает заявку, которую можно скопировать одной кнопкой.
 *
 * Остальные два случая сотрудник исправить не может, поэтому там нет ни заявки,
 * ни призыва к действию — только честное объяснение.
 */

const MotionStack = motion(Stack);
const MotionBox = motion(Box);

/** Две реплики: своя — заполненная, чужая — пунктиром, связи между ними нет. */
const DisconnectedChats: React.FC = () => (
  <Box
    aria-hidden
    sx={{
      color: "primary.main",
      "& .dim": { opacity: 0.32 },
      "& .link": { opacity: 0.5 },
    }}
  >
    <svg width="132" height="84" viewBox="0 0 132 84" fill="none">
      {/* Реплика CRM — сплошная: сотрудник здесь есть. */}
      <path
        d="M6 14a8 8 0 0 1 8-8h34a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H26l-11 9v-9h-1a8 8 0 0 1-8-8V14Z"
        fill="currentColor"
        fillOpacity="0.13"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M17 19h28M17 27h18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* Реплика Чат-центра — пунктиром: места пока нет. */}
      <path
        className="dim"
        d="M76 42a8 8 0 0 1 8-8h34a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8h-1v9l-11-9H84a8 8 0 0 1-8-8V42Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="5 4"
      />

      {/* Разорванная связь между ними. */}
      <path
        className="link"
        d="M55 38c7 6 11 8 17 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
      <path
        className="link"
        d="M64 32.5 71 39l-6.5 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.35"
      />
    </svg>
  </Box>
);

/** Строка «имя / почта» с копированием — то, что нужно передать администратору. */
const HandoffField: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(() => {
    // Буфер обмена недоступен по http и в старых браузерах — тогда просто
    // ничего не происходит, значение всё равно видно и его можно выделить.
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => undefined,
    );
  }, [value]);

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{
        px: 2,
        py: 1.25,
        borderRadius: 2,
        bgcolor: (t) => subtleBg(t),
        border: (t) => `1px solid ${subtleBorder(t)}`,
      }}
    >
      <Stack sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", lineHeight: 1.4 }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </Typography>
      </Stack>
      <AppButton
        size="small"
        variant="text"
        onClick={copy}
        startIcon={copied ? <CheckOutlined /> : <ContentCopyOutlined />}
        sx={{ flexShrink: 0, minWidth: 116 }}
      >
        {copied ? "Скопировано" : "Копировать"}
      </AppButton>
    </Stack>
  );
};

export const ChatsUnavailable: React.FC<{
  reason: ChatwootUnavailableReason;
  onRetry?: () => void;
}> = ({ reason, onRetry }) => {
  const { employee } = usePermissions();
  const fullName: string = employee?.fullName || "";
  const email: string = employee?.email || "";

  const isNoAccount = reason === "no_account";

  const title = {
    no_account: "Вас ещё не подключили к Чат-центру",
    disabled: "Чаты не подключены",
    unavailable: "Чат-центр сейчас не отвечает",
  }[reason];

  const lead = {
    no_account:
      "В CRM вы авторизованы, но переписка с пациентами живёт в отдельной " +
      "системе — Чат-центре. Учётную запись там выдаёт администратор, поэтому " +
      "попросите его подключить вас: это займёт пару минут.",
    disabled:
      "Для вашей организации раздел чатов пока не включён. Это делается один раз " +
      "на стороне администратора — сотрудникам ничего настраивать не нужно.",
    unavailable:
      "Связаться с Чат-центром не удалось. Обычно это временно: попробуйте " +
      "обновить через минуту. Если не пройдёт — сообщите администратору.",
  }[reason];

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        alignItems: { xs: "flex-start", md: "center" },
        justifyContent: "center",
        px: 2,
        py: { xs: 4, md: 2 },
      }}
    >
      <MotionStack
        variants={cascadeContainer}
        initial="hidden"
        animate="show"
        spacing={3}
        sx={{ width: "100%", maxWidth: 560 }}
      >
        <MotionBox variants={cascadeItem} sx={{ alignSelf: "center" }}>
          <DisconnectedChats />
        </MotionBox>

        <MotionStack variants={cascadeItem} spacing={1.25}>
          <Typography variant="h5" sx={{ fontWeight: 700, textAlign: "center" }}>
            {title}
          </Typography>
          <Typography
            sx={{ color: "text.secondary", textAlign: "center", lineHeight: 1.65 }}
          >
            {lead}
          </Typography>
        </MotionStack>

        {isNoAccount && (email || fullName) && (
          <MotionStack variants={cascadeItem} spacing={1.25}>
            <Typography
              variant="overline"
              sx={{ color: "text.secondary", letterSpacing: "0.08em" }}
            >
              Передайте администратору
            </Typography>
            {fullName && <HandoffField label="Сотрудник" value={fullName} />}
            {email ? (
              <HandoffField label="Почта в CRM" value={email} />
            ) : (
              <Typography variant="body2" sx={{ color: "warning.main" }}>
                В вашей карточке не указана почта — попросите администратора
                заодно заполнить её, по ней и связывают учётные записи.
              </Typography>
            )}
          </MotionStack>
        )}

        {reason === "unavailable" && onRetry && (
          <MotionBox variants={cascadeItem} sx={{ alignSelf: "center" }}>
            <AppButton
              variant="outlined"
              startIcon={<RefreshOutlined />}
              onClick={onRetry}
            >
              Попробовать снова
            </AppButton>
          </MotionBox>
        )}
      </MotionStack>
    </Box>
  );
};

export default ChatsUnavailable;
