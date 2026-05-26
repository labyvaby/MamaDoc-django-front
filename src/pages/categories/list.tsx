import React from "react";
import { DataGrid, type GridColDef, type GridColumnVisibilityModel } from "@mui/x-data-grid";
import {
  DeleteButton,
  List,
  ShowButton,
  useDataGrid,
} from "@refinedev/mui";
import { useCreate, useUpdate, useInvalidate } from "@refinedev/core";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import {
  Drawer,
  Box,
  Stack,
  TextField,
  Divider,
  CircularProgress,
  IconButton,
  Button,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { PageHeader } from "../../components/ui";
import EditOutlined from "@mui/icons-material/EditOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

type CategoryRow = {
  id: number | string;
  title?: string;
};

export const CategoryList: React.FC = () => {
  const { dataGridProps } = useDataGrid({});
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down("sm"));
  const columnVisibility = React.useMemo<GridColumnVisibilityModel>(() => {
    const m: GridColumnVisibilityModel = {};
    if (isSm) m.id = false;
    return m;
  }, [isSm]);

  const [addOpen, setAddOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState<CategoryRow | null>(null);
  const invalidate = useInvalidate();

  const columns = React.useMemo<GridColDef[]>(
    () => [
      {
        field: "id",
        headerName: "ID",
        type: "number",
        minWidth: 50,
        display: "flex",
        align: "left",
        headerAlign: "left",
      },
      {
        field: "title",
        flex: 1,
        headerName: "Title",
        minWidth: 200,
        display: "flex",
      },
      {
        field: "actions",
        headerName: "Actions",
        align: "right",
        headerAlign: "right",
        minWidth: 120,
        sortable: false,
        display: "flex",
        renderCell: function render({ row }) {
          const rec = row as CategoryRow;
          return (
            <Stack direction="row" spacing={0.5}>
              <IconButton size="small" aria-label="Edit" onClick={() => setEditOpen(rec)}>
                <EditOutlined fontSize="small" />
              </IconButton>
              <ShowButton hideText recordItemId={rec.id} />
              <DeleteButton hideText recordItemId={rec.id} />
            </Stack>
          );
        },
      },
    ],
    []
  );

  const handleCreated = async () => {
    await invalidate({
      resource: "categories",
      invalidates: ["list"],
    });
  };

  const handleUpdated = async () => {
    await invalidate({
      resource: "categories",
      invalidates: ["list"],
    });
  };

  return (
    <List
      title={null}
      headerButtons={
        <PageHeader
          title="Categories"
          addButtonText="Add category"
          addButtonIcon={<AddIcon />}
          onAdd={() => setAddOpen(true)}
        />
      }
    >
      <DataGrid
        {...dataGridProps}
        columns={columns}
        columnVisibilityModel={columnVisibility}
        autoHeight
        disableRowSelectionOnClick
        density="compact"
        sx={{
          borderRadius: 2,
          "& .MuiDataGrid-columnHeaders": {
            backgroundColor: "background.paper",
          },
        }}
      />

      <AddCategoryDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={handleCreated}
      />

      <EditCategoryDrawer
        record={editOpen}
        onClose={() => setEditOpen(null)}
        onUpdated={handleUpdated}
      />
    </List>
  );
};

const DrawerBase: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  busy?: boolean;
  onSubmit?: () => void;
  submitLabel?: string;
}> = ({ open, title, onClose, children, busy, onSubmit, submitLabel = "Save" }) => {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 420, md: "36vw" }, maxWidth: "100vw" } }}
    >
      <Box sx={{ width: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" px={2} py={1.5}>
          <Typography variant="h6">{title}</Typography>
          <IconButton onClick={busy ? undefined : onClose}>
            <CloseOutlined />
          </IconButton>
        </Stack>
        <Divider />
        <Box px={2} py={2}>
          {children}
        </Box>
        <Divider />
        <Box px={2} py={1.5} display="flex" justifyContent="flex-end" gap={1.5}>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {onSubmit && (
            <Button onClick={onSubmit} variant="contained" disabled={busy}>
              {busy ? (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CircularProgress size={18} />
                  <span>Saving…</span>
                </Stack>
              ) : (
                submitLabel
              )}
            </Button>
          )}
        </Box>
      </Box>
    </Drawer>
  );
};

const AddCategoryDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}> = ({ open, onClose, onCreated }) => {
  const [title, setTitle] = React.useState("");
  const { mutateAsync } = useCreate();
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) setTitle("");
  }, [open]);

  const handleSubmit = async () => {
    try {
      setBusy(true);
      const payload: Record<string, unknown> = { title: title.trim() };
      await mutateAsync({ resource: "categories", values: payload });
      await onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerBase open={open} title="New Category" onClose={onClose} busy={busy} onSubmit={handleSubmit} submitLabel="Create">
      <Stack spacing={2}>
        <TextField
          label="Title"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
          required
          fullWidth
        />
      </Stack>
    </DrawerBase>
  );
};

const EditCategoryDrawer: React.FC<{
  record: CategoryRow | null;
  onClose: () => void;
  onUpdated: () => void;
}> = ({ record, onClose, onUpdated }) => {
  const open = Boolean(record);
  const [title, setTitle] = React.useState("");
  const { mutateAsync } = useUpdate();
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (record) {
      setTitle(record.title ?? "");
    }
  }, [record]);

  const handleSubmit = async () => {
    if (!record) return;
    try {
      setBusy(true);
      const payload: Record<string, unknown> = { title: title.trim() };
      await mutateAsync({ resource: "categories", id: record.id, values: payload });
      await onUpdated();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerBase open={open} title="Edit Category" onClose={onClose} busy={busy} onSubmit={handleSubmit}>
      <Stack spacing={2}>
        <TextField
          label="Title"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
          required
          fullWidth
        />
      </Stack>
    </DrawerBase>
  );
};
