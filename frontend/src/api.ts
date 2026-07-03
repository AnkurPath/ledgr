import type {
  Account,
  ApiStatus,
  CategoryGroups,
  Budget,
  CreateAccountPayload,
  CreateBudgetPayload,
  CreateGoalPayload,
  CreateTransactionPayload,
  CreateTransactionResponse,
  SetupDefaultOpeningBalancesPayload,
  UpdateAccountPayload,
  UpdateTransactionPayload,
  Goal,
  LoginPayload,
  RegisterPayload,
  TokenResponse,
  Transaction,
  UserProfile
} from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  formBody?: URLSearchParams;
  token?: string | null;
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
  me: (token: string) => request<UserProfile>("/users/me", { token }),
  listAccounts: (token: string) => request<Account[]>("/users/setup/accounts", { token }),
  createAccount: (token: string, body: CreateAccountPayload) =>
    request<Account>("/users/setup/accounts", { method: "POST", token, body }),
  setupDefaultOpeningBalances: (token: string, body: SetupDefaultOpeningBalancesPayload) =>
    request<Account[]>("/users/setup/accounts/defaults/opening-balances", { method: "PATCH", token, body }),
  updateAccount: (token: string, accountId: number, body: UpdateAccountPayload) =>
    request<Account>(`/users/setup/accounts/${accountId}`, { method: "PATCH", token, body }),
  listCategories: (token: string) => request<CategoryGroups>("/users/setup/categories", { token }),
  listGoals: (token: string) => request<Goal[]>("/users/setup/goals", { token }),
  createGoal: (token: string, body: CreateGoalPayload) =>
    request<Goal>("/users/setup/goals", { method: "POST", token, body }),
  listBudgets: (token: string) => request<Budget[]>("/users/setup/budgets", { token }),
  createBudget: (token: string, body: CreateBudgetPayload) =>
    request<Budget>("/users/setup/budgets", { method: "POST", token, body }),
  listTransactions: (token: string) => request<Transaction[]>("/transactions", { token }),
  createTransaction: (token: string, body: CreateTransactionPayload) =>
    request<CreateTransactionResponse>("/transactions", { method: "POST", token, body }),
  updateTransaction: (token: string, transactionId: number, body: UpdateTransactionPayload) =>
    request<Transaction>(`/transactions/${transactionId}`, { method: "PATCH", token, body })
};
