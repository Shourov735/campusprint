# CampusPrint Backend

Backend implementation and automated integration test suite for **CampusPrint — A Campus Printing and Binding Service** (IIT, University of Dhaka — Web Technology Project, 2026).

Built with the stack defined in the project proposal: **Node.js, Express, TypeScript, Zod, Vitest, and Supertest**, with a GitHub Actions CI pipeline and a PostgreSQL Prisma schema covering all 7 core entities.

## Implemented Features (Full CRUD Lifecycle)

### 1. Print Options & Pricing Catalogue (`/api/print-options`)
- `GET /api/print-options` — List options with server-side filtering (`category`, `available`), sorting (`unitPrice`, `name`, `createdAt`), and pagination (`page`, `limit`).
- `GET /api/print-options/:id` — Fetch a single print/binding option.
- `POST /api/print-options` — Create a new print/binding option (**Admin only**).
- `PUT /api/print-options/:id` — Full replacement update (**Admin only**).
- `PATCH /api/print-options/:id` — Partial update such as rate or availability changes (**Admin only**).
- `DELETE /api/print-options/:id` — Delete an option (**Admin only**, protected against deleting options referenced by active orders).

### 2. Print Orders, Quote Engine & Status Workflow (`/api/orders`)
- `POST /api/orders` — Create a draft order with PDF metadata and selected options (**Student only**); calculates an immutable quote snapshot (`PER_PAGE` and `FLAT` rates).
- `GET /api/orders` — List orders with filtering (`status`, `search`), sorting (`createdAt`, `totalPrice`), and pagination (`page`, `limit`). Students see only their own orders (*My Orders*); Staff and Admin see all shop orders (*Staff Orders*).
- `GET /api/orders/:id` — Fetch order details and quote (enforces student ownership boundary).
- `PUT /api/orders/:id` — Full replacement of a `DRAFT` order (**Owner Student only**).
- `PATCH /api/orders/:id` — Partial edit of a `DRAFT` order with automatic quote recalculation (**Owner Student only**).
- `PATCH /api/orders/:id/status` — Role-authorized status transitions (`DRAFT → SUBMITTED → AWAITING_PAYMENT → [PAID] → PRINTING → READY → COLLECTED`, plus `REJECTED` with mandatory reason and `CANCELLED` before payment).
- `POST /api/orders/:id/pay` — Idempotent sandbox payment verification (`AWAITING_PAYMENT → PAID`) using `Idempotency-Key` / `transactionId`.
- `DELETE /api/orders/:id` — Delete a `DRAFT` order (**Owner Student only**).

## Authentication Headers (Dev / Test Mode)

Pass `x-user-id` to test role boundaries (designed to swap cleanly with Passport.js sessions/OAuth):

| Header | Role | Seeded User |
| :--- | :--- | :--- |
| `x-user-id: student-1609` | `STUDENT` | Md Shourov (Roll 1609) |
| `x-user-id: student-1605` | `STUDENT` | Rokib Ikbal (Roll 1605) |
| `x-user-id: staff-01` | `STAFF` | Campus Print Operator |
| `x-user-id: admin-01` | `ADMIN` | CampusPrint Admin |

## Quick Start

```bash
npm install
npm run typecheck
npm test
```

Start the development server:

```bash
npm run dev
# Server runs at http://localhost:4000
```

## Automated Integration Tests (Replacing Manual Postman Testing)

All CRUD endpoints, query filters, Zod validations, role boundaries, ownership checks, status transitions, and idempotent payment callbacks are verified automatically using **Vitest + Supertest**:

- `tests/print-options.integration.test.ts` — Full CRUD lifecycle, filtering/sorting/pagination, RBAC, duplicate code conflict, and in-use deletion guard.
- `tests/orders.crud.integration.test.ts` — Full draft CRUD lifecycle, automatic quote math, student ownership isolation, list filtering/sorting/pagination, and PDF/option validation.
- `tests/orders.workflow.integration.test.ts` — End-to-end happy path, duplicate payment idempotency, staff rejection reason enforcement, pre-payment cancellation vs. post-payment block, and invalid transition guards.
