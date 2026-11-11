import { WishlistButton } from '../wishlistButton.js'
import { CustomerLayout } from './layout.js'

export const Wishlist = ({ items }: {
  items: { product: { id: string; name: string; price: number; active: boolean } }[]
}) => (
  <CustomerLayout title="Wishlist" tab="wishlist">
    <section class="card">
      <h1>Wishlist</h1>
      {items.length === 0 ? <p>Save products from the <a href="/">shop</a> to find them here.</p> : (
        <ul class="account-items">
          {items.map(({ product }) => (
            <li key={product.id}>
              <strong>{product.name}</strong>
              <p>{product.active ? `$${(product.price / 100).toFixed(2)}` : 'Currently unavailable'}</p>
              {product.active && (
                <form method="post" action={`/buy/${encodeURIComponent(product.id)}`}>
                  <input type="hidden" name="quantity" value="1" />
                  <button type="submit" class="btn">Buy now</button>
                </form>
              )}
              <WishlistButton productId={product.id} saved returnTo="wishlist" />
            </li>
          ))}
        </ul>
      )}
    </section>
  </CustomerLayout>
)
