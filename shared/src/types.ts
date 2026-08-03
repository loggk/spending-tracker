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
