import React from "react";
import { Box, Stack, TextField, InputAdornment, IconButton, CircularProgress, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
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
    loading?: boolean;
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
    loading = false,
}) => {
    const handleClear = () => onSearchChange?.("");

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
                            {showSearch && (
                                <TextField
                                    size="small"
                                    placeholder={searchPlaceholder}
                                    value={searchVal}
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
                                    sx={(theme) => ({
                                        flex: 1,
                                        minWidth: 0,
                                        maxWidth: {
                                            xs: "100%",
                                            md: 360,
                                        },
                                        "& .MuiInputBase-root": {
                                            minHeight: theme.appLayout.controls.inputHeight,
                                            paddingRight: 1,
                                            boxSizing: "border-box",
                                        },
                                    })}
                                />
                            )}

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
