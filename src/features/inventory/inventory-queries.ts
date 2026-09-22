import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useBusiness } from "@/features/business/business-context"
import {
  createCategory,
  createProduct,
  fetchCategories,
  fetchInventoryMovements,
  fetchProducts,
  recordStockMovement,
  updateCategory,
  updateProduct,
} from "@/features/inventory/inventory-service"
import type { CategoryInput, ProductInput, StockMovementInput } from "@/features/inventory/inventory-types"
import { analyticsKeys } from "@/features/analytics/analytics-queries"

export const inventoryKeys = {
  categories: (businessId: string) => ["inventory", businessId, "categories"] as const,
  products: (businessId: string) => ["inventory", businessId, "products"] as const,
  movements: (businessId: string) => ["inventory", businessId, "movements"] as const,
}

export function useInventoryMovements() {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  return useQuery({
    queryKey: inventoryKeys.movements(businessId),
    queryFn: () => fetchInventoryMovements(businessId),
    enabled: Boolean(businessId),
  })
}

export function useInventoryProducts() {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  const products = useQuery({
    queryKey: inventoryKeys.products(businessId),
    queryFn: () => fetchProducts(businessId),
    enabled: Boolean(businessId),
  })
  return products
}

export function useInventoryCatalog() {
  const { business } = useBusiness()
  const categories = useQuery({
    queryKey: inventoryKeys.categories(business?.id ?? ""),
    queryFn: () => fetchCategories(business?.id ?? ""),
    enabled: Boolean(business?.id),
  })
  const products = useInventoryProducts()

  return { business, categories, products }
}

export function useInventoryMutations() {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  const queryClient = useQueryClient()
  const invalidateProducts = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: inventoryKeys.products(businessId) }),
    queryClient.invalidateQueries({ queryKey: analyticsKeys.overviews(businessId) }),
  ])
  const invalidateCategories = () => queryClient.invalidateQueries({ queryKey: inventoryKeys.categories(businessId) })
  const invalidateCategoryName = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: inventoryKeys.categories(businessId) }),
    invalidateProducts(),
  ])

  return {
    createProduct: useMutation({ mutationFn: (input: ProductInput) => createProduct(businessId, input), onSuccess: invalidateProducts }),
    updateProduct: useMutation({ mutationFn: ({ id, input }: { id: string; input: ProductInput }) => updateProduct(id, input), onSuccess: invalidateProducts }),
    createCategory: useMutation({ mutationFn: (input: CategoryInput) => createCategory(businessId, input), onSuccess: invalidateCategories }),
    updateCategory: useMutation({ mutationFn: ({ id, input }: { id: string; input: CategoryInput }) => updateCategory(id, input), onSuccess: invalidateCategoryName }),
    recordMovement: useMutation({
      mutationFn: (input: StockMovementInput) => recordStockMovement(input),
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: inventoryKeys.products(businessId) }),
          queryClient.invalidateQueries({ queryKey: inventoryKeys.movements(businessId) }),
          queryClient.invalidateQueries({ queryKey: analyticsKeys.overviews(businessId) }),
        ])
      },
    }),
  }
}
