import type { Order } from '../store/orders.js'

export const OrderItems = ({ items }: { items?: Order['items'] }) => items?.length ? (
  <ul aria-label="Order items" class="order-item-list">
    {items.map((item) => (
      <li key={item.productId}>{item.productName} × {item.quantity} · ${(item.unitPrice * item.quantity / 100).toFixed(2)}</li>
    ))}
  </ul>
) : null
