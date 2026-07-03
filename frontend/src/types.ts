export type ApiStatus = {
  status: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
};

export type UserProfile = {
  email: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
  first_name?: string | null;
  last_name?: string | null;
  age?: number | null;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type AccountType = "bank account" | "credit card" | "wallet";
export type Currency = "INR";
export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER" | "INVESTMENT" | "REFUND";
export type CategoryKind = "income" | "expense" | "transfer" | "investment" | "refund";

export type Account = {
  id: number;
  user_id: number;
  name: string;
  account_type: AccountType;
  opening_balance: string;
  current_balance: string;
  currency: Currency;
  card_number: string | null;
  expiration_date: string | null;
  credit_limit: string | null;
  billing_cycle_start: number | null;
  billing_cycle_end: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
};

export type CreateAccountPayload = {
  name: string;
  account_type: AccountType;
  opening_balance?: string;
  currency?: Currency;
  card_number?: string | null;
  expiration_date?: string | null;
  credit_limit?: string | null;
  billing_cycle_start?: number | null;
  billing_cycle_end?: number | null;
  notes?: string | null;
};

export type UpdateAccountPayload = Partial<CreateAccountPayload>;

export type SetupDefaultOpeningBalancesPayload = {
  cash_opening_balance: string;
  pending_from_friends_opening_balance: string;
};

export type Category = {
  id: number;
  user_id: number | null;
  is_global: boolean;
  kind: CategoryKind;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CategoryGroups = Record<CategoryKind, Category[]>;

export type Goal = {
  id: number;
  user_id: number;
  name: string;
  target_amount: string;
  current_amount: string;
  target_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Budget = {
  id: number;
  user_id: number;
  name: string;
  amount: string;
  category_id: number | null;
  start_date: string;
  end_date: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  spent_amount: string;
  remaining_amount: string;
};

export type CreateGoalPayload = {
  name: string;
  target_amount: string;
  current_amount?: string;
  target_date?: string | null;
};

export type CreateBudgetPayload = {
  name: string;
  amount: string;
  category_id?: number | null;
  start_date: string;
  end_date: string;
  notes?: string | null;
};

export type Transaction = {
  id: number;
  user_id: number;
  date: string;
  merchant: string | null;
  product: string | null;
  amount: string;
  account_id: number;
  transaction_type: TransactionType;
  category_id: number | null;
  tag_id: number | null;
  goal_id: number | null;
  notes: string | null;
  bills: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateTransactionPayload = {
  date: string;
  merchant?: string | null;
  product?: string | null;
  amount: string;
  account_id?: number | null;
  source_account_id?: number | null;
  destination_account_id?: number | null;
  transaction_type: TransactionType;
  category_id?: number | null;
  tag_id?: number | null;
  goal_id?: number | null;
  notes?: string | null;
  bills?: string | null;
};

export type UpdateTransactionPayload = Partial<CreateTransactionPayload>;

export type CreateTransactionResponse = {
  message: string;
  transactions: Transaction[];
  amount_transferred: string | null;
};
