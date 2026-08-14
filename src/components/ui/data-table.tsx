"use client"
import * as React from "react"
import {
  flexRender,
  createCoreRowModel,
  useTable,
  createPaginatedRowModel,
  createSortedRowModel,
  rowSortingFeature,
  rowPaginationFeature,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface DataTableProps {
  columns: any[]
  data: any[]
  pageCount?: number
  emptyMessage?: string
}

export function DataTable({
  columns,
  data,
  emptyMessage = "No results.",
}: DataTableProps) {
  const [sorting, setSorting] = React.useState<any[]>([])
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 })

  const table = useTable({
    data: data || [],
    columns: columns as any,
    _features: [rowSortingFeature, rowPaginationFeature],
    _rowModels: {
      Core: createCoreRowModel(),
      Paginated: createPaginatedRowModel(),
      Sorted: createSortedRowModel(),
    },
    onSortingChange: setSorting as any,
    onPaginationChange: setPagination as any,
    state: {
      sorting,
      pagination,
    },
  } as any)

  const rows = table.getRowModel?.()?.rows ?? []
  const headerGroups = table.getHeaderGroups?.() ?? []
  const pageCount = table.getPageCount?.() ?? 1
  const canPrev = pagination.pageIndex > 0
  const canNext = pagination.pageIndex < pageCount - 1

  return (
    <div>
      <div className="rounded-md border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            {headerGroups.map((headerGroup: any) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header: any) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row: any) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell: any) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {data.length > 20 && (
        <div className="flex items-center justify-between py-4">
          <p className="text-sm text-muted-foreground">
            Page {pagination.pageIndex + 1} of {pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(p => ({ ...p, pageIndex: p.pageIndex - 1 }))}
              disabled={!canPrev}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(p => ({ ...p, pageIndex: p.pageIndex + 1 }))}
              disabled={!canNext}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
