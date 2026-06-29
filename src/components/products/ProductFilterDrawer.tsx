import React from "react";
import {
    Drawer,
    Box,
    Typography,
    IconButton,
    Divider,
    Stack,
    TextField,
    MenuItem,
    Button,
    Autocomplete,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/CloseOutlined";

export type ProductFilters = {
    category: string | null;
    saleStatus: "all" | "active" | "inactive";
    stockStatus: "all" | "in_stock" | "out_of_stock";
};

type Props = {
    open: boolean;
    onClose: () => void;
    filters: ProductFilters;
    onApply: (newFilters: ProductFilters) => void;
    onReset: () => void;
    availableCategories: string[];
};

const ProductFilterDrawer: React.FC<Props> = ({
    open,
    onClose,
    filters,
    onApply,
    onReset,
    availableCategories,
}) => {
    const [localFilters, setLocalFilters] = React.useState<ProductFilters>(filters);

    // Sync local state when drawer opens or filters change externally
    React.useEffect(() => {
        if (open) {
            setLocalFilters(filters);
        }
    }, [open, filters]);

    const handleChange = (field: keyof ProductFilters, value: any) => {
        setLocalFilters((prev) => ({ ...prev, [field]: value }));
    };

    const handleApply = () => {
        onApply(localFilters);
        onClose();
    };

    const handleReset = () => {
        onReset();
        onClose();
    };

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: { width: { xs: 320, sm: 480, md: 520 }, maxWidth: "100vw" },
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2 }}>
                <Typography variant="h6">Фильтры</Typography>
                <IconButton onClick={onClose} size="small">
                    <CloseIcon />
                </IconButton>
            </Box>
            <Divider />

            <Box
                sx={{
                    p: 2,
                    flex: 1,
                    overflowY: "auto",
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    '&::-webkit-scrollbar': {
                        display: 'none',
                    },
                }}
            >
                <Stack spacing={3}>
                    {/* Category Filter */}
                    <Autocomplete
                        options={availableCategories}
                        value={localFilters.category}
                        onChange={(_, newValue) => handleChange("category", newValue)}
                        renderInput={(params) => (
                            <TextField {...params} label="Категория" placeholder="Все категории" />
                        )}
                        noOptionsText="Нет категорий"
                        isOptionEqualToValue={(option, value) => option === value}
                    />

                    {/* Sale Status */}
                    <TextField
                        select
                        label="Статус продажи"
                        value={localFilters.saleStatus}
                        onChange={(e) => handleChange("saleStatus", e.target.value)}
                        fullWidth
                    >
                        <MenuItem value="all">Все</MenuItem>
                        <MenuItem value="active">В продаже</MenuItem>
                        <MenuItem value="inactive">Снят с продажи</MenuItem>
                    </TextField>

                    {/* Stock Status */}
                    <TextField
                        select
                        label="Наличие на складе"
                        value={localFilters.stockStatus}
                        onChange={(e) => handleChange("stockStatus", e.target.value)}
                        fullWidth
                    >
                        <MenuItem value="all">Не важно</MenuItem>
                        <MenuItem value="in_stock">В наличии</MenuItem>
                        <MenuItem value="out_of_stock">Нет в наличии</MenuItem>
                    </TextField>
                </Stack>
            </Box>

            <Divider />
            <Box sx={{ p: 2, display: "flex", gap: 2 }}>
                <Button variant="outlined" fullWidth onClick={handleReset}>
                    Сбросить
                </Button>
                <Button variant="contained" fullWidth onClick={handleApply}>
                    Применить
                </Button>
            </Box>
        </Drawer>
    );
};

export default ProductFilterDrawer;
