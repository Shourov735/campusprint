export const AUTH_HEADERS = {
  student1: { "x-user-id": "student-1609" },
  student2: { "x-user-id": "student-1605" },
  staff: { "x-user-id": "staff-01" },
  admin: { "x-user-id": "admin-01" }
} as const;

export function buildSampleOrderPayload(overrides: Record<string, unknown> = {}) {
  return {
    document: {
      fileName: "thesis-draft.pdf",
      mimeType: "application/pdf",
      pageCount: 20,
      sizeBytes: 1_240_000
    },
    copies: 2,
    optionIds: ["opt-a4-bw", "opt-spiral-bind"],
    notes: "Please use blue back cover if available",
    ...overrides
  };
}
