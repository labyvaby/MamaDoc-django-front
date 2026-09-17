import React from "react";
import {
    Box,
    Stack,
    TextField,
    InputAdornment,
    IconButton,
    CircularProgress,
    Typography,
    useMediaQuery,
    useTheme,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import SearchIcon from "@mui/icons-material/SearchOutlined";
import ClearIcon from "@mui/icons-material/ClearOutlined";
import { AppButton } from "./AppButton";

export type PageHeaderProps = {
    /** Заголовок страницы/списка */
    title: React.ReactNode;

    /** Показывать ли заголовок внутри контента.
     * Если глобальный AppHeader уже рендерит title через usePageTitle,
     * можно выключить, чтобы не дублировать текст.
     */
    showTitle?: boolean;

    /** Основное действие (обычно "Добавить ...") */
    onAdd?: () => void;
    addButtonText?: string;
    /** Иконка для основной кнопки. По умолчанию — AddOutlined */
    addButtonIcon?: React.ReactNode;

    /** Элементы слева от поиска */
    leftActions?: React.ReactNode;

    /** Специальный компонент навигации по датам */
    dateNavigation?: React.ReactNode;

    /** Дополнительные action-элементы справа (фильтры, toggles и т.п.) */
    actions?: React.ReactNode;

    /** Включить строку поиска */
    showSearch?: boolean;
    searchVal?: string;
    onSearchChange?: (val: string) => void;
    searchPlaceholder?: string;
    /** Ссылка на поле поиска — чтобы страница могла навести фокус (шорткат «/»). */
    searchInputRef?: React.Ref<HTMLInputElement>;
    loading?: boolean;

    /**
     * На телефоне схлопывать шапку: вместо трёх строк (кнопка → даты → поиск)
     * две — лента дат и ряд «поиск + действия + «+»». Подпись кнопки добавления
     * занимала на телефоне целую строку экрана, а в списках каждый ряд шапки —
     * это минус одна видимая запись.
     */
    compactMobile?: boolean;
};

export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    showTitle = true,
    onAdd,
    addButtonText = "Добавить",
    addButtonIcon,
    leftActions,
    dateNavigation,
    actions,
    showSearch = false,
    searchVal = "",
    onSearchChange,
    searchPlaceholder = "Поиск...",
    searchInputRef,
    loading = false,
    compactMobile = false,
}) => {
    const theme = useTheme();
    // Граница «телефон/десктоп» — md: в теме проекта sm = 360 и телефон в него
    // попадает (см. theme.ts).
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const compact = compactMobile && isMobile;
    const handleClear = () => onSearchChange?.("");

    const searchField = showSearch ? (
        <TextField
            size="small"
            placeholder={searchPlaceholder}
            value={searchVal}
            inputRef={searchInputRef}
            onChange={(e) => onSearchChange?.(e.target.value)}
            InputProps={{
                startAdornment: (
                    <InputAdornment position="start">
                        <SearchIcon color="action" />
                    </InputAdornment>
                ),
                endAdornment: (
                    <InputAdornment position="end">
                        {loading ? <CircularProgress size={20} /> : null}
                        {!loading && searchVal && (
                            <IconButton size="small" onClick={handleClear}>
                                <ClearIcon fontSize="small" />
                            </IconButton>
                        )}
                    </InputAdornment>
                ),
            }}
            sx={(t) => ({
                flex: 1,
                minWidth: 0,
                maxWidth: {
                    xs: "100%",
                    md: 360,
                },
                "& .MuiInputBase-root": {
                    minHeight: t.appLayout.controls.inputHeight,
                    paddingRight: 1,
                    boxSizing: "border-box",
                },
            })}
        />
    ) : null;

    if (compact) {
        return (
            <Box sx={(t) => ({ mb: 1, px: t.appLayout.page.paddingX, pt: 0 })}>
                <Stack spacing={1} sx={{ width: "100%" }}>
                    {showTitle && (
                        <Typography variant="h6" sx={{ fontWeight: 600, letterSpacing: -0.2 }}>
                            {title}
                        </Typography>
                    )}

                    {dateNavigation && (
                        <Box sx={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                            {dateNavigation}
                        </Box>
                    )}

                    {(searchField || actions || onAdd || leftActions) && (
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                            {leftActions}
                            {searchField}
                            {actions}
                            {onAdd && (
                                <AppButton
                                    variant="contained"
                                    onClick={onAdd}
                                    aria-label={addButtonText}
                                    title={addButtonText}
                                    startIcon={addButtonIcon ?? <AddOutlined />}
                                    sx={(t) => ({
                                        flexShrink: 0,
                                        minWidth: t.appLayout.controls.buttonHeight,
                                        width: t.appLayout.controls.buttonHeight,
                                        height: t.appLayout.controls.buttonHeight,
                                        px: 0,
                                        "& .MuiButton-startIcon": { m: 0 },
                                    })}
                                />
                            )}
                        </Stack>
                    )}
                </Stack>
            </Box>
        );
    }

    return (
        <Box sx={(theme) => ({
            mb: 1.5,
            px: theme.appLayout.page.paddingX,
            pt: 0,
        })}>
            <Stack spacing={1.5} sx={{ width: "100%" }}>
                {/* Верхняя строка: title (если нужен) */}
                {showTitle && (
                    <Typography
                        variant="h5"
                        sx={(theme) => ({
                            fontWeight: 600,
                            letterSpacing: -0.2,
                            color: theme.palette.text.primary,
                        })}
                    >
                        {title}
                    </Typography>
                )}

                {/* Строка с кнопкой добавления и поиском */}
                <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={{ xs: 1.5, md: 2 }}
                    alignItems={{ xs: "stretch", md: "center" }}
                    flexWrap="nowrap"
                    sx={{ width: "100%" }}
                >
                    {/* Кнопка добавления */}
                    {onAdd && (
                        <AppButton
                            variant="contained"
                            size="large"
                            startIcon={addButtonIcon ?? <AddOutlined />}
                            onClick={onAdd}
                            sx={(theme) => ({
                                whiteSpace: "nowrap",
                                minHeight: theme.appLayout.controls.buttonHeight,
                                flexShrink: 0
                            })}
                        >
                            {addButtonText}
                        </AppButton>
                    )}

                    {/* Навигация по датам */}
                    {dateNavigation && (
                        <Box sx={{
                            flex: 1,
                            minWidth: 0,
                            display: "flex",
                            alignItems: "center",
                            width: "100%", // Full width on mobile
                            overflow: "hidden"
                        }}>
                            {dateNavigation}
                        </Box>
                    )}

                    {/* Дополнительные действия слева */}
                    {leftActions && (
                        <Stack
                            direction="row"
                            spacing={1.5}
                            alignItems="center"
                            sx={{
                                flex: { xs: "1 0 auto", md: "0 0 auto" }
                            }}
                        >
                            {leftActions}
                        </Stack>
                    )}

                    {/* Группа поиска и действий (в одну строку на мобилках) */}
                    {(showSearch || actions) && (
                        <Stack
                            direction="row"
                            spacing={1.5}
                            alignItems="center"
                            sx={{
                                flex: { xs: "1 1 100%", md: "0 1 auto" },
                                width: { xs: "100%", md: "auto" }
                            }}
                        >
                            {/* Строка поиска */}
                            {searchField}

                            {/* Дополнительные действия */}
                            {actions && (
                                <Stack
                                    direction="row"
                                    spacing={1.5}
                                    alignItems="center"
                                    sx={{ flexShrink: 0 }}
                                >
                                    {actions}
                                </Stack>
                            )}
                        </Stack>
                    )}
                </Stack>
            </Stack>
        </Box>
    );
};
