import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { AUTH_HEADERS, buildSampleOrderPayload } from "./helpers";

describe("Feature 2: Print Orders Full CRUD Lifecycle & Query API (/api/orders)", () => {
  let { app } = createApp();

  beforeEach(() => {
    ({ app } = createApp());
  });

  it("completes full draft order CRUD lifecycle (POST -> GET -> PUT -> PATCH -> DELETE -> 404)", async () => {
    // 1. CREATE DRAFT (POST)
    // Quote check: (20 pages * 2 BDT * 2 copies = 80) + (35 BDT flat * 2 copies = 70) = 150 BDT
    const createRes = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student1)
      .send(buildSampleOrderPayload());

    expect(createRes.status).toBe(201);
    const orderId: string = createRes.body.data.id;
    expect(orderId).toMatch(/^ord-/);
    expect(createRes.body.data.status).toBe("DRAFT");
    expect(createRes.body.data.totalPrice).toBe(150);
    expect(createRes.body.data.options).toHaveLength(2);

    // 2. READ SINGLE (GET /:id)
    const getRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(AUTH_HEADERS.student1);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.document.fileName).toBe("thesis-draft.pdf");

    // 3. REPLACE DRAFT (PUT /:id)
    // Quote check: 10 pages * 8 BDT (color) * 1 copy = 80 BDT
    const putRes = await request(app)
      .put(`/api/orders/${orderId}`)
      .set(AUTH_HEADERS.student1)
      .send({
        document: {
          fileName: "poster-final.pdf",
          mimeType: "application/pdf",
          pageCount: 10,
          sizeBytes: 2_500_000
        },
        copies: 1,
        optionIds: ["opt-a4-color"],
        notes: "Urgent color print"
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.data.document.fileName).toBe("poster-final.pdf");
    expect(putRes.body.data.totalPrice).toBe(80);
    expect(putRes.body.data.options).toHaveLength(1);

    // 4. PARTIAL EDIT (PATCH /:id)
    // Quote check: 10 pages * 8 BDT * 3 copies = 240 BDT
    const patchRes = await request(app)
      .patch(`/api/orders/${orderId}`)
      .set(AUTH_HEADERS.student1)
      .send({ copies: 3, notes: "Updated to 3 copies" });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.copies).toBe(3);
    expect(patchRes.body.data.totalPrice).toBe(240);
    expect(patchRes.body.data.document.fileName).toBe("poster-final.pdf");

    // 5. DELETE DRAFT (DELETE /:id)
    const deleteRes = await request(app)
      .delete(`/api/orders/${orderId}`)
      .set(AUTH_HEADERS.student1);
    expect(deleteRes.status).toBe(204);

    // 6. VERIFY DELETION (GET -> 404)
    const afterDeleteRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(AUTH_HEADERS.student1);
    expect(afterDeleteRes.status).toBe(404);
    expect(afterDeleteRes.body.error.code).toBe("ORDER_NOT_FOUND");
  });

  it("isolates student orders (My Orders) while allowing Staff/Admin to view all orders", async () => {
    const s1Order = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student1)
      .send(buildSampleOrderPayload({ document: { fileName: "s1.pdf", mimeType: "application/pdf", pageCount: 5, sizeBytes: 1000 } }));

    const s2Order = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student2)
      .send(buildSampleOrderPayload({ document: { fileName: "s2.pdf", mimeType: "application/pdf", pageCount: 10, sizeBytes: 2000 } }));

    expect(s1Order.status).toBe(201);
    expect(s2Order.status).toBe(201);

    // Student 1 sees only their own order
    const s1List = await request(app).get("/api/orders").set(AUTH_HEADERS.student1);
    expect(s1List.status).toBe(200);
    expect(s1List.body.data).toHaveLength(1);
    expect(s1List.body.data[0].studentId).toBe("student-1609");

    // Student 1 cannot read, edit, or delete Student 2's order
    const s2OrderId: string = s2Order.body.data.id;
    expect(
      (await request(app).get(`/api/orders/${s2OrderId}`).set(AUTH_HEADERS.student1)).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`/api/orders/${s2OrderId}`)
          .set(AUTH_HEADERS.student1)
          .send({ copies: 5 })
      ).status
    ).toBe(403);
    expect(
      (await request(app).delete(`/api/orders/${s2OrderId}`).set(AUTH_HEADERS.student1)).status
    ).toBe(403);

    // Staff sees both students' orders
    const staffList = await request(app).get("/api/orders").set(AUTH_HEADERS.staff);
    expect(staffList.status).toBe(200);
    expect(staffList.body.data).toHaveLength(2);
  });

  it("supports filtering by status/search, sorting by totalPrice, and pagination", async () => {
    // Create 3 orders with distinct prices: 20 BDT, 100 BDT, 200 BDT
    const o1 = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student1)
      .send({
        document: { fileName: "lab-01.pdf", mimeType: "application/pdf", pageCount: 10, sizeBytes: 5000 },
        copies: 1,
        optionIds: ["opt-a4-bw"]
      });
    const o2 = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student1)
      .send({
        document: { fileName: "lab-02.pdf", mimeType: "application/pdf", pageCount: 50, sizeBytes: 15000 },
        copies: 1,
        optionIds: ["opt-a4-bw"]
      });
    const o3 = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student1)
      .send({
        document: { fileName: "report-final.pdf", mimeType: "application/pdf", pageCount: 25, sizeBytes: 25000 },
        copies: 1,
        optionIds: ["opt-a4-color"]
      });

    // Submit o2 so status filter can distinguish SUBMITTED vs DRAFT
    await request(app)
      .patch(`/api/orders/${o2.body.data.id}/status`)
      .set(AUTH_HEADERS.student1)
      .send({ status: "SUBMITTED" });

    expect(o1.body.data.totalPrice).toBe(20);
    expect(o2.body.data.totalPrice).toBe(100);
    expect(o3.body.data.totalPrice).toBe(200);

    // Sort by totalPrice descending, paginate 2 per page
    const sortedRes = await request(app)
      .get("/api/orders")
      .set(AUTH_HEADERS.student1)
      .query({ sortBy: "totalPrice", order: "desc", page: 1, limit: 2 });

    expect(sortedRes.status).toBe(200);
    expect(sortedRes.body.data.map((o: { totalPrice: number }) => o.totalPrice)).toEqual([200, 100]);
    expect(sortedRes.body.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2
    });

    // Filter by status=SUBMITTED
    const statusRes = await request(app)
      .get("/api/orders")
      .set(AUTH_HEADERS.staff)
      .query({ status: "SUBMITTED" });

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data).toHaveLength(1);
    expect(statusRes.body.data[0].id).toBe(o2.body.data.id);

    // Filter by search substring
    const searchRes = await request(app)
      .get("/api/orders")
      .set(AUTH_HEADERS.student1)
      .query({ search: "report" });

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data).toHaveLength(1);
    expect(searchRes.body.data[0].document.fileName).toBe("report-final.pdf");
  });

  it("blocks Staff and Admin from creating draft orders", async () => {
    const staffCreate = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.staff)
      .send(buildSampleOrderPayload());
    expect(staffCreate.status).toBe(403);

    const adminCreate = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.admin)
      .send(buildSampleOrderPayload());
    expect(adminCreate.status).toBe(403);
  });

  it("rejects non-PDF files, unknown print options, and unavailable print options", async () => {
    // Non-PDF file rejected by Zod
    const nonPdfRes = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student1)
      .send(
        buildSampleOrderPayload({
          document: {
            fileName: "slides.pptx",
            mimeType: "application/pdf",
            pageCount: 10,
            sizeBytes: 10000
          }
        })
      );
    expect(nonPdfRes.status).toBe(400);
    expect(nonPdfRes.body.error.code).toBe("VALIDATION_ERROR");

    // Unknown option ID
    const unknownOptRes = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student1)
      .send(buildSampleOrderPayload({ optionIds: ["opt-nonexistent"] }));
    expect(unknownOptRes.status).toBe(400);
    expect(unknownOptRes.body.error.code).toBe("INVALID_PRINT_OPTION");

    // Disable an option as Admin, then attempt to order it as Student
    await request(app)
      .patch("/api/print-options/opt-a4-color")
      .set(AUTH_HEADERS.admin)
      .send({ available: false });

    const unavailableRes = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student1)
      .send(buildSampleOrderPayload({ optionIds: ["opt-a4-color"] }));
    expect(unavailableRes.status).toBe(409);
    expect(unavailableRes.body.error.code).toBe("OPTION_UNAVAILABLE");
  });
});
