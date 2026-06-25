'use client'

import {
  DataGrid,
  Toolbar,
  ColumnsPanelTrigger,
  FilterPanelTrigger,
  ExportCsv,
  QuickFilter,
  QuickFilterControl,
  type GridColDef,
  type GridRowId,
  type GridValidRowModel,
  type GridEventListener,
} from '@mui/x-data-grid'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import SearchIcon from '@mui/icons-material/Search'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import FilterListIcon from '@mui/icons-material/FilterList'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import type { SxProps, Theme } from '@mui/material/styles'
import { colors, semantic } from '@/lib/tokens'

/**
 * Shared toolbar for every DataTable — Columns / Filters / Export (CSV) on the
 * left, a quick-filter Search on the right. Built on the v9 composable toolbar
 * primitives (`Toolbar`, `ColumnsPanelTrigger`, `FilterPanelTrigger`,
 * `ExportCsv`, `QuickFilter`) rendered through MUI Button/TextField so the look
 * matches the rest of the dark-glass UI.
 */
function GridTopToolbar() {
  return (
    <Toolbar
      render={(props) => (
        <Box
          {...props}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.25,
            py: 1,
            borderBottom: `1px solid ${colors.border1}`,
          }}
        />
      )}
    >
      <ColumnsPanelTrigger
        render={(triggerProps) => (
          <Button
            {...triggerProps}
            size="small"
            color="inherit"
            startIcon={<ViewColumnIcon sx={{ fontSize: 18 }} />}
            sx={{ color: colors.fg2, textTransform: 'none' }}
          >
            Columns
          </Button>
        )}
      />
      <FilterPanelTrigger
        render={(triggerProps) => (
          <Button
            {...triggerProps}
            size="small"
            color="inherit"
            startIcon={<FilterListIcon sx={{ fontSize: 18 }} />}
            sx={{ color: colors.fg2, textTransform: 'none' }}
          >
            Filters
          </Button>
        )}
      />
      <ExportCsv
        render={(exportProps) => (
          <Button
            {...exportProps}
            size="small"
            color="inherit"
            startIcon={<FileDownloadIcon sx={{ fontSize: 18 }} />}
            sx={{ color: colors.fg2, textTransform: 'none' }}
          >
            Export
          </Button>
        )}
      />
      <Box sx={{ flex: 1 }} />
      <QuickFilter>
        <QuickFilterControl
          render={({ ref, ...controlProps }, state) => (
            <TextField
              {...controlProps}
              inputRef={ref}
              value={state.value}
              size="small"
              placeholder="Search…"
              aria-label="Search"
              sx={{ width: { xs: 140, sm: 220 } }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 18, color: colors.fg3 }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          )}
        />
      </QuickFilter>
    </Toolbar>
  )
}

export type DataTableProps<R extends GridValidRowModel = GridValidRowModel> = {
  rows: readonly R[]
  columns: GridColDef<R>[]
  getRowId?: (row: R) => GridRowId
  onRowClick?: GridEventListener<'rowClick'>
  checkboxSelection?: boolean
  loading?: boolean
  pageSizeOptions?: number[]
  sx?: SxProps<Theme>
}

/**
 * Themed wrapper around MUI X `<DataGrid>`. Renders the shared toolbar
 * (Columns / Filters / Export + Search), checkbox selection, dense rows,
 * pagination (default page size 10), row hover and a dark-glass surface that
 * matches `GlassCard`. Pointer cursor + clickable rows when `onRowClick` is set.
 */
export default function DataTable<R extends GridValidRowModel = GridValidRowModel>({
  rows,
  columns,
  getRowId,
  onRowClick,
  checkboxSelection = true,
  loading,
  pageSizeOptions = [10, 25, 50],
  sx,
}: DataTableProps<R>) {
  const clickable = Boolean(onRowClick)
  return (
    <Box
      sx={{
        backgroundColor: colors.bg1,
        border: `1px solid ${colors.border1}`,
        borderRadius: 1,
        overflow: 'hidden',
        ...sx,
      }}
    >
      <DataGrid<R>
        rows={rows}
        columns={columns}
        getRowId={getRowId}
        onRowClick={onRowClick}
        checkboxSelection={checkboxSelection}
        disableRowSelectionOnClick
        loading={loading}
        density="compact"
        showToolbar
        slots={{ toolbar: GridTopToolbar }}
        pageSizeOptions={pageSizeOptions}
        initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
        sx={{
          border: 'none',
          color: colors.fg1,
          fontSize: '0.82rem',
          '--DataGrid-containerBackground': colors.bg2,
          '--DataGrid-rowBorderColor': colors.border1,
          // Header
          '& .MuiDataGrid-columnHeaders': { backgroundColor: colors.bg2 },
          '& .MuiDataGrid-columnHeader': {
            backgroundColor: colors.bg2,
            color: colors.fg2,
          },
          '& .MuiDataGrid-columnHeaderTitle': {
            fontWeight: 600,
            color: colors.fg2,
          },
          '& .MuiDataGrid-columnSeparator': { color: colors.border2 },
          // Cells
          '& .MuiDataGrid-cell': {
            borderColor: colors.border1,
            color: colors.fg1,
          },
          '& .MuiDataGrid-row': {
            cursor: clickable ? 'pointer' : 'default',
            '&:hover': { backgroundColor: colors.bg3 },
          },
          '& .MuiDataGrid-row.Mui-selected': {
            backgroundColor: 'rgba(55,166,96,0.12)',
            '&:hover': { backgroundColor: 'rgba(55,166,96,0.18)' },
          },
          // Clean look: no cell/header focus outline
          '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
          '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': { outline: 'none' },
          // Footer / pagination
          '& .MuiDataGrid-footerContainer': {
            borderColor: colors.border1,
            backgroundColor: colors.bg2,
          },
          '& .MuiTablePagination-root, & .MuiDataGrid-selectedRowCount': { color: colors.fg2 },
          // Checkboxes
          '& .MuiCheckbox-root': { color: colors.fg3 },
          '& .MuiCheckbox-root.Mui-checked': { color: semantic.accent },
          // Overlays
          '& .MuiDataGrid-overlay': { backgroundColor: colors.bg1, color: colors.fg3 },
        }}
      />
    </Box>
  )
}
