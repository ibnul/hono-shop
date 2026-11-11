import { Hono } from 'hono'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { validate } from '../lib/validate.js'
import { AdminCustomers } from '../views/admin/customers.js'

const app = new Hono()
const pageSize = 25
const query = z.object({ page: z.coerce.number().int().min(1).max(100_000).default(1) })

app.get('/', validate('query', query), async (c) => {
  const { page } = c.req.valid('query')
  const customers = await prisma.user.findMany({
    select: { id: true, name: true, email: true, createdAt: true, _count: { select: { orders: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
  })
  return c.html(
    <AdminCustomers customers={customers.slice(0, pageSize)} page={page} hasNext={customers.length > pageSize} />,
  )
})

export default app
