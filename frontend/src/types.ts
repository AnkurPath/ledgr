export type ApiStatus = {
  status: string;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
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

export type Tag = {
  id: string;
  user_id: string | null;
  is_global: boolean;
  name: string;
  is_active: boolean;
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type Goal = {
  id: string;
  user_id: string;
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

export type UpdateGoalPayload = {
  target_amount?: string;
  current_amount?: string;
  target_date?: string | null;
};

export type GoalTemplate = {
  name: string;
  target_amount: string;
};

export type NetWorthHistoryPoint = {
  date: string;
  net_worth: string;
};

export type NetWorthOverview = {
  net_worth: string;
  accounts_value: string;
  mutual_funds_value: string;
  stocks_value: string;
  international_value: string;
  as_of: string;
  history: NetWorthHistoryPoint[];
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
  tag_id: string | number | null;
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
  tag_id?: string | number | null;
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

export type MutualFundSearchItem = {
  scheme_code: number;
  scheme_name: string;
  fund_house: string | null;
  nav: string | null;
  date: string | null;
};

export type CreateMutualFundInvestmentPayload = {
  scheme_code: number;
  goal_id?: string | null;
  category_option_id?: string | null;
  units: string;
  avg_price: string;
};

export type UpdateMutualFundInvestmentPayload = {
  units: string;
  avg_price: string;
  goal_id?: string | null;
  category_option_id?: string | null;
};

export type MutualFundInvestment = {
  id: string;
  user_id: string;
  scheme_code: number;
  goal_id: string | null;
  category_option_id: string | null;
  units: string;
  avg_price: string;
  created_at: string;
  updated_at: string;
};

export type MutualFundPortfolioHolding = {
  id: string;
  scheme_code: number;
  goal_id: string | null;
  goal_name: string | null;
  category_option_id: string | null;
  category_name: string | null;
  scheme_name: string;
  fund_house: string | null;
  units: string;
  avg_price: string;
  nav: string | null;
  nav_date: string | null;
  invested_amount: string;
  current_value: string;
  pnl: string;
  pnl_percent: string;
};

export type MutualFundPortfolio = {
  holdings: MutualFundPortfolioHolding[];
  total_invested_amount: string;
  total_current_value: string;
  total_pnl: string;
  total_pnl_percent: string;
};

export type CreateStockInvestmentPayload = {
  symbol: string;
  company_name?: string | null;
  exchange?: string | null;
  goal_id?: string | null;
  sector_option_id?: string | null;
  quantity: string;
  avg_price: string;
  current_price?: string;
};

export type UpdateStockInvestmentPayload = {
  quantity: string;
  avg_price: string;
  current_price?: string;
  goal_id?: string | null;
  sector_option_id?: string | null;
};

export type StockInvestment = {
  id: string;
  user_id: string;
  goal_id: string | null;
  sector_option_id: string | null;
  symbol: string;
  company_name: string | null;
  exchange: string | null;
  quantity: string;
  avg_price: string;
  current_price: string;
  created_at: string;
  updated_at: string;
};

export type StockPortfolioHolding = {
  id: string;
  symbol: string;
  company_name: string | null;
  exchange: string | null;
  goal_id: string | null;
  goal_name: string | null;
  sector_option_id: string | null;
  sector_name: string | null;
  quantity: string;
  avg_price: string;
  current_price: string;
  invested_amount: string;
  current_value: string;
  pnl: string;
  pnl_percent: string;
};

export type StockPortfolio = {
  holdings: StockPortfolioHolding[];
  total_invested_amount: string;
  total_current_value: string;
  total_pnl: string;
  total_pnl_percent: string;
};

export type CurrentPrice = {
  symbol: string;
  market_symbol: string;
  current_price: string;
  name?: string | null;
};

export type InvestmentPriceRefresh = {
  nav_refreshed: boolean;
  latest_nav_date: string | null;
  nav_fetched: number;
  nav_updated: number;
  nav_inserted: number;
  nav_skipped: number;
  nav_failed: number;
  stocks_total: number;
  stocks_updated: number;
  stocks_failed: number;
  international_total: number;
  international_updated: number;
  international_failed: number;
};

export type InvestmentOption = {
  id: string;
  asset_type: string;
  field_name: string;
  display_name: string;
  sort_order: number;
  is_active: boolean;
};

export type InvestmentOptionsCatalog = {
  stock_sectors: InvestmentOption[];
  international_sectors: InvestmentOption[];
  mutual_fund_categories: InvestmentOption[];
};

export type CreateInternationalInvestmentPayload = {
  symbol: string;
  security_name?: string | null;
  market?: string;
  instrument_type?: "stock" | "index";
  goal_id?: string | null;
  sector_option_id?: string | null;
  quantity: string;
  avg_price: string;
  current_price?: string;
};

export type UpdateInternationalInvestmentPayload = {
  quantity: string;
  avg_price: string;
  current_price?: string;
  goal_id?: string | null;
  sector_option_id?: string | null;
};

export type InternationalInvestment = {
  id: string;
  user_id: string;
  goal_id: string | null;
  sector_option_id: string | null;
  symbol: string;
  security_name: string | null;
  market: string;
  instrument_type: "stock" | "index";
  quantity: string;
  avg_price: string;
  current_price: string;
  created_at: string;
  updated_at: string;
};

export type InternationalPortfolioHolding = {
  id: string;
  symbol: string;
  security_name: string | null;
  market: string;
  instrument_type: "stock" | "index";
  goal_id: string | null;
  goal_name: string | null;
  sector_option_id: string | null;
  sector_name: string | null;
  quantity: string;
  avg_price: string;
  current_price: string;
  invested_amount: string;
  current_value: string;
  pnl: string;
  pnl_percent: string;
};

export type InternationalPortfolio = {
  holdings: InternationalPortfolioHolding[];
  total_invested_amount: string;
  total_current_value: string;
  total_pnl: string;
  total_pnl_percent: string;
};
