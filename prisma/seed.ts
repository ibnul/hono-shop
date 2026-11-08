import { products } from '../src/data/products.js'
import { prisma } from '../src/lib/prisma.js'

try {
  const { count } = await prisma.product.createMany({
    data: products,
    skipDuplicates: true,
  })

  console.log(`Inserted ${count} sample product(s).`)
} finally {
  await prisma.$disconnect()
}