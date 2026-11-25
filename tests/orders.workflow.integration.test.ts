import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { AUTH_HEADERS, buildSampleOrderPayload } from "./helpers";

describe("Feature 2: PrintOrder Status Workflow & Idempotent Payment (/api/orders/:id/status & /pay)", () => {
  let { app } = createApp();

  beforeEach(() => {
    ({ app } = createApp());
  });

  it("executes the complete end-to-end happy path (DRAFT -> SUBMITTED -> AWAITING_PAYMENT -> PAID -> PRINTING -> READY -> COLLECTED)", async () => {
    // 1. Student creates Draft
    const created = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student1)
      .send(buildSampleOrderPayload());
    expect(created.status).toBe(201);
    const orderId: string = created.body.data.id;
    const quoteTotal: number = created.body.data.totalPrice;

    // 2. Student submits order
    const submitted = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(AUTH_HEADERS.student1)
      .send({ status: "SUBMITTED" });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe("SUBMITTED");

    // Once submitted, student can no longer edit or delete the order
    const editAfterSubmit = await request(app)
      .patch(`/api/orders/${orderId}`)
      .set(AUTH_HEADERS.student1)
      .send({ copies: 5 });
    expect(editAfterSubmit.status).toBe(409);
    expect(editAfterSubmit.body.error.code).toBe("ORDER_NOT_EDITABLE");

    const deleteAfterSubmit = await request(app)
      .delete(`/api/orders/${orderId}`)
      .set(AUTH_HEADERS.student1);
    expect(deleteAfterSubmit.status).toBe(409);
    expect(deleteAfterSubmit.body.error.code).toBe("ORDER_NOT_DELETABLE");

    // 3. Staff approves order -> AWAITING_PAYMENT
    const approved = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(AUTH_HEADERS.staff)
      .send({ status: "AWAITING_PAYMENT" });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("AWAITING_PAYMENT");

    // 4. Student pays via verified payment endpoint -> PAID
    const paid = await request(app)
      .post(`/api/orders/${orderId}/pay`)
      .set(AUTH_HEADERS.student1)
      .set("Idempotency-Key", "idem-tx-1001")
      .send({
        transactionId: "SSLCZ-SANDBOX-1001",
        provider: "SSLCOMMERZ_SANDBOX",
        amount: quoteTotal
      });
    expect(paid.status).toBe(200);
    expect(paid.body.idempotent).toBe(false);
    expect(paid.body.data.status).toBe("PAID");
    expect(paid.body.payment.transactionId).toBe("SSLCZ-SANDBOX-1001");

    // 5. Duplicate payment callback with same Idempotency-Key returns 200 idempotently
    const duplicatePaid = await request(app)
      .post(`/api/orders/${orderId}/pay`)
      .set(AUTH_HEADERS.student1)
      .set("Idempotency-Key", "idem-tx-1001")
      .send({
        transactionId: "SSLCZ-SANDBOX-1001",
        provider: "SSLCOMMERZ_SANDBOX",
        amount: quoteTotal
      });
    expect(duplicatePaid.status).toBe(200);
    expect(duplicatePaid.body.idempotent).toBe(true);
    expect(duplicatePaid.body.payment.id).toBe(paid.body.payment.id);

    // 6. Staff starts printing -> PRINTING
    const printing = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(AUTH_HEADERS.staff)
      .send({ status: "PRINTING" });
    expect(printing.status).toBe(200);
    expect(printing.body.data.status).toBe("PRINTING");

    // 7. Staff marks ready -> READY (generates collection code)
    const ready = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(AUTH_HEADERS.staff)
      .send({ status: "READY" });
    expect(ready.status).toBe(200);
    expect(ready.body.data.status).toBe("READY");
    expect(ready.body.data.collectionCode).toMatch(/^CP-\d{6}$/);

    // 8. Staff verifies collection -> COLLECTED
    const collected = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(AUTH_HEADERS.staff)
      .send({ status: "COLLECTED" });
    expect(collected.status).toBe(200);
    expect(collected.body.data.status).toBe("COLLECTED");
  });

  it("allows Staff to reject a SUBMITTED order only when a rejectionReason is provided", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student1)
      .send(buildSampleOrderPayload());
    const orderId: string = created.body.data.id;

    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(AUTH_HEADERS.student1)
      .send({ status: "SUBMITTED" });

    // Missing rejectionReason -> 400
    const missingReason = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(AUTH_HEADERS.staff)
      .send({ status: "REJECTED" });
    expect(missingReason.status).toBe(400);
    expect(missingReason.body.error.code).toBe("REJECTION_REASON_REQUIRED");

    // Valid rejectionReason -> 200 REJECTED
    const rejected = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(AUTH_HEADERS.staff)
      .send({ status: "REJECTED", rejectionReason: "Corrupted PDF pages 4-6" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe("REJECTED");
    expect(rejected.body.data.rejectionReason).toBe("Corrupted PDF pages 4-6");
  });

  it("allows Student to cancel before payment, but blocks cancellation after payment", async () => {
    // Order 1: cancel at AWAITING_PAYMENT -> allowed
    const o1 = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student1)
      .send(buildSampleOrderPayload());
    const o1Id: string = o1.body.data.id;

    await request(app)
      .patch(`/api/orders/${o1Id}/status`)
      .set(AUTH_HEADERS.student1)
      .send({ status: "SUBMITTED" });
    await request(app)
      .patch(`/api/orders/${o1Id}/status`)
      .set(AUTH_HEADERS.staff)
      .send({ status: "AWAITING_PAYMENT" });

    const cancelled = await request(app)
      .patch(`/api/orders/${o1Id}/status`)
      .set(AUTH_HEADERS.student1)
      .send({ status: "CANCELLED" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("CANCELLED");

    // Order 2: cancel after PAID -> 409 conflict
    const o2 = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student1)
      .send(buildSampleOrderPayload());
    const o2Id: string = o2.body.data.id;

    await request(app)
      .patch(`/api/orders/${o2Id}/status`)
      .set(AUTH_HEADERS.student1)
      .send({ status: "SUBMITTED" });
    await request(app)
      .patch(`/api/orders/${o2Id}/status`)
      .set(AUTH_HEADERS.staff)
      .send({ status: "AWAITING_PAYMENT" });
    await request(app)
      .post(`/api/orders/${o2Id}/pay`)
      .set(AUTH_HEADERS.student1)
      .send({ transactionId: "SSLCZ-SANDBOX-2002", amount: o2.body.data.totalPrice });

    const cancelAfterPay = await request(app)
      .patch(`/api/orders/${o2Id}/status`)
      .set(AUTH_HEADERS.student1)
      .send({ status: "CANCELLED" });
    expect(cancelAfterPay.status).toBe(409);
    expect(cancelAfterPay.body.error.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("blocks direct status override to PAID, invalid jumps, and unauthorized role transitions", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(AUTH_HEADERS.student1)
      .send(buildSampleOrderPayload());
    const orderId: string = created.body.data.id;

    // Cannot jump directly from DRAFT to READY
    const jumpRes = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(AUTH_HEADERS.staff)
      .send({ status: "READY" });
    expect(jumpRes.status).toBe(409);
    expect(jumpRes.body.error.code).toBe("INVALID_STATUS_TRANSITION");

    // Submit order
    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(AUTH_HEADERS.student1)
      .send({ status: "SUBMITTED" });

    // Student cannot approve their own order
    const studentApprove = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(AUTH_HEADERS.student1)
      .send({ status: "AWAITING_PAYMENT" });
    expect(studentApprove.status).toBe(403);
    expect(studentApprove.body.error.code).toBe("FORBIDDEN_TRANSITION");

    // Staff approves
    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(AUTH_HEADERS.staff)
      .send({ status: "AWAITING_PAYMENT" });

    // Cannot bypass payment endpoint via PATCH /status -> PAID
    const bypassPaid = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(AUTH_HEADERS.admin)
      .send({ status: "PAID" });
    expect(bypassPaid.status).toBe(409);
    expect(bypassPaid.body.error.code).toBe("PAYMENT_VERIFICATION_REQUIRED");

    // Payment amount mismatch rejected with 400
    const wrongAmount = await request(app)
      .post(`/api/orders/${orderId}/pay`)
      .set(AUTH_HEADERS.student1)
      .send({ transactionId: "SSLCZ-WRONG-AMT", amount: 1 });
    expect(wrongAmount.status).toBe(400);
    expect(wrongAmount.body.error.code).toBe("PAYMENT_AMOUNT_MISMATCH");
  });
});
