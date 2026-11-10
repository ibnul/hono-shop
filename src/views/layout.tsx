import type { Child } from 'hono/jsx'
import { raw } from 'hono/html'

export type AccountNav = 'guest' | 'customer'

type LayoutProps = {
    title: string
    stylesheet?: string
    accountNav?: AccountNav
    cartCount?: number
    children: Child
}

export const Layout = ({ title, stylesheet, accountNav, cartCount, children }: LayoutProps) => (
    <>
    {raw('<!doctype html>')}
    <html lang="en">
        <head>
            <meta charset="utf-8" />
            <meta name="viewport" content='width=device-width, initial-scale=1' />
            <title>{title}</title>
            <link rel='stylesheet' href='/public/styles.css' />
            {stylesheet && <link rel='stylesheet' href={stylesheet} />}
        </head>
        <body>
            <header class="site-header">
                <a href='/' class="logo">Hono Shop</a>
                {(accountNav || cartCount !== undefined) && (
                    <nav class="site-links" aria-label="Shop">
                        {cartCount !== undefined && <a href="/cart">Cart <span data-cart-count>{cartCount}</span></a>}
                        {accountNav === 'customer' && <a href="/account">My account</a>}
                        {accountNav === 'guest' && (
                            <>
                                <a class="account-secondary" href="/account/sign-in">Log in</a>
                                <a class="btn" href="/account/register">Register</a>
                            </>
                        )}
                    </nav>
                )}
            </header>

            <main class="container">
                 {children}
            </main>
        </body>
    </html>

    </>
)
