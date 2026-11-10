```
npm install
npm run dev
```

```
open http://localhost:3000
```

## CloudPanel demo over HTTPS

Use Node.js 24 and a dedicated MariaDB database for the demo. Run the app under the CloudPanel site user from a checkout outside the public document root. In CloudPanel, configure the Node.js App Port to match `PORT`, issue a certificate for the shop domain, and enable the HTTP-to-HTTPS redirect.

In the Vhost Editor, add these directives inside the existing location that proxies to `127.0.0.1:<app-port>`. Update an existing directive if it is already present.

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Hono-Client-IP $remote_addr;
client_max_body_size 9m;
```

These headers must be set by Nginx for every request it forwards to Node. The Node process listens only on IPv4 loopback in this mode. If another proxy or CDN sits in front of CloudPanel, configure Nginx to resolve client IPs from that provider's trusted addresses so sign-in limits apply per visitor. The body-size setting allows the existing 8 MiB refund evidence upload plus its form data.

Create a private `.env` in the checkout and restrict it with `chmod 600 .env`. Use two different random values from `openssl rand -hex 32` for the admin token and customer session secret. Set `PORT` to a free port, such as 3001.

```dotenv
APP_URL=https://hono.axonminds.com
PORT=3001
TRUST_LOCAL_HTTPS_PROXY=true
ENABLE_HTTPS_ADMIN=true
ADMIN_TOKEN=replace_with_random_admin_token
BETTER_AUTH_SECRET=replace_with_separate_random_secret

DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_NAME=hono_shop
DATABASE_USER=hono_shop_user
DATABASE_PASSWORD=replace_with_database_password
DATABASE_URL=mysql://hono_shop_user:replace_with_url_encoded_password@127.0.0.1:3306/hono_shop

STRIPE_SECRET_KEY=sk_test_replace_with_sandbox_key
STRIPE_WEBHOOK_SECRET=whsec_replace_with_endpoint_secret
```

`DATABASE_URL` is used by Prisma migrations. Its host, port, database, and credentials must match the separate runtime database settings. Set `ENABLE_HTTPS_ADMIN=false` to hide the admin pages. Customer accounts are available when the session secret is configured.

In the same Stripe sandbox as the API key, register `https://hono.axonminds.com/webhook` as a snapshot event endpoint. Use the signing secret for that endpoint and select `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `refund.created`, and `refund.updated`.

From the checkout directory, build the app, apply migrations, and start one process:

```sh
npm ci --include=dev
npm run build
npx prisma migrate deploy --config prisma7.config.ts
NODE_ENV=production pm2 start dist/index.js --name hono-shop
pm2 save
```

For a new demo database, run `npx tsx prisma/seed.ts` to add sample products. Verify the storefront over HTTPS and customer registration and sign-in at `/account`. Sign in at `/admin/login` with username `admin` and the configured `ADMIN_TOKEN`. Admin sessions last up to eight hours and are cleared when the app process restarts. Complete a Stripe sandbox checkout and verify the order changes to Paid after the webhook arrives.

[CloudPanel Node.js settings](https://www.cloudpanel.io/docs/v2/frontend-area/settings/) · [CloudPanel Vhost Editor](https://www.cloudpanel.io/docs/v2/frontend-area/vhost/) · [Stripe webhooks](https://docs.stripe.com/webhooks)
