/**
 * Кнопка «Документ» в шапке дровера заключения — одно меню на всё, что
 * задаёт вид документа: бланк, свободный текст и шаблоны текста.
 *
 * До 28.09.2026 это были три разных места: «Шаблоны» и звёздочка «Сохранить
 * как шаблон» в шапке, а селект «Бланк» с кнопкой «Открепить» — в теле формы.
 * Врачи путали шаблон (заготовка текста) и бланк (печатная форма), а селект
 * посреди формы читался как ещё одно поле документа.
 *
 * «Свободный текст» — это прежнее «Открепить»: текст, собранный бланком,
 * остаётся в поле, а вернуть бланк можно выбором его же из списка (дровер
 * восстановит строки, если текст не трогали — см. handleSelectForm).
 */
import React from "react";
import {
  Box,
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import BookmarkAddOutlined from "@mui/icons-material/BookmarkAddOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import dayjs from "dayjs";

import { useT } from "../../i18n/VerticalProvider";
import type { ConclusionFormTemplate } from "../../api/conclusionForms";
import type { ConclusionTemplate, PatientConclusionSummary } from "../../api/medical";
import { parseConclusionFormData } from "../../api/conclusionFormData";

type Props = {
  /** Бланки, доступные этому заключению (плюс прикреплённый, если его нет в выдаче). */
  forms: ConclusionFormTemplate[];
  /** Прикреплённый бланк; null — свободный текст. */
  form: ConclusionFormTemplate | null;
  onSelectForm: (formId: number) => void;
  /** Перейти на свободный текст (открепить бланк). */
  onFreeText: () => void;
  templates: ConclusionTemplate[];
  onApplyTemplate: (template: ConclusionTemplate) => void;
  onDeleteTemplate: (templateId: number) => void;
  onSaveTemplate: () => void;
  /** Прошлые завершённые заключения пациента — «как в прошлый раз». */
  previous?: PatientConclusionSummary[];
  onApplyPrevious?: (item: PatientConclusionSummary) => void;
  /** Прошлое заключение догружается (карточка с formData). */
  previousLoading?: boolean;
  /** Узкая шапка (телефон): без подписи «Документ:». */
  compact?: boolean;
};

/** Имя бланка, строки которого хранит шаблон; у текстового шаблона — нет. */
const templateFormName = (tpl: ConclusionTemplate): string | undefined => {
  const parsed = parseConclusionFormData(tpl.formData);
  return parsed ? parsed.snapshot?.name ?? undefined : undefined;
};

export const ConclusionDocumentMenu: React.FC<Props> = ({
  forms,
  form,
  onSelectForm,
  onFreeText,
  templates,
  onApplyTemplate,
  onDeleteTemplate,
  onSaveTemplate,
  previous = [],
  onApplyPrevious,
  previousLoading = false,
  compact = false,
}) => {
  const { t } = useT("appointments");
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  const pick = (action: () => void) => () => {
    close();
    action();
  };

  const current = form?.name ?? t("conclusion.document.freeText");

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        startIcon={<DescriptionOutlined />}
        endIcon={<ExpandMoreOutlined />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        sx={{
          minWidth: 0,
          maxWidth: { xs: "100%", md: 340 },
          borderColor: "divider",
          fontWeight: 500,
          "& .MuiButton-endIcon": { ml: 0.5 },
        }}
      >
        <Box
          component="span"
          sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {!compact && (
            <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
              {t("conclusion.document.button")}:{" "}
            </Box>
          )}
          {current}
        </Box>
      </Button>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        slotProps={{ paper: { sx: { width: 320, maxWidth: "calc(100vw - 32px)" } } }}
        MenuListProps={{ dense: true }}
      >
        {/* Бланков в организации нет — выбирать не из чего, раздел не нужен. */}
        {forms.length > 0 && [
          <ListSubheader key="forms-h" sx={{ lineHeight: "32px" }}>
            {t("conclusion.document.form")}
          </ListSubheader>,
          ...forms.map((item) => (
            <MenuItem
              key={`form-${item.id}`}
              selected={item.id === form?.id}
              onClick={pick(() => onSelectForm(item.id))}
            >
              <ListItemIcon>
                {item.id === form?.id && <CheckOutlined fontSize="small" color="primary" />}
              </ListItemIcon>
              {/* Названия бланков длинные и начинаются одинаково («Протокол
                  ультразвукового исследования …») — полное имя в подсказке. */}
              <ListItemText
                primary={item.name}
                primaryTypographyProps={{ noWrap: true, title: item.name }}
              />
            </MenuItem>
          )),
          <MenuItem key="free" selected={!form} onClick={pick(onFreeText)}>
            <ListItemIcon>{!form && <CheckOutlined fontSize="small" color="primary" />}</ListItemIcon>
            <ListItemText
              primary={t("conclusion.document.freeText")}
              secondary={t("conclusion.document.freeTextHint")}
            />
          </MenuItem>,
          <Divider key="forms-d" />,
        ]}

        <ListSubheader sx={{ lineHeight: "32px" }}>
          {t("conclusion.document.insertTemplate")}
        </ListSubheader>
        {templates.length === 0 && (
          <MenuItem disabled>
            <ListItemIcon />
            <ListItemText primary={t("conclusion.noTemplates")} />
          </MenuItem>
        )}
        {templates.map((tpl) => (
          <MenuItem key={`tpl-${tpl.id}`} onClick={pick(() => onApplyTemplate(tpl))} sx={{ pr: 1 }}>
            <ListItemIcon />
            <ListItemText
              primary={tpl.name}
              primaryTypographyProps={{ noWrap: true, title: tpl.name }}
              // Шаблон со строками бланка применяется вместе с этим бланком.
              secondary={templateFormName(tpl)}
              secondaryTypographyProps={{ noWrap: true }}
            />
            <Tooltip title={t("conclusion.document.deleteTemplate")}>
              <IconButton
                size="small"
                edge="end"
                aria-label={t("conclusion.document.deleteTemplate")}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTemplate(tpl.id);
                }}
              >
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Tooltip>
          </MenuItem>
        ))}
        {previous.length > 0 && onApplyPrevious && [
          <Divider key="prev-d" />,
          <ListSubheader key="prev-h" sx={{ lineHeight: "32px" }}>
            {t("conclusion.previous.title")}
          </ListSubheader>,
          ...previous.map((item) => (
            <MenuItem
              key={`prev-${item.id}`}
              disabled={previousLoading}
              onClick={pick(() => onApplyPrevious(item))}
            >
              <ListItemIcon>
                <HistoryOutlined fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={`${dayjs(item.occurredAt).format("DD.MM.YYYY")} · ${item.serviceName}`}
                primaryTypographyProps={{ noWrap: true }}
                secondary={item.doctor?.fullName ?? undefined}
                secondaryTypographyProps={{ noWrap: true }}
              />
            </MenuItem>
          )),
        ]}
        <Divider />
        <MenuItem onClick={pick(onSaveTemplate)}>
          <ListItemIcon>
            <BookmarkAddOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t("conclusion.document.saveTemplate")} />
        </MenuItem>
      </Menu>
    </>
  );
};

export default ConclusionDocumentMenu;
