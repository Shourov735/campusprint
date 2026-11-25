import { randomUUID } from "node:crypto";
import type { AuthUser, PaymentRecord, PrintOption, PrintOrder } from "../types/domain";

export const SEED_USERS: Record<string, AuthUser> = {
  "student-1609": {
    id: "student-1609",
    name: "Md Shourov",
    email: "bsse1609@iit.du.ac.bd",
    role: "STUDENT",
    rollNumber: "1609"
  },
  "student-1605": {
    id: "student-1605",
    name: "Rokib Ikbal",
    email: "bsse1605@iit.du.ac.bd",
    role: "STUDENT",
    rollNumber: "1605"
  },
  "staff-01": {
    id: "staff-01",
    name: "Campus Print Operator",
    email: "staff@campusprint.iit.du.ac.bd",
    role: "STAFF"
  },
  "admin-01": {
    id: "admin-01",
    name: "CampusPrint Admin",
    email: "admin@campusprint.iit.du.ac.bd",
    role: "ADMIN"
  }
};

function createSeedOptions(): PrintOption[] {
  const now = new Date("2026-11-01T09:00:00.000Z").toISOString();
  return [
    {
      id: "opt-a4-bw",
      code: "A4_BW",
      name: "A4 Black & White",
      category: "COLOR",
      pricingUnit: "PER_PAGE",
      unitPrice: 2,
      available: true,
      description: "Standard 80gsm A4 monochrome laser print",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "opt-a4-color",
      code: "A4_COLOR",
      name: "A4 Full Color",
      category: "COLOR",
      pricingUnit: "PER_PAGE",
      unitPrice: 8,
      available: true,
      description: "High-resolution A4 color print",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "opt-double-sided",
      code: "DUPLEX",
      name: "Double-Sided Printing",
      category: "SIDES",
      pricingUnit: "PER_PAGE",
      unitPrice: 0.5,
      available: true,
      description: "Duplex alignment handling per page",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "opt-spiral-bind",
      code: "SPIRAL_BIND",
      name: "Spiral Binding",
      category: "BINDING",
      pricingUnit: "FLAT",
      unitPrice: 35,
      available: true,
      description: "Plastic coil binding with clear front cover (per copy)",
      createdAt: now,
      updatedAt: now
    }
  ];
}

export class MemoryStore {
  public printOptions = new Map<string, PrintOption>();
  public orders = new Map<string, PrintOrder>();
  public paymentsByKey = new Map<string, PaymentRecord>();

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.printOptions.clear();
    this.orders.clear();
    this.paymentsByKey.clear();

    for (const option of createSeedOptions()) {
      this.printOptions.set(option.id, { ...option });
    }
  }

  public generateId(prefix: string): string {
    return `${prefix}-${randomUUID().slice(0, 8)}`;
  }

  public generateCollectionCode(): string {
    return `CP-${Math.floor(100000 + Math.random() * 900000)}`;
  }

  public isOptionReferencedByActiveOrder(optionId: string): boolean {
    for (const order of this.orders.values()) {
      if (order.status === "CANCELLED" || order.status === "REJECTED") {
        continue;
      }
      if (order.options.some((opt) => opt.printOptionId === optionId)) {
        return true;
      }
    }
    return false;
  }
}
