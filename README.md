# Peacejamal

A responsive botanical-goods storefront prototype built with React, TypeScript, and Vite.

## Run locally

Requirements: Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Vite prints the local URL after starting. To verify a production build:

```sh
npm run build
npm run preview
```

To run the storefront with the account API, configure the database and session environment first, then start both development servers:

```sh
cp .env.example .env
# Set POSTGRES_PASSWORD and make DATABASE_URL use the same value; generate SESSION_SECRET with: openssl rand -hex 32
docker compose up -d postgres
npm run db:generate
npm run db:push
npm run db:seed
npm run dev:all
```

The Vite app runs on port 5173 and proxies `/api` to the Express API on port 4000 by default. If you use a different frontend origin, set `WEB_ORIGIN` in `.env` to that exact origin.

Create your customer account at `/account`, then promote it to the first administrator from another terminal:

```sh
npm run db:promote-admin -- you@example.com
```

The protected admin workspace is at `/admin`.

Checkout remains disabled by default. Before enabling it, set `CHECKOUT_ENABLED=true`, provide `SHIPPING_FEE_BDT` and `COD_FEE_BDT`, choose `TAX_MODE` (`NONE`, `INCLUDED`, or `RATE`; `TAX_RATE_BPS` is required for `RATE`), and set the customer-facing `RETURN_POLICY`. Do not enable checkout until those rules are reviewed for the actual sales region.

Affiliate tracking, commissions, and payouts also remain disabled until the admin settings define the program state, attribution window and model, commission rate and basis, delivery trigger, refund treatment, minimum payout, and payout method. Referrals seen before the attribution settings are configured are not recorded.

## Database foundation

The Prisma schema targets PostgreSQL. The included Docker Compose service binds only to localhost and persists data in a named volume. Copy `.env.example` to `.env`, set a local `POSTGRES_PASSWORD`, and use the same value in `DATABASE_URL`. Then start PostgreSQL, generate the client, and apply the schema:

```sh
npm run db:generate
npm run db:push
npm run db:seed
```

Use `npm run db:studio` to inspect the configured database. The sample catalog seed uses the same product IDs as the storefront, allowing admin catalog changes to appear in public product browsing and giving account wishlist/order operations stable product IDs. The storefront falls back to fictional sample data if the API is unavailable; the cart remains browser-local. `db:push` and `db:seed` require a reachable PostgreSQL instance; `db:push` is not a substitute for a reviewed migration workflow in production.

## Current storefront slice

- Responsive product discovery with category navigation, text search, and sorting; reads active products from PostgreSQL when configured.
- Addressable product detail pages with ingredient lists, quantity controls, related items, and a browser-local cart.
- Fictional sample products priced in BDT, with demo imagery hosted by Unsplash.
- Account registration/login, profile details, addresses, wishlist, and referral-code display use the Express API and PostgreSQL when configured. Password reset and email verification are not connected.
- COD order creation is implemented for Bangladesh but remains disabled until checkout fees, tax mode, and the customer policy are finalized. The cart stays browser-local until order placement.
- Referral clicks and signup attribution are available after admin configures the attribution policy. Commissions and payouts stay disabled until commission, refund, delivery, and payout rules are configured.
- Admin APIs and workspace support catalog/category management, customer access, order status, affiliate/payout review, analytics, and checkout/affiliate settings. These require a promoted admin account and a running database.

Replace demo product descriptions, availability, prices, and remote images with verified business data before launch. Confirm sales region, shipping and tax rules, cash-on-delivery operations, return policy, and affiliate terms before enabling those workflows. The current cart is stored only in this browser and is not an order record.
