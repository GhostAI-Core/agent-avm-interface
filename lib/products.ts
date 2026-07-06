import type { Product, ProductScriptVersion } from '@/types'

/** Products (script + consent-flow) available for a company, via the `/api/products` proxy. */
export async function fetchProductsForCompany(companyId: number | ''): Promise<Product[]> {
  if (!companyId) return []
  try {
    const r = await fetch(`/api/products?company_id=${companyId}`)
    const j = await r.json().catch(() => ({}))
    return r.ok ? (j.products ?? []) : []
  } catch {
    return []
  }
}

/** A product's current script version, so picking a product can pre-fill a script editor. */
export async function fetchCurrentVersion(productId: number | ''): Promise<ProductScriptVersion | null> {
  if (!productId) return null
  try {
    const [pRes, vRes] = await Promise.all([
      fetch(`/api/products/${productId}`),
      fetch(`/api/products/${productId}/versions`),
    ])
    const pJson = await pRes.json().catch(() => ({}))
    const vJson = await vRes.json().catch(() => ({}))
    const currentVersionId = pJson?.product?.current_version_id
    const versions: ProductScriptVersion[] = vJson?.versions ?? []
    if (!currentVersionId) return null
    return versions.find(v => v.id === currentVersionId) ?? null
  } catch {
    return null
  }
}
