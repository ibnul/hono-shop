import type { Child } from 'hono/jsx'
import { Layout } from '../layout.js'

const tabs = [
  { id: 'home', label: 'Account home', href: '/account' },
  { id: 'orders', label: 'Purchase history', href: '/account/orders' },
  { id: 'wishlist', label: 'Wishlist', href: '/account/wishlist' },
] as const

export const CustomerLayout = ({ title, tab, children }: {
  title: string
  tab: typeof tabs[number]['id']
  children: Child
}) => (
  <Layout title={title} accountNav="customer">
    <div class="customer-layout" data-customer-layout>
      <aside class="customer-sidebar">
        <nav class="customer-tabs" aria-label="My account">
          {tabs.map(({ id, label, href }) => (
            <a key={id} href={href} data-customer-link data-customer-tab={id} aria-current={id === tab ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <form method="post" action="/account/sign-out">
          <button type="submit">Sign out</button>
        </form>
      </aside>
      <div class="customer-panel" data-customer-panel={tab}>{children}</div>
    </div>
    <script src="/public/customer-navigation.js" defer></script>
  </Layout>
)
