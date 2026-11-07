import { Hono } from "hono";
import { products } from "../data/products.js";
import { HTTPException } from "hono/http-exception";

const app = new Hono


app.get('/', (c) => {
  const category = c.req.query('category')
  if(category){
    return c.json(products.filter((p) => p.category === category ))
  }
  return c.json(products)
})

app.get('/:id', (c) => {
  const id = c.req.param('id')
  const product = products.find((p) => p.id === id )

  if(!product){
    throw new HTTPException(404, {message: 'Product not found'})
  }

  return c.json(product)
})


export default app