import { AppError } from "../middleware/errorHandler";
import type { MemoryStore } from "../store/memoryStore";
import type { OrderOptionSnapshot } from "../types/domain";

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface CalculatedQuote {
  options: OrderOptionSnapshot[];
  totalPrice: number;
}

/**
 * Resolves selected PrintOptions, verifies availability, and calculates
 * an immutable quote snapshot for a PrintOrder.
 */
export function calculateOrderQuote(
  store: MemoryStore,
  optionIds: string[],
  pageCount: number,
  copies: number
): CalculatedQuote {
  const snapshots: OrderOptionSnapshot[] = [];
  let total = 0;

  for (const optionId of optionIds) {
    const option = store.printOptions.get(optionId);
    if (!option) {
      throw new AppError(400, "INVALID_PRINT_OPTION", `Print option '${optionId}' does not exist.`);
    }
    if (!option.available) {
      throw new AppError(
        409,
        "OPTION_UNAVAILABLE",
        `Print option '${option.name}' is currently unavailable.`
      );
    }

    const lineTotal =
      option.pricingUnit === "PER_PAGE"
        ? roundCurrency(option.unitPrice * pageCount * copies)
        : roundCurrency(option.unitPrice * copies);

    snapshots.push({
      printOptionId: option.id,
      code: option.code,
      name: option.name,
      category: option.category,
      pricingUnit: option.pricingUnit,
      unitPrice: option.unitPrice,
      lineTotal
    });
    total = roundCurrency(total + lineTotal);
  }

  return {
    options: snapshots,
    totalPrice: total
  };
}
