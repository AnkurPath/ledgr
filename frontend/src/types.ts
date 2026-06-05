export type ApiStatus = {
  status: string;
};

export type User = {
  id: number;
  username: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Account = {
  id: number;
  user_id: number;
  name: string;
  account_type: string | null;
  opening_balance: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CategoryKind = "income" | "non_income" | "expense" | "non_expense";

export type Category = {
  id: number;
  user_id: number;
  name: string;
  kind: CategoryKind;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Tag = {
  id: number;
  user_id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Expense = {
  id: number;
  expense_date: string;
  description: string;
  amount: string;
  category: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyExpenseSummary = {
  expense_date: string;
  total_amount: string;
  expense_count: number;
};

export type ExpenseCreate = {
  expense_date: string;
  description: string;
  amount: string;
  category?: string | null;
  payment_method?: string | null;
  notes?: string | null;
};
