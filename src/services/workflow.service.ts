import { AppError } from "../middleware/errorHandler";
import type { OrderStatus, Role } from "../types/domain";

interface TransitionRule {
  from: OrderStatus;
  to: OrderStatus;
  allowedRoles: Role[];
  requiresRejectionReason?: boolean;
}

/**
 * Authorized PrintOrder status workflow (Proposal Section 5):
 * Draft -> Submitted -> Awaiting payment -> Paid (via verified payment endpoint)
 * -> Printing -> Ready -> Collected
 * Staff/Admin may reject Submitted orders with a reason.
 * Students may cancel Draft, Submitted, or Awaiting payment orders before payment.
 */
const TRANSITION_RULES: TransitionRule[] = [
  { from: "DRAFT", to: "SUBMITTED", allowedRoles: ["STUDENT"] },
  { from: "DRAFT", to: "CANCELLED", allowedRoles: ["STUDENT"] },
  { from: "SUBMITTED", to: "CANCELLED", allowedRoles: ["STUDENT"] },
  { from: "AWAITING_PAYMENT", to: "CANCELLED", allowedRoles: ["STUDENT"] },
  { from: "SUBMITTED", to: "AWAITING_PAYMENT", allowedRoles: ["STAFF", "ADMIN"] },
  {
    from: "SUBMITTED",
    to: "REJECTED",
    allowedRoles: ["STAFF", "ADMIN"],
    requiresRejectionReason: true
  },
  { from: "PAID", to: "PRINTING", allowedRoles: ["STAFF", "ADMIN"] },
  { from: "PRINTING", to: "READY", allowedRoles: ["STAFF", "ADMIN"] },
  { from: "READY", to: "COLLECTED", allowedRoles: ["STAFF", "ADMIN"] }
];

export function validateStatusTransition(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus,
  actorRole: Role,
  rejectionReason?: string
): void {
  if (nextStatus === "PAID") {
    throw new AppError(
      409,
      "PAYMENT_VERIFICATION_REQUIRED",
      "Orders can only advance to PAID through the verified payment endpoint (/api/orders/:id/pay)."
    );
  }

  const rule = TRANSITION_RULES.find(
    (item) => item.from === currentStatus && item.to === nextStatus
  );

  if (!rule) {
    throw new AppError(
      409,
      "INVALID_STATUS_TRANSITION",
      `Cannot transition order from '${currentStatus}' to '${nextStatus}'.`
    );
  }

  if (!rule.allowedRoles.includes(actorRole)) {
    throw new AppError(
      403,
      "FORBIDDEN_TRANSITION",
      `Role '${actorRole}' is not authorized to transition order from '${currentStatus}' to '${nextStatus}'.`
    );
  }

  if (rule.requiresRejectionReason && (!rejectionReason || rejectionReason.trim().length < 3)) {
    throw new AppError(
      400,
      "REJECTION_REASON_REQUIRED",
      "A rejectionReason (at least 3 characters) is required when rejecting an order."
    );
  }
}
