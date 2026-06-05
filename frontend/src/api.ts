import type {
  Account,
  ApiStatus,
  Category,
  CategoryKind,
  DailyExpenseSummary,
  Expense,
  ExpenseCreate,
  Tag,
  User
} from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
};

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const url = new URL(`${apiBaseUrl}${path}`, window.location.origin);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
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
  users: () => request<User[]>("/users"),
  createUser: (body: { username: string; display_name?: string | null }) =>
    request<User>("/users", { method: "POST", body }),
  accounts: (userId: number) => request<Account[]>(`/users/${userId}/setup/accounts`),
  createAccount: (userId: number, body: { name: string; account_type?: string | null; opening_balance: string }) =>
    request<Account>(`/users/${userId}/setup/accounts`, { method: "POST", body }),
  categories: (userId: number, kind?: CategoryKind) =>
    request<Category[]>(`/users/${userId}/setup/categories`, { query: { kind } }),
  createCategory: (userId: number, body: { name: string; kind: CategoryKind }) =>
    request<Category>(`/users/${userId}/setup/categories`, { method: "POST", body }),
  tags: (userId: number) => request<Tag[]>(`/users/${userId}/setup/tags`),
  createTag: (userId: number, body: { name: string }) =>
    request<Tag>(`/users/${userId}/setup/tags`, { method: "POST", body }),
  expenses: (query?: { from_date?: string; to_date?: string; category?: string }) =>
    request<Expense[]>("/expenses", { query: { ...query, limit: 100 } }),
  dailySummary: (query?: { from_date?: string; to_date?: string }) =>
    request<DailyExpenseSummary[]>("/expenses/summary/daily", { query }),
  createExpense: (body: ExpenseCreate) => request<Expense>("/expenses", { method: "POST", body }),
  deleteExpense: (expenseId: number) => request<void>(`/expenses/${expenseId}`, { method: "DELETE" })
};
