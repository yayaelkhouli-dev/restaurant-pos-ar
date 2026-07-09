import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Plus, 
  Search,
  Package,
  Tag,
  Edit,
  Trash2,
  Table,
  Grid3X3,
  Banknote,
  Clock
} from 'lucide-react'
import apiClient from '@/api/client'
import { toastHelpers } from '@/lib/toast-helpers'
import { ProductForm } from '@/components/forms/ProductForm'
import { CategoryForm } from '@/components/forms/CategoryForm'
import { AdminMenuTable } from '@/components/admin/AdminMenuTable'
import { AdminCategoriesTable } from '@/components/admin/AdminCategoriesTable'
import { PaginationControlsComponent } from '@/components/ui/pagination-controls'
import { usePagination } from '@/hooks/usePagination'
import { ProductListSkeleton, CategoryListSkeleton, SearchingSkeleton } from '@/components/ui/skeletons'
import { InlineLoading } from '@/components/ui/loading-spinner'
import type { Product, Category } from '@/types'

type ViewMode = 'list' | 'product-form' | 'category-form'
type DisplayMode = 'table' | 'cards'
type ActiveTab = 'products' | 'categories'

export function AdminMenuManagement() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [displayMode, setDisplayMode] = useState<DisplayMode>('table')
  const [activeTab, setActiveTab] = useState<ActiveTab>('products')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [debouncedCategorySearch, setDebouncedCategorySearch] = useState('')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [showCreateProductForm, setShowCreateProductForm] = useState(false)
  const [showCreateCategoryForm, setShowCreateCategoryForm] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  const queryClient = useQueryClient()

  // Pagination hooks
  const productsPagination = usePagination({ 
    initialPage: 1, 
    initialPageSize: 10,
    total: 0 
  })
  
  const categoriesPagination = usePagination({ 
    initialPage: 1, 
    initialPageSize: 10,
    total: 0 
  })

  // Debounce product search
  useEffect(() => {
    if (searchTerm !== debouncedSearch) {
      setIsSearching(true)
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      productsPagination.goToFirstPage()
      setIsSearching(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm, debouncedSearch])

  // Debounce category search
  useEffect(() => {
    if (categorySearch !== debouncedCategorySearch) {
      setIsSearching(true)
    }
    const timer = setTimeout(() => {
      setDebouncedCategorySearch(categorySearch)
      categoriesPagination.goToFirstPage()
      setIsSearching(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [categorySearch, debouncedCategorySearch])

  // Fetch products with pagination
  const { data: productsData, isLoading: isLoadingProducts, isFetching: isFetchingProducts } = useQuery({
    queryKey: ['admin-products', productsPagination.page, productsPagination.pageSize, debouncedSearch],
    queryFn: () => apiClient.getAdminProducts({
      page: productsPagination.page,
      per_page: productsPagination.pageSize,
      search: debouncedSearch || undefined
    }).then((res: any) => res.data)
  })

  // Fetch categories with pagination
  const { data: categoriesData, isLoading: isLoadingCategories, isFetching: isFetchingCategories } = useQuery({
    queryKey: ['admin-categories', categoriesPagination.page, categoriesPagination.pageSize, debouncedCategorySearch],
    queryFn: () => apiClient.getAdminCategories({
      page: categoriesPagination.page,
      per_page: categoriesPagination.pageSize,
      search: debouncedCategorySearch || undefined
    }).then((res: any) => res.data)
  })

  // Extract data and pagination info
  const products = Array.isArray(productsData) ? productsData : (productsData as any)?.data || []
  const productsPaginationInfo = (productsData as any)?.pagination || { total: 0 }

  const categories = Array.isArray(categoriesData) ? categoriesData : (categoriesData as any)?.data || []
  const categoriesPaginationInfo = (categoriesData as any)?.pagination || { total: 0 }

  // Delete product mutation
  const deleteProductMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      // The cashier and waiter menus read ['products'] — refresh those too, or a
      // deleted item stays orderable on their screens.
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toastHelpers.apiSuccess('الحذف', 'المنتج')
    },
    onError: (error: any) => {
      toastHelpers.apiError('الحذف', error, 'المنتج')
    }
  })

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toastHelpers.apiSuccess('الحذف', 'الصنف')
    },
    onError: (error: any) => {
      toastHelpers.apiError('الحذف', error, 'الصنف')
    }
  })

  const handleFormSuccess = () => {
    setShowCreateProductForm(false)
    setShowCreateCategoryForm(false)
    setEditingProduct(null)
    setEditingCategory(null)
    setViewMode('list')
  }

  const handleCancelForm = () => {
    setShowCreateProductForm(false)
    setShowCreateCategoryForm(false)
    setEditingProduct(null)
    setEditingCategory(null)
    setViewMode('list')
  }

  const handleDeleteProduct = (product: Product) => {
    if (confirm(`هل أنت متأكد من حذف "${product.name}"؟`)) {
      deleteProductMutation.mutate(product.id.toString())
    }
  }

  const handleDeleteCategory = (category: Category) => {
    if (confirm(`هل أنت متأكد من حذف "${category.name}"؟`)) {
      deleteCategoryMutation.mutate(category.id.toString())
    }
  }

  // Show form if creating or editing
  if (showCreateProductForm || editingProduct) {
    return (
      <div className="p-6">
        <ProductForm
          product={editingProduct || undefined}
          mode={editingProduct ? 'edit' : 'create'}
          onSuccess={handleFormSuccess}
          onCancel={handleCancelForm}
        />
      </div>
    )
  }

  if (showCreateCategoryForm || editingCategory) {
    return (
      <div className="p-6">
        <CategoryForm
          category={editingCategory || undefined}
          mode={editingCategory ? 'edit' : 'create'}
          onSuccess={handleFormSuccess}
          onCancel={handleCancelForm}
        />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">إدارة المنيو</h2>
          <p className="text-muted-foreground">
            إدارة منتجات وأصناف مطعمك
          </p>
        </div>
        <div className="flex items-center space-x-4">
          {/* View Toggle */}
          <div className="flex items-center bg-muted rounded-lg p-1">
            <Button
              variant={displayMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setDisplayMode('table')}
              className="px-3"
            >
              <Table className="h-4 w-4 ml-1" />
              جدول
            </Button>
            <Button
              variant={displayMode === 'cards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setDisplayMode('cards')}
              className="px-3"
            >
              <Grid3X3 className="h-4 w-4 ml-1" />
              بطاقات
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)} className="w-full">
        <div className="flex items-center justify-between">
          <TabsList className="grid w-[400px] grid-cols-2">
            <TabsTrigger value="products" className="gap-2">
              <Package className="h-4 w-4" />
              المنتجات ({products.length || 0})
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-2">
              <Tag className="h-4 w-4" />
              الأصناف ({categories.length || 0})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-6">
          {/* Search and Add Product */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1">
                  <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="ابحث عن المنتجات بالاسم أو الصنف أو الوصف..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-8"
                  />
                  {isSearching && activeTab === 'products' && (
                    <div className="absolute left-2 top-2.5">
                      <InlineLoading size="sm" />
                    </div>
                  )}
                </div>
                <Button onClick={() => setShowCreateProductForm(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  إضافة منتج
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Products List */}
          <div className="space-y-4">
            {displayMode === 'table' ? (
              <AdminMenuTable
                data={products}
                categories={categories}
                onEdit={setEditingProduct}
                onDelete={handleDeleteProduct}
                isLoading={isLoadingProducts}
              />
            ) : isLoadingProducts ? (
              <ProductListSkeleton />
            ) : products.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <Package className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">لا توجد منتجات</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {searchTerm ? 'لا توجد منتجات تطابق بحثك.' : 'ابدأ بإضافة أول منتج لك.'}
                    </p>
                    {!searchTerm && (
                      <div className="mt-6">
                        <Button onClick={() => setShowCreateProductForm(true)} className="gap-2">
                          <Plus className="h-4 w-4" />
                          إضافة منتج
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {products.map((product: Product) => (
                  <Card key={product.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3 flex-1">
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
                          <div className="min-w-0 flex-1">
                            <h3 className="font-medium text-gray-900 truncate">{product.name}</h3>
                            <p className="text-sm text-gray-500 line-clamp-2">
                              {product.description || "لا يوجد وصف"}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-green-600">
                                <Banknote className="w-3 h-3 ml-1" />
                                {product.price}
                              </Badge>
                              <Badge variant="outline" className="text-blue-600">
                                <Clock className="w-3 h-3 ml-1" />
                                {product.preparation_time}دقيقة
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col space-y-1 ml-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingProduct(product)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteProduct(product)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:border-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Products Pagination */}
            {products.length > 0 && (
              <div className="mt-6 space-y-4">
                {isFetchingProducts && !isLoadingProducts && (
                  <div className="flex justify-center">
                    <InlineLoading text="جاري تحديث المنتجات..." />
                  </div>
                )}
                <PaginationControlsComponent
                  pagination={productsPagination}
                  total={productsPaginationInfo.total || products.length}
                />
              </div>
            )}
          </div>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-6">
          {/* Search and Add Category */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1">
                  <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="ابحث عن الأصناف بالاسم أو الوصف..."
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    className="pr-8"
                  />
                  {isSearching && activeTab === 'categories' && (
                    <div className="absolute left-2 top-2.5">
                      <InlineLoading size="sm" />
                    </div>
                  )}
                </div>
                <Button onClick={() => setShowCreateCategoryForm(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  إضافة صنف
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Categories List */}
          <div className="space-y-4">
            {displayMode === 'table' ? (
              <AdminCategoriesTable
                data={categories}
                onEdit={setEditingCategory}
                onDelete={handleDeleteCategory}
                isLoading={isLoadingCategories}
              />
            ) : isLoadingCategories ? (
              <CategoryListSkeleton />
            ) : categories.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <Tag className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">لا توجد أصناف</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {categorySearch ? 'لا توجد أصناف تطابق بحثك.' : 'ابدأ بإضافة أول صنف لك.'}
                    </p>
                    {!categorySearch && (
                      <div className="mt-6">
                        <Button onClick={() => setShowCreateCategoryForm(true)} className="gap-2">
                          <Plus className="h-4 w-4" />
                          إضافة صنف
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {categories.map((category: Category) => (
                  <Card key={category.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <div 
                          className="mx-auto h-16 w-16 rounded-lg flex items-center justify-center mb-4"
                          style={{ 
                            backgroundColor: category.color || '#6B7280',
                            color: 'white'
                          }}
                        >
                          <Tag className="h-8 w-8" />
                        </div>
                        <h3 className="font-medium text-gray-900 mb-2">{category.name}</h3>
                        <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                          {category.description || "لا يوجد وصف"}
                        </p>
                        <div className="flex justify-center space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingCategory(category)}
                            className="gap-1"
                          >
                            <Edit className="h-4 w-4" />
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteCategory(category)}
                            className="gap-1 text-red-600 hover:text-red-700 hover:border-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                            حذف
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Categories Pagination */}
            {categories.length > 0 && (
              <div className="mt-6 space-y-4">
                {isFetchingCategories && !isLoadingCategories && (
                  <div className="flex justify-center">
                    <InlineLoading text="جاري تحديث الأصناف..." />
                  </div>
                )}
                <PaginationControlsComponent
                  pagination={categoriesPagination}
                  total={categoriesPaginationInfo.total || categories.length}
                />
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}