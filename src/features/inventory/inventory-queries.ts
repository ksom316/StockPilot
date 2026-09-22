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

export function useInventoryCatalog() {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  const categories = useQuery({
    queryKey: inventoryKeys.categories(businessId),
    queryFn: () => fetchCategories(businessId),
    enabled: Boolean(businessId),
  })
  const products = useQuery({
    queryKey: inventoryKeys.products(businessId),
    queryFn: () => fetchProducts(businessId),
    enabled: Boolean(businessId),
  })

  return { business, categories, products }
}

export function useInventoryMutations() {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  const queryClient = useQueryClient()
  const invalidateProducts = () => queryClient.invalidateQueries({ queryKey: inventoryKeys.products(businessId) })
  const invalidateCategories = async () => {
    await queryClient.invalidateQueries({ queryKey: inventoryKeys.categories(businessId) })
    await invalidateProducts()
  }

  return {
    createProduct: useMutation({ mutationFn: (input: ProductInput) => createProduct(businessId, input), onSuccess: invalidateProducts }),
    updateProduct: useMutation({ mutationFn: ({ id, input }: { id: string; input: ProductInput }) => updateProduct(id, input), onSuccess: invalidateProducts }),
    createCategory: useMutation({ mutationFn: (input: CategoryInput) => createCategory(businessId, input), onSuccess: invalidateCategories }),
    updateCategory: useMutation({ mutationFn: ({ id, input }: { id: string; input: CategoryInput }) => updateCategory(id, input), onSuccess: invalidateCategories }),
    recordMovement: useMutation({
      mutationFn: (input: StockMovementInput) => recordStockMovement(input),
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: inventoryKeys.products(businessId) }),
          queryClient.invalidateQueries({ queryKey: inventoryKeys.movements(businessId) }),
        ])
      },
    }),
  }
}
