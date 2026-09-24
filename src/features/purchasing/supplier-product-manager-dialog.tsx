import { useState } from "react"

import { DialogShell } from "@/components/ui/dialog-shell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useInventoryProducts } from "@/features/inventory/inventory-queries"
import { useSupplierProductMutations, useSupplierProducts, usePurchasingSuppliers } from "@/features/purchasing/purchasing-queries"

interface Props {
  supplierId?: string
  supplierName?: string
  productId?: string
  productName?: string
  onClose: () => void
}

export function SupplierProductManagerDialog({ supplierId, supplierName, productId, productName, onClose }: Props) {
  const links = useSupplierProducts()
  const products = useInventoryProducts()
  const suppliers = usePurchasingSuppliers()
  const mutations = useSupplierProductMutations()
  const [search, setSearch] = useState("")
  const isSupplierSide = Boolean(supplierId)
  const scopedLinks = (links.data ?? []).filter((link) => isSupplierSide ? link.supplierId === supplierId : link.productId === productId)
  const existingIds = new Set(scopedLinks.map((link) => isSupplierSide ? link.productId : link.supplierId))
  const source = isSupplierSide ? (products.data ?? []).map((p) => ({ id: p.id, name: p.name, detail: p.sku })) : (suppliers.data ?? []).map((s) => ({ id: s.id, name: s.name, detail: s.email }))
  const term = search.trim().toLocaleLowerCase()
  const options = source.filter((item) => !existingIds.has(item.id) && (!term || item.name.toLocaleLowerCase().includes(term)))
  const pending = mutations.link.isPending || mutations.prefer.isPending || mutations.unlink.isPending

  const add = async (id: string) => {
    if (isSupplierSide && supplierId) await mutations.link.mutateAsync({ supplierId, productId: id })
    else if (productId) await mutations.link.mutateAsync({ supplierId: id, productId })
  }
  const title = isSupplierSide ? `Products supplied by ${supplierName}` : `Suppliers for ${productName}`

  return <DialogShell description="Keep the current supplier list simple. Purchases can still use any active product and supplier." onClose={onClose} title={title} wide>
    <div className="space-y-5">
      <section aria-labelledby="current-supplier-products" className="space-y-2">
        <h3 className="font-medium" id="current-supplier-products">{isSupplierSide ? "Products supplied" : "Suppliers"}</h3>
        {!scopedLinks.length && <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{isSupplierSide ? "No products linked yet." : "No suppliers linked yet."}</p>}
        {scopedLinks.map((link) => <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3" key={link.id}><div className="min-w-0"><p className="break-words font-medium">{isSupplierSide ? link.productName : link.supplierName}</p>{isSupplierSide && link.productSku && <p className="text-xs text-muted-foreground">SKU {link.productSku}</p>}</div><div className="flex shrink-0 items-center gap-2">{link.isPreferred && <Badge variant="success">Preferred</Badge>}{!pending && <>{!link.isPreferred && <Button onClick={() => void mutations.prefer.mutateAsync({ id: link.id, productId: link.productId })} size="sm" variant="outline">Set preferred</Button>}<Button onClick={() => void mutations.unlink.mutateAsync(link.id)} size="sm" variant="outline">Unlink</Button></>}</div></div>)}
      </section>
      <section className="space-y-3 border-t border-border pt-5">
        <h3 className="font-medium">{isSupplierSide ? "Add products" : "Add suppliers"}</h3>
        <input aria-label={isSupplierSide ? "Search products" : "Search suppliers"} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder={isSupplierSide ? "Search products…" : "Search suppliers…"} value={search} />
        <div className="max-h-56 space-y-2 overflow-y-auto">{options.map((option) => <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3" key={option.id}><div className="min-w-0"><p className="break-words text-sm font-medium">{option.name}</p>{option.detail && <p className="text-xs text-muted-foreground">{option.detail}</p>}</div><Button disabled={pending} onClick={() => void add(option.id)} size="sm">Link</Button></div>)}{!options.length && <p className="text-sm text-muted-foreground">{search ? "No matches." : "Everything available is already linked."}</p>}</div>
      </section>
    </div>
  </DialogShell>
}

export function ProductSupplierSummary({ productId, onManage }: { productId: string; onManage: () => void }) {
  const links = useSupplierProducts()
  const current = (links.data ?? []).filter((link) => link.productId === productId)
  return <div className="mt-4 rounded-md border border-border bg-muted/20 p-3"><div className="flex items-center justify-between gap-3"><h3 className="font-medium">Suppliers</h3><Button onClick={onManage} size="sm" variant="outline">Manage suppliers</Button></div>{links.isLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading suppliers…</p> : current.length ? <ul className="mt-2 space-y-1 text-sm">{current.map((link) => <li className="flex items-center gap-2" key={link.id}>{link.supplierName}{link.isPreferred && <Badge variant="success">Preferred</Badge>}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No suppliers linked yet.</p>}</div>
}
