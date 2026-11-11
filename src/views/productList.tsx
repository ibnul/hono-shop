import type { Product } from '../generated/prisma/client.js'
import { WishlistButton } from './wishlistButton.js'

type CatalogCard = Pick<Product, 'id' | 'name' | 'description' | 'price'>

export const ProductList = ({ products, savedIds }: { products: CatalogCard[]; savedIds?: Set<string> }) => (
  <>
    <div class="product-grid">
      {products.map((product, index) => {
        const formId = `buy-product-${index}`
        const productId = encodeURIComponent(product.id)
        return (
          <article class="card product-card" key={product.id}>
            <h2>{product.name}</h2>
            <p class="product-description">{product.description}</p>
            <form method="post" action={`/buy/${productId}`} id={formId} class="product-price-row">
              <strong class="price">${(product.price / 100).toFixed(2)}</strong>
              <label class="product-quantity">
                Qty <input type="number" name="quantity" value="1" min="1" max="10" aria-label={`Quantity for ${product.name}`} required />
              </label>
            </form>
            <div class="product-actions">
              <button type="submit" form={formId} class="btn">Buy Now</button>
              <button type="submit" form={formId} formaction={`/cart/items/${productId}`} name="action" value="add" data-add-cart class="account-secondary">Add to cart</button>
              {savedIds && <WishlistButton productId={product.id} saved={savedIds.has(product.id)} returnTo="shop" />}
            </div>
            <p class="product-feedback" role="status" data-product-feedback></p>
          </article>
        )
      })}
    </div>
    <script src="/public/shop-actions.js" defer />
  </>
)
