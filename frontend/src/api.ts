import type {
  Account,
  ApiStatus,
  CategoryGroups,
  Budget,
  CurrentPrice,
  CreateAccountPayload,
  CreateBudgetPayload,
  CreateGoalPayload,
  CreateInternationalInvestmentPayload,
  UpdateGoalPayload,
  CreateMutualFundInvestmentPayload,
  CreateStockInvestmentPayload,
  CreateTransactionPayload,
  CreateTransactionResponse,
  SetupDefaultOpeningBalancesPayload,
  UpdateAccountPayload,
  UpdateInternationalInvestmentPayload,
  UpdateMutualFundInvestmentPayload,
  UpdateStockInvestmentPayload,
  UpdateTransactionPayload,
  Goal,
  GoalTemplate,
  InvestmentOptionsCatalog,
  LoginPayload,
  MutualFundInvestment,
  MutualFundPortfolio,
  MutualFundSearchItem,
  NetWorthOverview,
  RegisterPayload,
  TokenResponse,
  Transaction,
  UserProfile,
  StockInvestment,
  StockPortfolio,
  InternationalInvestment,
  InternationalPortfolio,
  Tag
} from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export const accessTokenStorageKey = "ledgr_access_token";
export const refreshTokenStorageKey = "ledgr_refresh_token";
export const tokensRefreshedEvent = "ledgr:tokens-refreshed";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  formBody?: URLSearchParams;
  token?: string | null;
  skipAuthRefresh?: boolean;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function buildUrl(path: string) {
  return new URL(`${apiBaseUrl}${path}`, window.location.origin);
}

export function persistTokens(response: TokenResponse) {
  localStorage.setItem(accessTokenStorageKey, response.access_token);
  localStorage.setItem(refreshTokenStorageKey, response.refresh_token);
  window.dispatchEvent(new CustomEvent(tokensRefreshedEvent, { detail: response.access_token }));
}

export function clearStoredTokens() {
  localStorage.removeItem(accessTokenStorageKey);
  localStorage.removeItem(refreshTokenStorageKey);
}

let refreshInFlight: Promise<TokenResponse | null> | null = null;

async function refreshAccessToken(): Promise<TokenResponse | null> {
  const refreshToken = localStorage.getItem(refreshTokenStorageKey);
  if (!refreshToken) {
    return null;
  }

  if (!refreshInFlight) {
    refreshInFlight = request<TokenResponse>("/users/refresh", {
      method: "POST",
      body: { refresh_token: refreshToken },
      skipAuthRefresh: true
    })
      .then((tokens) => {
        persistTokens(tokens);
        return tokens;
      })
      .catch(() => {
        clearStoredTokens();
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();
  let body: BodyInit | undefined;

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  if (options.formBody !== undefined) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
    body = options.formBody;
  }

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(buildUrl(path), {
    method: options.method ?? "GET",
    headers,
    body
  });

  if (response.status === 401 && options.token && !options.skipAuthRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, {
        ...options,
        token: refreshed.access_token,
        skipAuthRefresh: true
      });
    }
  }

  if (!response.ok) {
    let message = response.statusText;
    try {
      const errorBody = (await response.json()) as { detail?: unknown };
      if (typeof errorBody.detail === "string") {
        message = errorBody.detail;
      } else if (Array.isArray(errorBody.detail)) {
        message = errorBody.detail.map((item) => item.msg ?? "Validation error").join(", ");
      }
    } catch {
      // Keep the HTTP status text when the backend did not return JSON.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  health: () => request<ApiStatus>("/health"),
  register: (body: RegisterPayload) => request<TokenResponse>("/users/register", { method: "POST", body }),
  login: (body: LoginPayload) => {
    const formBody = new URLSearchParams();
    formBody.set("username", body.email);
    formBody.set("password", body.password);
    return request<TokenResponse>("/users/token", { method: "POST", formBody });
  },
  refresh: (refreshToken: string) =>
    request<TokenResponse>("/users/refresh", {
      method: "POST",
      body: { refresh_token: refreshToken },
      skipAuthRefresh: true
    }),
  logout: (refreshToken: string) =>
    request<void>("/users/logout", {
      method: "POST",
      body: { refresh_token: refreshToken },
      skipAuthRefresh: true
    }),
  me: (token: string) => request<UserProfile>("/users/me", { token }),
  listAccounts: (token: string) => request<Account[]>("/users/setup/accounts", { token }),
  getNetWorth: (token: string, days = 30) =>
    request<NetWorthOverview>(`/users/net-worth?days=${encodeURIComponent(String(days))}`, { token }),
  createAccount: (token: string, body: CreateAccountPayload) =>
    request<Account>("/users/setup/accounts", { method: "POST", token, body }),
  setupDefaultOpeningBalances: (token: string, body: SetupDefaultOpeningBalancesPayload) =>
    request<Account[]>("/users/setup/accounts/defaults/opening-balances", { method: "PATCH", token, body }),
  updateAccount: (token: string, accountId: number, body: UpdateAccountPayload) =>
    request<Account>(`/users/setup/accounts/${accountId}`, { method: "PATCH", token, body }),
  listCategories: (token: string) => request<CategoryGroups>("/users/setup/categories", { token }),
  listTags: (token: string) => request<Tag[]>("/users/setup/tags", { token }),
  listGoals: (token: string) => request<Goal[]>("/goals", { token }),
  listGoalTemplates: (token: string) => request<GoalTemplate[]>("/goals/templates", { token }),
  createGoal: (token: string, body: CreateGoalPayload) =>
    request<Goal>("/goals", { method: "POST", token, body }),
  updateGoal: (token: string, goalId: string, body: UpdateGoalPayload) =>
    request<Goal>(`/goals/${goalId}`, { method: "PATCH", token, body }),
  listBudgets: (token: string) => request<Budget[]>("/users/setup/budgets", { token }),
  createBudget: (token: string, body: CreateBudgetPayload) =>
    request<Budget>("/users/setup/budgets", { method: "POST", token, body }),
  listTransactions: (token: string) => request<Transaction[]>("/transactions", { token }),
  createTransaction: (token: string, body: CreateTransactionPayload) =>
    request<CreateTransactionResponse>("/transactions", { method: "POST", token, body }),
  updateTransaction: (token: string, transactionId: number, body: UpdateTransactionPayload) =>
    request<Transaction>(`/transactions/${transactionId}`, { method: "PATCH", token, body }),
  searchMutualFunds: (token: string, query: string, limit = 20) =>
    request<MutualFundSearchItem[]>(
      `/investments/mutual-funds/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}`,
      { token }
    ),
  createMutualFundInvestment: (token: string, body: CreateMutualFundInvestmentPayload) =>
    request<MutualFundInvestment>("/investments/mutual-funds", { method: "POST", token, body }),
  updateMutualFundInvestment: (token: string, investmentId: string, body: UpdateMutualFundInvestmentPayload) =>
    request<MutualFundInvestment>(`/investments/mutual-funds/${investmentId}`, { method: "PATCH", token, body }),
  listMutualFundPortfolio: (token: string) => request<MutualFundPortfolio>("/investments/mutual-funds", { token }),
  createStockInvestment: (token: string, body: CreateStockInvestmentPayload) =>
    request<StockInvestment>("/investments/stocks", { method: "POST", token, body }),
  updateStockInvestment: (token: string, investmentId: string, body: UpdateStockInvestmentPayload) =>
    request<StockInvestment>(`/investments/stocks/${investmentId}`, { method: "PATCH", token, body }),
  listStockPortfolio: (token: string) => request<StockPortfolio>("/investments/stocks", { token }),
  fetchStockCurrentPrice: (token: string, symbol: string, exchange?: string) =>
    request<CurrentPrice>(
      `/investments/stocks/current-price?symbol=${encodeURIComponent(symbol)}${exchange ? `&exchange=${encodeURIComponent(exchange)}` : ""}`,
      { token }
    ),
  createInternationalInvestment: (token: string, body: CreateInternationalInvestmentPayload) =>
    request<InternationalInvestment>("/investments/international", { method: "POST", token, body }),
  updateInternationalInvestment: (token: string, investmentId: string, body: UpdateInternationalInvestmentPayload) =>
    request<InternationalInvestment>(`/investments/international/${investmentId}`, { method: "PATCH", token, body }),
  listInternationalPortfolio: (token: string) => request<InternationalPortfolio>("/investments/international", { token }),
  fetchInternationalCurrentPrice: (token: string, symbol: string) =>
    request<CurrentPrice>(`/investments/international/current-price?symbol=${encodeURIComponent(symbol)}`, { token }),
  listInvestmentOptions: (token: string) => request<InvestmentOptionsCatalog>("/investments/options", { token })
};
