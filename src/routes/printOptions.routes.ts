import { Router } from "express";
import { authenticate, requireRoles } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import type { MemoryStore } from "../store/memoryStore";
import type { PrintOption } from "../types/domain";
import {
  createPrintOptionSchema,
  listPrintOptionsQuerySchema,
  patchPrintOptionSchema,
  replacePrintOptionSchema
} from "../validators/printOption.schema";

export function createPrintOptionsRouter(store: MemoryStore): Router {
  const router = Router();

  // GET /api/print-options — List print & binding options with filtering, sorting, and pagination
  router.get("/", (req, res, next) => {
    try {
      const query = listPrintOptionsQuerySchema.parse(req.query);
      let items = Array.from(store.printOptions.values());

      if (query.category) {
        items = items.filter((opt) => opt.category === query.category);
      }
      if (query.available !== undefined) {
        items = items.filter((opt) => opt.available === query.available);
      }

      const direction = query.order === "asc" ? 1 : -1;
      items.sort((a, b) => {
        if (query.sortBy === "unitPrice") {
          return (a.unitPrice - b.unitPrice) * direction;
        }
        if (query.sortBy === "createdAt") {
          return a.createdAt.localeCompare(b.createdAt) * direction;
        }
        return a.name.localeCompare(b.name) * direction;
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

  // GET /api/print-options/:id — Get single print option details
  router.get("/:id", (req, res, next) => {
    try {
      const option = store.printOptions.get(req.params.id);
      if (!option) {
        throw new AppError(404, "PRINT_OPTION_NOT_FOUND", "Print option not found.");
      }
      res.status(200).json({ data: option });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/print-options — Create a new print or binding option (Admin only)
  router.post("/", authenticate, requireRoles("ADMIN"), (req, res, next) => {
    try {
      const input = createPrintOptionSchema.parse(req.body);

      const duplicate = Array.from(store.printOptions.values()).find(
        (opt) => opt.code === input.code
      );
      if (duplicate) {
        throw new AppError(
          409,
          "DUPLICATE_OPTION_CODE",
          `Print option with code '${input.code}' already exists.`
        );
      }

      const now = new Date().toISOString();
      const created: PrintOption = {
        id: store.generateId("opt"),
        code: input.code,
        name: input.name,
        category: input.category,
        pricingUnit: input.pricingUnit,
        unitPrice: input.unitPrice,
        available: input.available,
        ...(input.description !== undefined ? { description: input.description } : {}),
        createdAt: now,
        updatedAt: now
      };

      store.printOptions.set(created.id, created);
      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/print-options/:id — Full replacement of a print option (Admin only)
  router.put("/:id", authenticate, requireRoles("ADMIN"), (req, res, next) => {
    try {
      const existing = store.printOptions.get(req.params.id);
      if (!existing) {
        throw new AppError(404, "PRINT_OPTION_NOT_FOUND", "Print option not found.");
      }

      const input = replacePrintOptionSchema.parse(req.body);
      const duplicate = Array.from(store.printOptions.values()).find(
        (opt) => opt.code === input.code && opt.id !== existing.id
      );
      if (duplicate) {
        throw new AppError(
          409,
          "DUPLICATE_OPTION_CODE",
          `Print option with code '${input.code}' already exists.`
        );
      }

      const updated: PrintOption = {
        id: existing.id,
        code: input.code,
        name: input.name,
        category: input.category,
        pricingUnit: input.pricingUnit,
        unitPrice: input.unitPrice,
        available: input.available,
        ...(input.description !== undefined ? { description: input.description } : {}),
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString()
      };

      store.printOptions.set(updated.id, updated);
      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/print-options/:id — Partial update of a print option (Admin only)
  router.patch("/:id", authenticate, requireRoles("ADMIN"), (req, res, next) => {
    try {
      const existing = store.printOptions.get(req.params.id);
      if (!existing) {
        throw new AppError(404, "PRINT_OPTION_NOT_FOUND", "Print option not found.");
      }

      const input = patchPrintOptionSchema.parse(req.body);
      if (input.code) {
        const duplicate = Array.from(store.printOptions.values()).find(
          (opt) => opt.code === input.code && opt.id !== existing.id
        );
        if (duplicate) {
          throw new AppError(
            409,
            "DUPLICATE_OPTION_CODE",
            `Print option with code '${input.code}' already exists.`
          );
        }
      }

      const updated: PrintOption = {
        ...existing,
        ...input,
        updatedAt: new Date().toISOString()
      };

      store.printOptions.set(updated.id, updated);
      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/print-options/:id — Delete a print option (Admin only)
  router.delete("/:id", authenticate, requireRoles("ADMIN"), (req, res, next) => {
    try {
      const existing = store.printOptions.get(req.params.id);
      if (!existing) {
        throw new AppError(404, "PRINT_OPTION_NOT_FOUND", "Print option not found.");
      }

      if (store.isOptionReferencedByActiveOrder(existing.id)) {
        throw new AppError(
          409,
          "OPTION_IN_USE",
          "Cannot delete a print option referenced by active orders. Mark it unavailable instead."
        );
      }

      store.printOptions.delete(existing.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
