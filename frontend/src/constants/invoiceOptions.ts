export const PAYMENT_MODE_OPTIONS = ['Cash', 'Card', 'UPI', 'Insurance', 'Cheque'] as const;

export type PaymentModeOption = (typeof PAYMENT_MODE_OPTIONS)[number];
