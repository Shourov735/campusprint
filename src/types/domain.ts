export type Role = "STUDENT" | "STAFF" | "ADMIN";

export type OptionCategory = "PAPER" | "COLOR" | "SIDES" | "BINDING";

export type PricingUnit = "PER_PAGE" | "FLAT";

export type OrderStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "PRINTING"
  | "READY"
  | "COLLECTED"
  | "REJECTED"
  | "CANCELLED";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  rollNumber?: string;
}

export interface DocumentMetadata {
  id: string;
  fileName: string;
  mimeType: "application/pdf";
  pageCount: number;
  sizeBytes: number;
}

export interface PrintOption {
  id: string;
  code: string;
  name: string;
  category: OptionCategory;
  pricingUnit: PricingUnit;
  unitPrice: number;
  available: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderOptionSnapshot {
  printOptionId: string;
  code: string;
  name: string;
  category: OptionCategory;
  pricingUnit: PricingUnit;
  unitPrice: number;
  lineTotal: number;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  provider: string;
  transactionId: string;
  idempotencyKey: string;
  amount: number;
  status: "VERIFIED";
  verifiedAt: string;
}

export interface PrintOrder {
  id: string;
  studentId: string;
  document: DocumentMetadata;
  copies: number;
  notes?: string;
  status: OrderStatus;
  options: OrderOptionSnapshot[];
  totalPrice: number;
  collectionCode?: string;
  rejectionReason?: string;
  payment?: PaymentRecord;
  createdAt: string;
  updatedAt: string;
}
