# Multi-Tenant POS System

Django REST backend + Next.js frontend. Built to support any business
vertical (retail, restaurant, services) on one shared deployment.

## Architecture

**Multi-tenancy:** shared database, row-level isolation. Every business-owned
model inherits `BusinessScopedModel` (`apps/core/models.py`), which adds a
`business` FK. Every API request must include an `X-Business-Id` header;
`TenantScopedViewSet` (`apps/core/viewsets.py`) checks the authenticated
user has an active `BusinessMembership` for that business before touching
any data, then auto-filters querysets and stamps new records — so it's
architecturally impossible for one tenant's viewset call to leak another
tenant's rows.

**Generic catalog:** `ProductType` lets each business define its own kinds of
sellable things (tracks inventory? has variants? is a service?) instead of
hardcoding "retail item" vs "menu item" vs "service" in the schema. `Product`
and `ProductVariant` carry a free-form `attributes` JSONField for
type-specific data (size, prep time, duration, etc).

**Inventory:** `StockItem` holds current on-hand quantity; `StockMovement`
is an append-only ledger — every change (sale, restock, adjustment, return)
is a row, and `StockItem.quantity_on_hand` is only ever mutated through a
`StockMovement.save()`, so you always have a full audit trail.

**Checkout:** `Order.checkout()` is one atomic transaction: validates
payment covers the total, deducts stock for tracked items, records
payments, marks the order paid. Service-type products skip stock
deduction entirely.

## Apps

| App | Responsibility |
|---|---|
| `tenants` | Business (tenant) accounts, settings, memberships/roles |
| `users` | Custom user model (global identity, business-agnostic) |
| `catalog` | ProductType, Category, Product, ProductVariant |
| `inventory` | StockLocation, StockItem, StockMovement |
| `sales` | Order, OrderItem, Payment, checkout logic |

## Running the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Then in `/admin/` create a `Business`, a `BusinessSettings` row for it, and
a `BusinessMembership` linking your user to that business — this is your
first tenant. (A proper self-serve signup flow is the natural next milestone.)

## Running the frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Visit `http://localhost:3000` → redirects to `/login`. Log in with the
superuser you created; if it belongs to more than one business you'll get
a picker, otherwise it goes straight to `/pos`.

## API quick reference

- `POST /api/auth/token/` — obtain JWT (`username`, `password`)
- `GET /api/auth/me/businesses/` — list businesses the logged-in user belongs to
- `GET/POST /api/products/`, `/api/categories/`, `/api/product-types/`
- `GET /api/stock-items/` (read-only — mutate via `/api/stock-movements/`)
- `POST /api/orders/` → `POST /api/orders/{id}/items/` → `POST /api/orders/{id}/checkout/`

All of the above (except token/businesses) require the `X-Business-Id` header.

## What's next (not yet built)

- Refund/void flow beyond simple void-while-open
- Multi-location stock transfers
- Receipt printing / PDF export
- Reporting dashboard (sales by day, top products, low-stock alerts)
- Self-serve business signup + billing (Stripe)
- Barcode scanning input on the POS screen
