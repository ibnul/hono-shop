import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { env } from '../env.js'
import { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { validate } from '../lib/validate.js'
import { AdminProducts, EditProduct } from '../views/admin/products.js'

const path = '/admin/products'
const app = new Hono()

const productDetails = z.object({
  name: z.string().trim().min(1).max(191),
  description: z.string().trim().min(1).max(2000),
  category: z.string().trim().min(1).max(80),
  price: z.string().trim().regex(/^\d{1,5}(?:\.\d{1,2})?$/)
    .transform((value) => {
      const [dollars, cents = ''] = value.split('.')
      return Number(dollars) * 100 + Number(cents.padEnd(2, '0'))
    })
    .pipe(z.number().int().positive()),
})

const productForm = productDetails.extend({
  id: z.string().trim().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})

const editProductForm = productDetails.extend({
  active: z.enum(['true', 'false']).transform((value) => value === 'true'),
})

app.use('*', csrf({ origin: new URL(env.APP_URL).origin }))

app.get('/', async (c) => {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, category: true, price: true, active: true },
    orderBy: { createdAt: 'desc' },
  })

  return c.html(<AdminProducts products={products} path={path} />)
})

app.post('/', validate('form', productForm), async (c) => {
  try {
    await prisma.product.create({ data: c.req.valid('form') })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HTTPException(409, { message: 'That product ID already exists' })
    }
    throw error
  }

  return c.redirect(path, 303)
})

app.get('/:id/edit', async (c) => {
  const product = await prisma.product.findUnique({ where: { id: c.req.param('id') } })
  if (!product) {
    throw new HTTPException(404, { message: 'Product not found' })
  }

  return c.html(<EditProduct product={product} path={path} />)
})

app.post('/:id/edit', validate('form', editProductForm), async (c) => {
  try {
    await prisma.product.update({
      where: { id: c.req.param('id') },
      data: c.req.valid('form'),
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new HTTPException(404, { message: 'Product not found' })
    }
    throw error
  }

  return c.redirect(path, 303)
})

export default app
