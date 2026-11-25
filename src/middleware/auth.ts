import type { NextFunction, Request, Response } from "express";
import { SEED_USERS } from "../store/memoryStore";
import type { AuthUser, Role } from "../types/domain";
import { AppError } from "./errorHandler";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const VALID_ROLES: ReadonlySet<string> = new Set(["STUDENT", "STAFF", "ADMIN"]);

/**
 * Lightweight role-based authentication middleware.
 * Accepts either:
 *   - `x-user-id` matching a known seed user (e.g. student-1609, staff-01, admin-01), OR
 *   - `x-user-id` + `x-user-role` (STUDENT | STAFF | ADMIN) for custom test actors.
 * Designed to be swapped cleanly with Passport.js / session auth in later milestones.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const userIdHeader = req.header("x-user-id")?.trim();
  const roleHeader = req.header("x-user-role")?.trim().toUpperCase();

  if (!userIdHeader) {
    next(new AppError(401, "UNAUTHORIZED", "Authentication required. Provide x-user-id header."));
    return;
  }

  const seeded = SEED_USERS[userIdHeader];
  if (seeded) {
    if (roleHeader && roleHeader !== seeded.role) {
      next(new AppError(403, "ROLE_MISMATCH", "Provided role does not match user account."));
      return;
    }
    req.user = seeded;
    next();
    return;
  }

  if (!roleHeader || !VALID_ROLES.has(roleHeader)) {
    next(
      new AppError(
        401,
        "UNAUTHORIZED",
        "Unknown user. Provide a valid x-user-role (STUDENT, STAFF, ADMIN) alongside x-user-id."
      )
    );
    return;
  }

  req.user = {
    id: userIdHeader,
    name: userIdHeader,
    email: `${userIdHeader}@campusprint.local`,
    role: roleHeader as Role
  };
  next();
}

export function requireRoles(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHORIZED", "Authentication required."));
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(
        new AppError(
          403,
          "FORBIDDEN",
          `Role '${req.user.role}' is not permitted to perform this action.`
        )
      );
      return;
    }
    next();
  };
}
