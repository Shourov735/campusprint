import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { AUTH_HEADERS, buildSampleOrderPayload } from "./helpers";

describe("Feature 1: Print Options & Pricing Catalogue CRUD (/api/print-options)", () => {
  let { app, store } = createApp();

  beforeEach(() => {
    ({ app, store } = createApp());
  });

  it("GET /api/health returns service status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("campusprint-backend");
  });

  it("completes full CRUD lifecycle (POST -> GET -> PUT -> PATCH -> DELETE -> 404)", async () => {
    // 1. CREATE (POST) as Admin
    const createRes = await request(app)
      .post("/api/print-options")
      .set(AUTH_HEADERS.admin)
      .send({
        code: "HARD_BIND",
        name: "Hardcover Binding",
        category: "BINDING",
        pricingUnit: "FLAT",
        unitPrice: 180,
        available: true,
        description: "Thesis-grade hardcover binding"
      });

    expect(createRes.status).toBe(201);
    const createdId: string = createRes.body.data.id;
    expect(createdId).toMatch(/^opt-/);
    expect(createRes.body.data.code).toBe("HARD_BIND");
    expect(createRes.body.data.unitPrice).toBe(180);

    // 2. READ SINGLE (GET /:id)
    const getRes = await request(app).get(`/api/print-options/${createdId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.name).toBe("Hardcover Binding");

    // 3. REPLACE (PUT /:id) as Admin
    const putRes = await request(app)
      .put(`/api/print-options/${createdId}`)
      .set(AUTH_HEADERS.admin)
      .send({
        code: "HARD_BIND_GOLD",
        name: "Hardcover Binding (Gold Foil)",
        category: "BINDING",
        pricingUnit: "FLAT",
        unitPrice: 250,
        available: true,
        description: "Thesis hardcover with gold lettering"
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.data.code).toBe("HARD_BIND_GOLD");
    expect(putRes.body.data.unitPrice).toBe(250);

    // 4. PARTIAL UPDATE (PATCH /:id) as Admin
    const patchRes = await request(app)
      .patch(`/api/print-options/${createdId}`)
      .set(AUTH_HEADERS.admin)
      .send({ unitPrice: 220, available: false });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.unitPrice).toBe(220);
    expect(patchRes.body.data.available).toBe(false);
    expect(patchRes.body.data.name).toBe("Hardcover Binding (Gold Foil)");

    // 5. DELETE (DELETE /:id) as Admin
    const deleteRes = await request(app)
      .delete(`/api/print-options/${createdId}`)
      .set(AUTH_HEADERS.admin);
    expect(deleteRes.status).toBe(204);

    // 6. VERIFY DELETION (GET -> 404)
    const afterDeleteRes = await request(app).get(`/api/print-options/${createdId}`);
    expect(afterDeleteRes.status).toBe(404);
    expect(afterDeleteRes.body.error.code).toBe("PRINT_OPTION_NOT_FOUND");
  });

  it("supports server-side filtering, sorting, and pagination on GET /api/print-options", async () => {
    const filteredRes = await request(app)
      .get("/api/print-options")
      .query({ category: "COLOR", sortBy: "unitPrice", order: "desc", page: 1, limit: 1 });

    expect(filteredRes.status).toBe(200);
    expect(filteredRes.body.data).toHaveLength(1);
    expect(filteredRes.body.data[0].code).toBe("A4_COLOR");
    expect(filteredRes.body.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2
    });

    const page2Res = await request(app)
      .get("/api/print-options")
      .query({ category: "COLOR", sortBy: "unitPrice", order: "desc", page: 2, limit: 1 });

    expect(page2Res.status).toBe(200);
    expect(page2Res.body.data[0].code).toBe("A4_BW");
  });

  it("enforces RBAC: rejects unauthenticated, student, and staff mutations", async () => {
    const payload = {
      code: "GLOSSY_A4",
      name: "A4 Glossy Paper",
      category: "PAPER",
      pricingUnit: "PER_PAGE",
      unitPrice: 12
    };

    const unauthRes = await request(app).post("/api/print-options").send(payload);
    expect(unauthRes.status).toBe(401);

    const studentRes = await request(app)
      .post("/api/print-options")
      .set(AUTH_HEADERS.student1)
      .send(payload);
    expect(studentRes.status).toBe(403);

    const staffRes = await request(app)
      .patch("/api/print-options/opt-a4-bw")
      .set(AUTH_HEADERS.staff)
      .send({ unitPrice: 3 });
    expect(staffRes.status).toBe(403);
  });

  it("validates payloads with Zod and rejects invalid fields with 400", async () => {
    const res = await request(app)
      .post("/api/print-options")
      .set(AUTH_HEADERS.admin)
      .send({
        code: "bad code!",
        name: "X",
        category: "INVALID_CAT",
        pricingUnit: "PER_PAGE",
        unitPrice: -5
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects duplicate option codes with 409 Conflict", async () => {
    const res = await request(app)
      .post("/api/print-options")
      .set(AUTH_HEADERS.admin)
      .send({
        code: "A4_BW",
        name: "Duplicate BW",
        category: "COLOR",
        pricingUnit: "PER_PAGE",
        unitPrice: 2
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_OPTION_CODE");
  });

  it("prevents deleting a print option currently referenced by an active order", async () => {
    const orderRes = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student1)
      .send(buildSampleOrderPayload());
    expect(orderRes.status).toBe(201);

    const deleteRes = await request(app)
      .delete("/api/print-options/opt-spiral-bind")
      .set(AUTH_HEADERS.admin);

    expect(deleteRes.status).toBe(409);
    expect(deleteRes.body.error.code).toBe("OPTION_IN_USE");
    expect(store.printOptions.has("opt-spiral-bind")).toBe(true);
  });
});
