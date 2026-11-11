import type { User } from '../../generated/prisma/client.js'
import { AdminLayout } from './layout.js'

type Customer = Pick<User, 'id' | 'name' | 'email' | 'createdAt'> & { _count: { orders: number } }
const joinedDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })

export const AdminCustomers = ({ customers, page, hasNext }: {
  customers: Customer[]
  page: number
  hasNext: boolean
}) => (
  <AdminLayout page="customers" title="Customers">
    <h1 class="mt-1 mb-2 text-3xl font-bold text-slate-950">Customers</h1>
    <p class="mb-6 text-sm text-slate-600">Registered customer accounts, newest first.</p>
    <section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {customers.length === 0 ? (
        <p class="px-5 py-6 text-sm text-slate-600">There are no customers on this page.</p>
      ) : (
        <div class="overflow-x-auto" role="region" aria-label="Customers" tabindex={0}>
          <table class="w-full min-w-xl border-collapse text-left text-sm">
            <thead class="border-y border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" class="px-5 py-3">Customer</th>
                <th scope="col" class="px-4 py-3">Joined (UTC)</th>
                <th scope="col" class="px-4 py-3 text-right">Orders</th>
                <th scope="col" class="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <th scope="row" class="px-5 py-3 font-semibold text-slate-900">
                    {customer.name}
                    <span class="block text-xs font-normal text-slate-600">{customer.email}</span>
                  </th>
                  <td class="px-4 py-3 text-slate-700">
                    <time datetime={customer.createdAt.toISOString()}>{joinedDate.format(customer.createdAt)}</time>
                  </td>
                  <td class="px-4 py-3 text-right tabular-nums">{customer._count.orders}</td>
                  <td class="px-5 py-3">
                    <a href={'/admin/orders?' + new URLSearchParams({ customer: customer.id })} class="font-medium text-orange-800 underline">View orders</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label="Customer pages" class="flex items-center justify-between gap-4 border-t border-slate-200 px-5 py-4 text-sm">
        <span>Page {page}</span>
        <div class="flex gap-4">
          {page > 1 && <a href={`/admin/customers?page=${page - 1}`} class="text-orange-800 underline">Previous</a>}
          {hasNext && <a href={`/admin/customers?page=${page + 1}`} class="text-orange-800 underline">Next</a>}
        </div>
      </nav>
    </section>
  </AdminLayout>
)
