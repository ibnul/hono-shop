import type { Product } from '../../generated/prisma/client.js'
import { AdminLayout } from './layout.js'

type CatalogProduct = Pick<Product, 'id' | 'name' | 'category' | 'price' | 'active'>
type EditableProduct = CatalogProduct & Pick<Product, 'description'>

const editPath = (path: string, id: string) => `${path}/${encodeURIComponent(id)}/edit`

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600'
const label = 'block text-sm font-medium text-slate-800'

const ProductForm = ({ action, product }: { action: string; product?: EditableProduct }) => (
  <form method="post" action={action} class="grid gap-4 sm:grid-cols-2">
    <label class={label}>
      Name
      <input name="name" value={product?.name} class={`mt-1 ${field}`} placeholder="Desk Notebook" maxlength={191} required />
    </label>
    {product ? (
      <label class={label}>
        Product ID
        <input class={`mt-1 ${field} read-only:bg-slate-50`} value={product.id} readonly />
      </label>
    ) : (
      <label class={label}>
        Product ID
        <input name="id" class={`mt-1 ${field}`} placeholder="desk-notebook" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxlength={80} required aria-describedby="product-id-hint" />
        <span id="product-id-hint" class="mt-1 block text-xs font-normal text-slate-600">Use lowercase letters, numbers, and hyphens.</span>
      </label>
    )}
    <label class={label}>
      Category
      <input name="category" value={product?.category} class={`mt-1 ${field}`} placeholder="Stationery" maxlength={80} required />
    </label>
    <label class={label}>
      Price (USD)
      <input name="price" value={product && (product.price / 100).toFixed(2)} class={`mt-1 ${field}`} inputmode="decimal" placeholder="9.50" maxlength={8} required />
    </label>
    <label class={`${label} sm:col-span-2`}>
      Description
      <textarea name="description" class={`mt-1 ${field}`} rows={3} maxlength={2000} required>{product?.description}</textarea>
    </label>
    {product && (
      <label class={label}>
        Storefront visibility
        <select name="active" class={`mt-1 ${field}`} aria-describedby="visibility-hint">
          <option value="true" selected={product.active}>Visible</option>
          <option value="false" selected={!product.active}>Hidden</option>
        </select>
        <span id="visibility-hint" class="mt-1 block text-xs font-normal text-slate-600">Hidden products stay in the admin catalog and can be shown again.</span>
      </label>
    )}
    <div class="sm:col-span-2">
      <button type="submit" class="w-full cursor-pointer rounded-lg border-0 bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 sm:w-auto">{product ? 'Save changes' : 'Add product'}</button>
    </div>
  </form>
)

export const EditProduct = ({ product, path }: { product: EditableProduct; path: string }) => (
  <AdminLayout page="products" title="Edit product">
    <header class="mb-6">
      <h1 class="mt-1 mb-2 text-3xl font-bold tracking-tight text-slate-950">Edit product</h1>
      <a href={path} class="text-sm font-medium text-slate-700 underline">Back to products</a>
    </header>
    <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <ProductForm action={editPath(path, product.id)} product={product} />
    </section>
  </AdminLayout>
)

export const AdminProducts = ({ products, path }: { products: CatalogProduct[]; path: string }) => (
  <AdminLayout page="products" title="Manage products">
    <header class="mb-6">
      <h1 class="mt-1 mb-2 text-3xl font-bold tracking-tight text-slate-950">Products</h1>
      <p class="m-0 text-sm text-slate-600">Manage products and choose what’s visible in your storefront.</p>
    </header>

    <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="add-product">
      <h2 id="add-product" class="m-0 text-lg font-semibold text-slate-950">Add a product</h2>
      <p class="mt-1 mb-5 text-sm text-slate-600">New products appear on the storefront as soon as you add them.</p>

      <ProductForm action={path} />
    </section>

    <section class="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="px-5 py-4 sm:px-6">
        <h2 id="catalog-heading" class="m-0 text-lg font-semibold text-slate-950">Catalog</h2>
        <p class="mt-1 mb-0 text-sm text-slate-600">{products.length} {products.length === 1 ? 'product' : 'products'}</p>
      </div>
      {products.length === 0 ? (
        <p class="m-0 border-t border-slate-200 px-5 py-6 text-sm text-slate-600 sm:px-6">No products yet. Use the form above to add your first one.</p>
      ) : (
        <div class="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-600" role="region" aria-labelledby="catalog-heading" tabindex={0}>
          <table class="w-full min-w-md border-collapse text-left text-sm">
            <thead class="border-y border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" class="px-5 py-3 sm:px-6">Product</th>
                <th scope="col" class="px-4 py-3">Category</th>
                <th scope="col" class="px-4 py-3 text-right">Price</th>
                <th scope="col" class="px-5 py-3 sm:px-6">Status</th>
                <th scope="col" class="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              {products.map((product) => (
                <tr key={product.id}>
                  <th scope="row" class="px-5 py-3 text-left font-semibold text-slate-900 sm:px-6">
                    {product.name}
                    <span class="block text-xs font-normal text-slate-600">{product.id}</span>
                  </th>
                  <td class="px-4 py-3 text-slate-700">{product.category}</td>
                  <td class="px-4 py-3 text-right whitespace-nowrap text-slate-900 tabular-nums">${(product.price / 100).toFixed(2)}</td>
                  <td class="px-5 py-3 sm:px-6">
                    <span class={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${product.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                      {product.active ? 'Visible' : 'Hidden'}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    <a href={editPath(path, product.id)} aria-label={`Edit ${product.name}`} class="text-sm font-medium text-orange-800 underline">Edit</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </AdminLayout>
)
