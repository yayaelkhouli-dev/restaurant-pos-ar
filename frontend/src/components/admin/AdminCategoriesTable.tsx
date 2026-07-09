import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit,
  Trash2,
  Tag,
  Hash,
  Calendar
} from "lucide-react"
import type { Category } from "@/types"

interface AdminCategoriesTableProps {
  data: Category[]
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
  isLoading?: boolean
}

export function AdminCategoriesTable({
  data,
  onEdit,
  onDelete,
  isLoading = false
}: AdminCategoriesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])

  const columns: ColumnDef<Category>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => {
        const isSorted = column.getIsSorted()
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 lg:px-3 gap-2"
          >
            <Tag className="h-4 w-4" />
            الصنف
            {isSorted === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : isSorted === "desc" ? (
              <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUpDown className="h-4 w-4" />
            )}
          </Button>
        )
      },
      cell: ({ row }) => {
        const category = row.original
        return (
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div 
                className="h-8 w-8 rounded-lg flex items-center justify-center"
                style={{ 
                  backgroundColor: category.color || '#6B7280',
                  color: 'white'
                }}
              >
                <Tag className="h-4 w-4" />
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-900">
                {category.name}
              </div>
              <div className="text-sm text-gray-500 line-clamp-1">
                {category.description || "لا يوجد وصف"}
              </div>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "sort_order",
      header: ({ column }) => {
        const isSorted = column.getIsSorted()
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 lg:px-3 gap-2"
          >
            <Hash className="h-4 w-4" />
            الترتيب
            {isSorted === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : isSorted === "desc" ? (
              <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUpDown className="h-4 w-4" />
            )}
          </Button>
        )
      },
      cell: ({ getValue }) => {
        const order = getValue() as number
        return (
          <div className="text-gray-600 font-mono">
            #{order}
          </div>
        )
      },
    },
    {
      accessorKey: "is_active",
      header: "الحالة",
      cell: ({ getValue }) => {
        const isActive = getValue() as boolean
        return (
          <Badge variant={isActive ? "default" : "secondary"}>
            <div className={`w-2 h-2 rounded-full ml-2 ${isActive ? 'bg-green-400' : 'bg-gray-400'}`} />
            {isActive ? "مفعّل" : "غير مفعّل"}
          </Badge>
        )
      },
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => {
        const isSorted = column.getIsSorted()
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 lg:px-3 gap-2"
          >
            <Calendar className="h-4 w-4" />
            تاريخ الإنشاء
            {isSorted === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : isSorted === "desc" ? (
              <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUpDown className="h-4 w-4" />
            )}
          </Button>
        )
      },
      cell: ({ getValue }) => {
        const date = getValue() as string
        return (
          <div className="text-gray-900">
            {new Date(date).toLocaleDateString()}
          </div>
        )
      },
    },
    {
      id: "actions",
      header: "إجراءات",
      cell: ({ row }) => {
        const category = row.original
        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(category)}
              className="h-8 px-2 lg:px-3 gap-2"
            >
              <Edit className="h-4 w-4" />
              <span className="sr-only lg:not-sr-only">تعديل</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDelete(category)}
              className="h-8 px-2 lg:px-3 gap-2 text-red-600 hover:text-red-700 hover:border-red-300"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only lg:not-sr-only">حذف</span>
            </Button>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  })

  return (
    <div className="w-full">
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className="px-4">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="hover:bg-gray-50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                      <Tag className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-gray-500">لا توجد أصناف</p>
                    <p className="text-sm text-gray-400">أنشئ أول صنف لك للبدء</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
