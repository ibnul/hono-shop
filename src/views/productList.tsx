
import type { Product } from '../generated/prisma/client.js'

type CatalogCard = Pick<Product, 'id' | 'name' | 'description' | 'price'>

export const ProductList = ({ products } : { products: CatalogCard[] }) =>(
    <div class="grid">
        {products.map((product) => 
            <article class="card">
                <h2>{product.name}</h2>
                <p>{product.description}</p>
                <p class="price">${(product.price / 100).toFixed(2)}</p>
                <form method="post" action={`/buy/${product.id}`}>
                    <input type="number" name="quantity" value="1" min="1" max="10" />
                    <button type="submit" class="btn">Buy Now</button>
                </form>
            </article>
        )}
    </div>

)
