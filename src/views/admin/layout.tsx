import type { Child } from 'hono/jsx'
import { Layout } from '../layout.js'

const links = [
  { page: 'products', label: 'Products', href: '/admin/products' },
  { page: 'orders', label: 'Orders', href: '/admin/orders' },
  { page: 'refunds', label: 'Refund requests', href: '/admin/refund-requests' },
] as const

type AdminLayoutProps = {
  page: (typeof links)[number]['page']
  title: string
  children: Child
}

export const AdminLayout = ({ page, title, children }: AdminLayoutProps) => (
  <Layout title={title} stylesheet="/public/admin.css">
    <nav aria-label="Shop admin" class="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {links.map((link) => (
        <a
          key={link.page}
          href={link.href}
          aria-current={page === link.page ? 'page' : undefined}
          class={`rounded-lg px-3 py-2 text-sm font-semibold no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${page === link.page ? 'bg-orange-100 text-orange-900' : 'text-slate-700 hover:bg-slate-100'}`}
        >
          {link.label}
        </a>
      ))}
    </nav>
    {children}
  </Layout>
)
