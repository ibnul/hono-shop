import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { prisma } from '../lib/prisma.js'

const app = new Hono()

const productFields = {
  id: true,
  name: true,
  description: true,
  price: true,
  category: true,
} as const

app.get('/', async (c) => {
  const category = c.req.query('category')
  const products = await prisma.product.findMany({
    where: { active: true, ...(category ? { category } : {}) },
    select: productFields,
    orderBy: { id: 'asc' },
  })

  return c.json(products)
})

app.get('/:id', async (c) => {
  const product = await prisma.product.findUnique({
    where: { id: c.req.param('id'), active: true },
    select: productFields,
  })

  if (!product) {
    throw new HTTPException(404, { message: 'Product not found' })
  }

  return c.json(product)
})

export default app