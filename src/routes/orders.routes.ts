import { Router } from "express";
import { authenticate, requireRoles } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { calculateOrderQuote } from "../services/pricing.service";
import { validateStatusTransition } from "../services/workflow.service";
import type { MemoryStore } from "../store/memoryStore";
import type { PaymentRecord, PrintOrder } from "../types/domain";
import {
  createOrderSchema,
  listOrdersQuerySchema,
  patchOrderSchema,
  payOrderSchema,
  replaceOrderSchema,
  updateOrderStatusSchema
} from "../validators/order.schema";

export function createOrdersRouter(store: MemoryStore): Router {
  const router = Router();

  // All order routes require authentication
  router.use(authenticate);

  // POST /api/orders — Create a new draft PrintOrder (Student only)
  router.post("/", requireRoles("STUDENT"), (req, res, next) => {
    try {
      const input = createOrderSchema.parse(req.body);
      const user = req.user!;

      const quote = calculateOrderQuote(
        store,
        input.optionIds,
        input.document.pageCount,
        input.copies
      );

      const now = new Date().toISOString();
      const order: PrintOrder = {
        id: store.generateId("ord"),
        studentId: user.id,
        document: {
          id: store.generateId("doc"),
          fileName: input.document.fileName,
          mimeType: input.document.mimeType,
          pageCount: input.document.pageCount,
          sizeBytes: input.document.sizeBytes
        },
        copies: input.copies,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        status: "DRAFT",
        options: quote.options,
        totalPrice: quote.totalPrice,
        createdAt: now,
        updatedAt: now
      };

      store.orders.set(order.id, order);
      res.status(201).json({ data: order });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/orders — List orders with filtering, sorting, and pagination
  // Students see only their own orders ("My Orders"); Staff/Admin see all shop orders ("Staff Orders").
  router.get("/", requireRoles("STUDENT", "STAFF", "ADMIN"), (req, res, next) => {
    try {
      const query = listOrdersQuerySchema.parse(req.query);
      const user = req.user!;

      let items = Array.from(store.orders.values());

      if (user.role === "STUDENT") {
        items = items.filter((order) => order.studentId === user.id);
      }
      if (query.status) {
        items = items.filter((order) => order.status === query.status);
      }
      if (query.search) {
        const needle = query.search.toLowerCase();
        items = items.filter(
          (order) =>
            order.document.fileName.toLowerCase().includes(needle) ||
            order.id.toLowerCase().includes(needle) ||
            (order.notes?.toLowerCase().includes(needle) ?? false)
        );
      }

      const direction = query.order === "asc" ? 1 : -1;
      items.sort((a, b) => {
        if (query.sortBy === "totalPrice") {
          return (a.totalPrice - b.totalPrice) * direction;
        }
        return a.createdAt.localeCompare(b.createdAt) * direction;
      });

      const total = items.length;
      const totalPages = Math.max(1, Math.ceil(total / query.limit));
      const start = (query.page - 1) * query.limit;
      const data = items.slice(start, start + query.limit);

      res.status(200).json({
        data,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/orders/:id — Get order details and quote (enforces student ownership boundary)
  router.get("/:id", requireRoles("STUDENT", "STAFF", "ADMIN"), (req, res, next) => {
    try {
      const order = store.orders.get(req.params.id);
      if (!order) {
        throw new AppError(404, "ORDER_NOT_FOUND", "Print order not found.");
      }

      const user = req.user!;
      if (user.role === "STUDENT" && order.studentId !== user.id) {
        throw new AppError(403, "FORBIDDEN", "Students can only view their own orders.");
      }

      res.status(200).json({ data: order });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/orders/:id — Full replacement of a DRAFT order (Owner Student only)
  router.put("/:id", requireRoles("STUDENT"), (req, res, next) => {
    try {
      const existing = store.orders.get(req.params.id);
      if (!existing) {
        throw new AppError(404, "ORDER_NOT_FOUND", "Print order not found.");
      }

      const user = req.user!;
      if (existing.studentId !== user.id) {
        throw new AppError(403, "FORBIDDEN", "Students can only replace their own draft orders.");
      }
      if (existing.status !== "DRAFT") {
        throw new AppError(
          409,
          "ORDER_NOT_EDITABLE",
          `Only DRAFT orders can be replaced. Current status is '${existing.status}'.`
        );
      }

      const input = replaceOrderSchema.parse(req.body);
      const quote = calculateOrderQuote(
        store,
        input.optionIds,
        input.document.pageCount,
        input.copies
      );

      const updated: PrintOrder = {
        ...existing,
        document: {
          id: existing.document.id,
          fileName: input.document.fileName,
          mimeType: input.document.mimeType,
          pageCount: input.document.pageCount,
          sizeBytes: input.document.sizeBytes
        },
        copies: input.copies,
        notes: input.notes,
        options: quote.options,
        totalPrice: quote.totalPrice,
        updatedAt: new Date().toISOString()
      };

      store.orders.set(updated.id, updated);
      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/orders/:id — Partial edit of a DRAFT order (Owner Student only)
  router.patch("/:id", requireRoles("STUDENT"), (req, res, next) => {
    try {
      const existing = store.orders.get(req.params.id);
      if (!existing) {
        throw new AppError(404, "ORDER_NOT_FOUND", "Print order not found.");
      }

      const user = req.user!;
      if (existing.studentId !== user.id) {
        throw new AppError(403, "FORBIDDEN", "Students can only edit their own draft orders.");
      }
      if (existing.status !== "DRAFT") {
        throw new AppError(
          409,
          "ORDER_NOT_EDITABLE",
          `Only DRAFT orders can be edited. Current status is '${existing.status}'.`
        );
      }

      const input = patchOrderSchema.parse(req.body);
      const mergedDocument = {
        ...existing.document,
        ...(input.document ?? {})
      };
      const mergedCopies = input.copies ?? existing.copies;
      const optionIds = input.optionIds ?? existing.options.map((opt) => opt.printOptionId);

      const quote = calculateOrderQuote(store, optionIds, mergedDocument.pageCount, mergedCopies);

      const updated: PrintOrder = {
        ...existing,
        document: mergedDocument,
        copies: mergedCopies,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        options: quote.options,
        totalPrice: quote.totalPrice,
        updatedAt: new Date().toISOString()
      };

      store.orders.set(updated.id, updated);
      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/orders/:id/status — Authorized PrintOrder lifecycle state transition
  router.patch("/:id/status", requireRoles("STUDENT", "STAFF", "ADMIN"), (req, res, next) => {
    try {
      const existing = store.orders.get(req.params.id);
      if (!existing) {
        throw new AppError(404, "ORDER_NOT_FOUND", "Print order not found.");
      }

      const user = req.user!;
      if (user.role === "STUDENT" && existing.studentId !== user.id) {
        throw new AppError(403, "FORBIDDEN", "Students can only update their own orders.");
      }

      const input = updateOrderStatusSchema.parse(req.body);
      validateStatusTransition(existing.status, input.status, user.role, input.rejectionReason);

      const updated: PrintOrder = {
        ...existing,
        status: input.status,
        ...(input.status === "REJECTED" && input.rejectionReason
          ? { rejectionReason: input.rejectionReason }
          : {}),
        ...(input.status === "READY" && !existing.collectionCode
          ? { collectionCode: store.generateCollectionCode() }
          : {}),
        updatedAt: new Date().toISOString()
      };

      store.orders.set(updated.id, updated);
      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/orders/:id/pay — Idempotent sandbox payment verification (AWAITING_PAYMENT -> PAID)
  router.post("/:id/pay", requireRoles("STUDENT"), (req, res, next) => {
    try {
      const existing = store.orders.get(req.params.id);
      if (!existing) {
        throw new AppError(404, "ORDER_NOT_FOUND", "Print order not found.");
      }

      const user = req.user!;
      if (existing.studentId !== user.id) {
        throw new AppError(403, "FORBIDDEN", "Students can only pay for their own orders.");
      }

      const input = payOrderSchema.parse(req.body);
      const idempotencyKey =
        req.header("idempotency-key")?.trim() || `${existing.id}:${input.transactionId}`;

      // Idempotent replay handling for duplicate callbacks / retries
      const existingPayment = store.paymentsByKey.get(idempotencyKey);
      if (existingPayment && existingPayment.orderId === existing.id) {
        res.status(200).json({
          data: existing,
          payment: existingPayment,
          idempotent: true
        });
        return;
      }

      if (existing.status !== "AWAITING_PAYMENT") {
        throw new AppError(
          409,
          "INVALID_PAYMENT_STATE",
          `Order must be in AWAITING_PAYMENT status to be paid. Current status is '${existing.status}'.`
        );
      }

      if (input.amount !== undefined && Math.abs(input.amount - existing.totalPrice) > 0.001) {
        throw new AppError(
          400,
          "PAYMENT_AMOUNT_MISMATCH",
          `Payment amount (${input.amount}) does not match order quote (${existing.totalPrice}).`
        );
      }

      const now = new Date().toISOString();
      const payment: PaymentRecord = {
        id: store.generateId("pay"),
        orderId: existing.id,
        provider: input.provider,
        transactionId: input.transactionId,
        idempotencyKey,
        amount: existing.totalPrice,
        status: "VERIFIED",
        verifiedAt: now
      };

      const updated: PrintOrder = {
        ...existing,
        status: "PAID",
        payment,
        updatedAt: now
      };

      store.paymentsByKey.set(idempotencyKey, payment);
      store.orders.set(updated.id, updated);

      res.status(200).json({
        data: updated,
        payment,
        idempotent: false
      });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/orders/:id — Delete a DRAFT order (Owner Student only)
  router.delete("/:id", requireRoles("STUDENT"), (req, res, next) => {
    try {
      const existing = store.orders.get(req.params.id);
      if (!existing) {
        throw new AppError(404, "ORDER_NOT_FOUND", "Print order not found.");
      }

      const user = req.user!;
      if (existing.studentId !== user.id) {
        throw new AppError(403, "FORBIDDEN", "Students can only delete their own draft orders.");
      }
      if (existing.status !== "DRAFT") {
        throw new AppError(
          409,
          "ORDER_NOT_DELETABLE",
          `Only DRAFT orders can be deleted. Current status is '${existing.status}'.`
        );
      }

      store.orders.delete(existing.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
