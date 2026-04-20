export type QuoteStatus = "draft" | "sent" | "approved" | "rejected" | "cancelled";

export type QuoteSummary = {
  id: string;
  customerName: string;
  status: QuoteStatus;
  total: number;
  updatedAt: string;
};
