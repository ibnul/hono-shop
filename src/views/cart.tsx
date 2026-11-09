import { maxCartQuantity } from '../lib/cart.js'
import { Layout } from './layout.js'

type CartRow = {
  id: string
  quantity: number
  product?: { name: string; price: number }
}

export const ShoppingCart = ({ rows, error, showAccount, checkoutAttempt }: {
  rows: CartRow[]
  error?: string
  showAccount: boolean
  checkoutAttempt: string
}) => {
  const count = rows.reduce((total, row) => total + row.quantity, 0)
  const unavailable = rows.some((row) => !row.product)
  const subtotal = rows.reduce((total, row) => total + (row.product?.price ?? 0) * row.quantity, 0)

  return (
    <Layout title="Shopping cart" showAccount={showAccount} cartCount={count}>
      <section class="card">
        <h1>Shopping cart</h1>
        {error && <p class="account-error" role="alert">{error}</p>}
        {rows.length === 0 ? <p>Your cart is empty.</p> : (
          <>
            <ul class="account-items">
              {rows.map(({ id, quantity, product }) => {
                const action = `/cart/items/${encodeURIComponent(id)}`
                return (
                  <li key={id} class="cart-row">
                    <div>
                      <strong>{product?.name ?? 'Unavailable item'}</strong>
                      <p>{product ? `$${(product.price / 100).toFixed(2)} each` : 'This item is excluded from the subtotal.'}</p>
                    </div>
                    <div class="cart-controls">
                      {product && (
                        <form method="post" action={action} class="cart-controls">
                          <input type="hidden" name="action" value="update" />
                          <label>
                            Qty{' '}
                            <input type="number" name="quantity" value={quantity} min={1} max={maxCartQuantity} aria-label={`Quantity for ${product.name}`} required />
                          </label>
                          <button type="submit" class="account-secondary">Update</button>
                        </form>
                      )}
                      <form method="post" action={action}>
                        <input type="hidden" name="action" value="remove" />
                        <button type="submit" class="account-secondary" aria-label={`Remove ${product?.name ?? 'unavailable item'}`}>Remove</button>
                      </form>
                    </div>
                    {product && <strong>${(product.price * quantity / 100).toFixed(2)}</strong>}
                  </li>
                )
              })}
            </ul>
            <p class="cart-subtotal"><strong>Subtotal</strong> <strong>${(subtotal / 100).toFixed(2)}</strong></p>
            {unavailable && <p>Remove unavailable items before checking out.</p>}
          </>
        )}
        <div class="cart-footer">
          <a href="/" class="account-secondary">Continue shopping</a>
          {rows.length > 0 && (
            <form method="post" action="/cart/checkout">
              <input type="hidden" name="attempt" value={checkoutAttempt} />
              <button type="submit" class="btn" disabled={unavailable}>Checkout</button>
            </form>
          )}
        </div>
      </section>
    </Layout>
  )
}
