export interface Category {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  categoryId: string;
  createdAt: string;
}

export type ReceiptStatus = 'processing' | 'parsed' | 'failed';

/** One line item extracted from a receipt image by the parsing model. */
export interface ReceiptLineItem {
  description: string;
  amountCents: number;
  suggestedCategoryId: string | null;
}

/** An uploaded receipt image and the state of its AI parsing job. */
export interface Receipt {
  id: string;
  status: ReceiptStatus;
  merchant?: string;
  date?: string;
  items?: ReceiptLineItem[];
  error?: string;
  createdAt: string;
}

/** Card or bank an alert email came from. */
export type IngestSource = 'amex' | 'rbc';

/**
 * Which path read the alert: a per-issuer template, or the model fallback.
 * Model-derived rows are shown as unverified, because a template match is an
 * exact structural match while the model is making a judgement.
 */
export type IngestParser = 'template' | 'model';

/**
 * A transaction read out of an alert email, waiting for the user to confirm it.
 *
 * `merchantRaw` is what the issuer wrote and is what the UI shows;
 * `merchantSanitized` is the collapsed form used for deduplication and for
 * looking up a learned category, and is not meant to be read.
 */
export interface PendingTransaction {
  id: string;
  date: string;
  amountCents: number;
  currency: string;
  merchantRaw: string;
  merchantSanitized: string;
  suggestedCategoryId: string | null;
  source: IngestSource;
  parser: IngestParser;
  createdAt: string;
}

/** The address alerts are forwarded to, and the sender permitted to use it. */
export interface IngestAlias {
  address: string;
  forwardFrom?: string;
  createdAt: string;
}
