import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PurchaseHistoryPage } from "@/pages/purchase-history-page"
import { createBusinessValue, testBusiness, TestBusinessProvider } from "@/test/auth-test-utils"

const mock=vi.hoisted(()=>({data:[] as Array<{id:string;purchaseReference:string;receivedAt:string;supplierName:string|null;subtotal:string;total:string;notes:string|null;itemCount:number;items:Array<{productName:string;productSku:string|null}>}>}))
vi.mock("@/features/purchasing/purchasing-queries",()=>({usePurchaseHistory:()=>({data:mock.data,isLoading:false,isError:false,refetch:vi.fn()})}))
describe("purchase history",()=>{beforeEach(()=>{mock.data=[{id:"purchase-id",purchaseReference:"PUR-000009",receivedAt:"2026-06-02T10:30:00Z",supplierName:"Original supplier",subtotal:"999999999999999.9900",total:"999999999999999.9900",notes:null,itemCount:1,items:[{productName:"Original product",productSku:"OLD-SKU"}]}]});it("shows snapshots, safe totals, and detail navigation",()=>{render(<TestBusinessProvider value={createBusinessValue({business:testBusiness,enabledModules:["purchasing"]})}><MemoryRouter><PurchaseHistoryPage/></MemoryRouter></TestBusinessProvider>);expect(screen.getAllByText("PUR-000009")).toHaveLength(2);expect(screen.getByText("Original supplier")).toBeInTheDocument();expect(screen.getByText("Team member")).toBeInTheDocument();expect(screen.getAllByRole("link",{name:/view purchase/i})[0]).toHaveAttribute("href","/purchasing/purchase-id");expect(screen.getAllByText(/999,999,999,999,999/).length).toBeGreaterThan(0)})})
