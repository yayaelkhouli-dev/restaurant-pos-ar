import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { useState } from "react"
import { formatCurrency } from "@/lib/utils"
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
  Package,
  Banknote,
  Clock,
  Image,
  Tag
} from "lucide-react"
import type { Product, Category } from "@/types"

interface AdminMenuTableProps {
  data: Product[]
  categories: Category[]
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
  isLoading?: boolean
}

export function AdminMenuTable({
  data,
  categories,
  onEdit,
  onDelete,
  isLoading = false
}: AdminMenuTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "بدون صنف"
    const category = categories.find(cat => cat.id === categoryId)
    return category?.name || "صنف غير معروف"
  }

  const getCategoryColor = (categoryId: string | null) => {
    if (!categoryId) return "bg-gray-100 text-gray-800"
    const category = categories.find(cat => cat.id === categoryId)
    return category?.color || "bg-gray-100 text-gray-800"
  }


  const columns: ColumnDef<Product>[] = [
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
            <Package className="h-4 w-4" />
            منتج
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
        const product = row.original
        return (
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              {product.image_url ? (
                <img 
                  src={product.image_url} 
                  alt={product.name}
                  className="h-12 w-12 rounded-lg object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-gradient-to-r from-orange-400 to-pink-500 flex items-center justify-center">
                  <Package className="h-6 w-6 text-white" />
                </div>
              )}
            </div>
            <div>
              <div className="font-medium text-gray-900">
                {product.name}
              </div>
              <div className="text-sm text-gray-500 line-clamp-1">
                {product.description || "لا يوجد وصف"}
              </div>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "category_id",
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
      cell: ({ getValue }) => {
        const categoryId = getValue() as string | null
        const categoryName = getCategoryName(categoryId)
        const categoryColor = getCategoryColor(categoryId)
        return (
          <Badge className={categoryColor}>
            {categoryName}
          </Badge>
        )
      },
    },
    {
      accessorKey: "price",
      header: ({ column }) => {
        const isSorted = column.getIsSorted()
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 lg:px-3 gap-2"
          >
            <Banknote className="h-4 w-4" />
            السعر
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
        const price = getValue() as number
        return (
          <div className="font-medium text-green-600">
            {formatCurrency(price)}
          </div>
        )
      },
    },
    {
      accessorKey: "preparation_time",
      header: ({ column }) => {
        const isSorted = column.getIsSorted()
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 lg:px-3 gap-2"
          >
            <Clock className="h-4 w-4" />
            وقت التحضير
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
        const time = getValue() as number
        return (
          <div className="text-gray-900">
            {time}دقيقة
          </div>
        )
      },
    },
    {
      accessorKey: "is_available",
      header: "التوفر",
      cell: ({ getValue }) => {
        const isAvailable = getValue() as boolean
        return (
          <Badge variant={isAvailable ? "default" : "secondary"}>
            <div className={`w-2 h-2 rounded-full ml-2 ${isAvailable ? 'bg-green-400' : 'bg-red-400'}`} />
            {isAvailable ? "متاح" : "غير متوفر"}
          </Badge>
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
          <div className="text-gray-600">
            #{order}
          </div>
        )
      },
    },
    {
      id: "actions",
      header: "إجراءات",
      cell: ({ row }) => {
        const product = row.original
        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(product)}
              className="h-8 px-2 lg:px-3 gap-2"
            >
              <Edit className="h-4 w-4" />
              <span className="sr-only lg:not-sr-only">تعديل</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDelete(product)}
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
              Array.from({ length: 5 }).map((_, i) => (
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
                      <Package className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-gray-500">لا توجد منتجات</p>
                    <p className="text-sm text-gray-400">جرّب تعديل البحث أو أضف منتجاً جديداً</p>
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
