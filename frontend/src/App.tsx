import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  LogIn,
  LogOut,
  Pencil,
  PiggyBank,
  RefreshCw,
  Target,
  TrendingUp,
  UserPlus,
  UserRound,
  Wallet,
  WalletCards,
  X
} from "lucide-react";
import { api, ApiError } from "./api";
import type {
  Account,
  AccountType,
  CategoryGroups,
  CategoryKind,
  CreateMutualFundInvestmentPayload,
  CreateInternationalInvestmentPayload,
  CreateStockInvestmentPayload,
  CreateAccountPayload,
  CreateBudgetPayload,
  CreateGoalPayload,
  CreateTransactionPayload,
  Budget,
  Goal,
  MutualFundPortfolio,
  MutualFundSearchItem,
  StockPortfolio,
  InternationalPortfolio,
  InvestmentOptionsCatalog,
  TokenResponse,
  Transaction,
  TransactionType,
  UserProfile
} from "./types";

type AuthMode = "login" | "register";
type DashboardSection = "Dashboard" | "Transaction" | "Investment" | "Budget" | "Goal" | "Accounts" | "Profile";
const investmentTabNames = [
  "Mutual Funds",
  "Stocks",
  "International Investment",
  "Fixed Deposit",
  "Real Estate",
  "Crypto",
  "Provident Fund"
] as const;

const tokenStorageKey = "ledgr_access_token";

const blankForm = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  age: ""
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
}

function formatSignedCurrency(value: number) {
  if (value > 0) {
    return `+${formatCurrency(value)}`;
  }
  if (value < 0) {
    return `-${formatCurrency(Math.abs(value))}`;
  }
  return formatCurrency(value);
}

function formatOptionalDate(value: string | null) {
  if (!value) {
    return "N/A";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString();
}

function parseAmount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateTimeInputValue(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function transactionAmountClass(transactionType: TransactionType) {
  if (transactionType === "INCOME" || transactionType === "REFUND") {
    return "transaction-amount amount-positive";
  }
  if (transactionType === "EXPENSE" || transactionType === "INVESTMENT") {
    return "transaction-amount amount-negative";
  }
  return "transaction-amount amount-neutral";
}

function transactionAmountPrefix(transactionType: TransactionType) {
  if (transactionType === "INCOME" || transactionType === "REFUND") {
    return "+";
  }
  if (transactionType === "EXPENSE" || transactionType === "INVESTMENT") {
    return "-";
  }
  return "";
}

function transactionToneClass(transactionType: TransactionType) {
  if (transactionType === "INCOME" || transactionType === "REFUND") {
    return "transaction-tone income-touch";
  }
  if (transactionType === "EXPENSE" || transactionType === "INVESTMENT") {
    return "transaction-tone expense-touch";
  }
  return "transaction-tone neutral-touch";
}

function App() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [form, setForm] = useState(blankForm);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(tokenStorageKey));
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [apiStatus, setApiStatus] = useState<"checking" | "ok" | "offline">("checking");
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(Boolean(token));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<DashboardSection>("Dashboard");

  const heading = mode === "login" ? "Welcome back" : "Create your Ledgr account";
  const submitLabel = mode === "login" ? "Log in" : "Register";
  const Icon = mode === "login" ? LogIn : UserPlus;

  useEffect(() => {
    api
      .health()
      .then((status) => setApiStatus(status.status === "ok" ? "ok" : "offline"))
      .catch(() => setApiStatus("offline"));
  }, []);

  useEffect(() => {
    if (!token) {
      setProfile(null);
      setLoadingProfile(false);
      return;
    }

    setLoadingProfile(true);
    api
      .me(token)
      .then(setProfile)
      .catch(() => {
        localStorage.removeItem(tokenStorageKey);
        setToken(null);
      })
      .finally(() => setLoadingProfile(false));
  }, [token]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
  }

  function storeToken(response: TokenResponse) {
    localStorage.setItem(tokenStorageKey, response.access_token);
    setToken(response.access_token);
    window.history.replaceState(null, "", "#dashboard");
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "login") {
        const response = await api.login({ email: form.email, password: form.password });
        storeToken(response);
        setMessage("Logged in successfully.");
      } else {
        const response = await api.register({
          email: form.email,
          password: form.password,
          first_name: form.firstName || null,
          last_name: form.lastName || null,
          age: form.age ? Number(form.age) : null
        });
        storeToken(response);
        setMessage("Registration complete.");
      }
      setForm(blankForm);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError("Unable to complete the request.");
      }
    } finally {
      setSaving(false);
    }
  }

  function logout() {
    localStorage.removeItem(tokenStorageKey);
    window.history.replaceState(null, "", window.location.pathname);
    setToken(null);
    setProfile(null);
    setMessage(null);
    setError(null);
  }

  if (token && profile) {
    return (
      <DashboardShell
        activeSection={activeSection}
        onLogout={logout}
        onSelectSection={setActiveSection}
        profile={profile}
        token={token}
      />
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-label="Ledgr authentication">
        <div className="brand-pane">
          <div className="brand-mark">
            <WalletCards size={30} />
          </div>
          <p className="eyebrow">Ledgr</p>
          <h1>Personal finance, ready when you sign in.</h1>
          <div className={`status-pill ${apiStatus}`}>
            {apiStatus === "checking" ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
            <span>{apiStatus === "checking" ? "Checking API" : apiStatus === "ok" ? "API online" : "API offline"}</span>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-heading">
            <div>
              <p className="eyebrow">Account access</p>
              <h2>{loadingProfile ? "Loading session" : heading}</h2>
            </div>
            <LockKeyhole size={22} />
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Choose authentication mode">
            <button
              className={mode === "login" ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => switchMode("login")}
            >
              <LogIn size={16} />
              Login
            </button>
            <button
              className={mode === "register" ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              onClick={() => switchMode("register")}
            >
              <UserPlus size={16} />
              Register
            </button>
          </div>

          {message && <div className="notice success">{message}</div>}
          {error && <div className="notice">{error}</div>}

          <form className="auth-form" onSubmit={submitAuth}>
            <label>
              Email
              <input
                required
                autoComplete="email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </label>
            <label>
              Password
              <input
                required
                minLength={4}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </label>

            {mode === "register" && (
              <div className="register-grid">
                <label>
                  First name
                  <input
                    autoComplete="given-name"
                    value={form.firstName}
                    onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                  />
                </label>
                <label>
                  Last name
                  <input
                    autoComplete="family-name"
                    value={form.lastName}
                    onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                  />
                </label>
                <label>
                  Age
                  <input
                    min="0"
                    type="number"
                    value={form.age}
                    onChange={(event) => setForm({ ...form, age: event.target.value })}
                  />
                </label>
              </div>
            )}

            <button className="primary-action auth-submit" disabled={saving || loadingProfile} type="submit">
              {saving ? <Loader2 className="spin" size={17} /> : <Icon size={17} />}
              {saving ? "Please wait" : submitLabel}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function DashboardShell({
  activeSection,
  onLogout,
  onSelectSection,
  profile,
  token
}: {
  activeSection: DashboardSection;
  onLogout: () => void;
  onSelectSection: (section: DashboardSection) => void;
  profile: UserProfile;
  token: string;
}) {
  const displayName = profile.display_name || profile.email;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categoriesByKind, setCategoriesByKind] = useState<CategoryGroups>({
    income: [],
    expense: [],
    transfer: [],
    investment: [],
    refund: []
  });
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingDefaultBalances, setSavingDefaultBalances] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [savingGoalEdit, setSavingGoalEdit] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [savingTransaction, setSavingTransaction] = useState(false);
  const [showTransactionComposer, setShowTransactionComposer] = useState(false);
  const [editingDefaultBalanceField, setEditingDefaultBalanceField] = useState<"cash" | "pending" | null>(null);
  const [defaultBalanceDraft, setDefaultBalanceDraft] = useState("");
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [activeInvestmentTab, setActiveInvestmentTab] = useState<(typeof investmentTabNames)[number]>(investmentTabNames[0]);
  const [mutualFundSearchQuery, setMutualFundSearchQuery] = useState("");
  const [mutualFundSearchResults, setMutualFundSearchResults] = useState<MutualFundSearchItem[]>([]);
  const [selectedMutualFund, setSelectedMutualFund] = useState<MutualFundSearchItem | null>(null);
  const [mutualFundPortfolio, setMutualFundPortfolio] = useState<MutualFundPortfolio | null>(null);
  const [stockPortfolio, setStockPortfolio] = useState<StockPortfolio | null>(null);
  const [internationalPortfolio, setInternationalPortfolio] = useState<InternationalPortfolio | null>(null);
  const [investmentOptions, setInvestmentOptions] = useState<InvestmentOptionsCatalog>({
    stock_sectors: [],
    international_sectors: [],
    mutual_fund_categories: []
  });
  const [loadingMutualFundSearch, setLoadingMutualFundSearch] = useState(false);
  const [savingMutualFundInvestment, setSavingMutualFundInvestment] = useState(false);
  const [savingStockInvestment, setSavingStockInvestment] = useState(false);
  const [savingInternationalInvestment, setSavingInternationalInvestment] = useState(false);
  const [loadingStockPrice, setLoadingStockPrice] = useState(false);
  const [loadingInternationalPrice, setLoadingInternationalPrice] = useState(false);
  const [mutualFundForm, setMutualFundForm] = useState({
    goalId: "",
    categoryOptionId: "",
    units: "",
    avgPrice: ""
  });
  const [stockForm, setStockForm] = useState({
    symbol: "",
    companyName: "",
    exchange: "",
    goalId: "",
    sectorOptionId: "",
    quantity: "",
    avgPrice: "",
    currentPrice: ""
  });
  const [internationalForm, setInternationalForm] = useState({
    symbol: "",
    securityName: "",
    instrumentType: "stock" as "stock" | "index",
    goalId: "",
    sectorOptionId: "",
    quantity: "",
    avgPrice: "",
    currentPrice: ""
  });
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [savingTransactionEdit, setSavingTransactionEdit] = useState(false);
  const [accountForm, setAccountForm] = useState({
    name: "",
    accountType: "wallet" as AccountType,
    openingBalance: "0.00",
    creditLimit: "",
    expirationDate: "",
    notes: ""
  });
  const [defaultBalancesForm, setDefaultBalancesForm] = useState({
    cashOpeningBalance: "0.00",
    pendingFromFriendsOpeningBalance: "0.00"
  });
  const [transactionForm, setTransactionForm] = useState({
    date: toDateTimeInputValue(),
    transactionType: "EXPENSE" as TransactionType,
    amount: "",
    merchant: "",
    accountId: "",
    sourceAccountId: "",
    destinationAccountId: "",
    transferCategoryId: "",
    categoryId: "",
    notes: ""
  });
  const [goalForm, setGoalForm] = useState({
    name: "",
    targetAmount: "",
    currentAmount: "0.00",
    targetDate: ""
  });
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalEditForm, setGoalEditForm] = useState({
    targetAmount: "",
    currentAmount: ""
  });
  const [budgetForm, setBudgetForm] = useState({
    name: "",
    amount: "",
    categoryId: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    notes: ""
  });
  const [editingTransactionForm, setEditingTransactionForm] = useState({
    date: "",
    transactionType: "EXPENSE" as TransactionType,
    amount: "",
    merchant: "",
    accountId: "",
    categoryId: "",
    notes: ""
  });

  const sections: Array<{ icon: ReactNode; label: DashboardSection }> = [
    { icon: <BarChart3 size={18} />, label: "Dashboard" },
    { icon: <ArrowLeftRight size={18} />, label: "Transaction" },
    { icon: <TrendingUp size={18} />, label: "Investment" },
    { icon: <PiggyBank size={18} />, label: "Budget" },
    { icon: <Target size={18} />, label: "Goal" },
    { icon: <Wallet size={18} />, label: "Accounts" },
    { icon: <UserRound size={18} />, label: "Profile" }
  ];

  const transferCategory = useMemo(
    () => categoriesByKind.transfer.find((item) => String(item.id) === transactionForm.transferCategoryId) ?? null,
    [transactionForm.transferCategoryId, categoriesByKind.transfer]
  );
  const transactionCategoryKind = useMemo(() => {
    const kindMap: Record<TransactionType, CategoryKind> = {
      INCOME: "income",
      EXPENSE: "expense",
      TRANSFER: "transfer",
      INVESTMENT: "investment",
      REFUND: "refund"
    };
    return kindMap[transactionForm.transactionType];
  }, [transactionForm.transactionType]);
  const editingCategoryKind = useMemo(() => {
    const kindMap: Record<TransactionType, CategoryKind> = {
      INCOME: "income",
      EXPENSE: "expense",
      TRANSFER: "transfer",
      INVESTMENT: "investment",
      REFUND: "refund"
    };
    return kindMap[editingTransactionForm.transactionType];
  }, [editingTransactionForm.transactionType]);
  const transferUsesSourceDestination = Boolean(
    transferCategory && ["A/C Transfer", "Cash Withdrawal", "Business"].includes(transferCategory.name)
  );
  const totalBalance = useMemo(
    () => accounts.reduce((total, account) => total + parseAmount(account.current_balance), 0),
    [accounts]
  );
  const monthlySpend = useMemo(() => {
    const now = new Date();
    return transactions
      .filter((transaction) => {
        const date = new Date(transaction.date);
        return (
          transaction.transaction_type === "EXPENSE" &&
          date.getUTCFullYear() === now.getUTCFullYear() &&
          date.getUTCMonth() === now.getUTCMonth()
        );
      })
      .reduce((total, transaction) => total + parseAmount(transaction.amount), 0);
  }, [transactions]);
  const goalsCount = goals.length;
  const investmentCategoryById = useMemo(
    () => Object.fromEntries(categoriesByKind.investment.map((category) => [category.id, category.name])),
    [categoriesByKind.investment]
  );
  const investmentTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      if (transaction.transaction_type !== "INVESTMENT") {
        return false;
      }
      if (!transaction.category_id) {
        return false;
      }
      return investmentCategoryById[transaction.category_id] === activeInvestmentTab;
    });
  }, [transactions, investmentCategoryById, activeInvestmentTab]);

  async function loadWorkspace(options: { showLoader?: boolean } = {}) {
    const { showLoader = true } = options;
    if (showLoader) {
      setLoadingWorkspace(true);
    }
    setWorkspaceError(null);
    const [accountsResult, goalsResult, budgetsResult, transactionsResult, categoriesResult, mutualFundsResult, stocksResult, internationalResult, investmentOptionsResult] =
      await Promise.allSettled([
      api.listAccounts(token),
      api.listGoals(token),
      api.listBudgets(token),
      api.listTransactions(token),
      api.listCategories(token),
      api.listMutualFundPortfolio(token),
      api.listStockPortfolio(token),
      api.listInternationalPortfolio(token),
      api.listInvestmentOptions(token)
    ]);

    if (accountsResult.status === "fulfilled") {
      setAccounts(accountsResult.value);
    }
    if (goalsResult.status === "fulfilled") {
      setGoals(goalsResult.value);
    }
    if (budgetsResult.status === "fulfilled") {
      setBudgets(budgetsResult.value);
    }
    if (transactionsResult.status === "fulfilled") {
      setTransactions(transactionsResult.value);
    }
    if (categoriesResult.status === "fulfilled") {
      setCategoriesByKind(categoriesResult.value);
    }
    if (mutualFundsResult.status === "fulfilled") {
      setMutualFundPortfolio(mutualFundsResult.value);
    }
    if (stocksResult.status === "fulfilled") {
      setStockPortfolio(stocksResult.value);
    }
    if (internationalResult.status === "fulfilled") {
      setInternationalPortfolio(internationalResult.value);
    }
    if (investmentOptionsResult.status === "fulfilled") {
      setInvestmentOptions(investmentOptionsResult.value);
    }

    const failed = [
      accountsResult,
      goalsResult,
      budgetsResult,
      transactionsResult,
      categoriesResult,
      mutualFundsResult,
      stocksResult,
      internationalResult,
      investmentOptionsResult
    ].filter((result) => result.status === "rejected");
    if (failed.length > 0) {
      setWorkspaceMessage(null);
      setWorkspaceError("Some data could not be refreshed. Please try again.");
    }

    setLoadingWorkspace(false);
  }

  useEffect(() => {
    void loadWorkspace();
  }, [token]);

  useEffect(() => {
    setWorkspaceError(null);
    setWorkspaceMessage(null);
  }, [activeSection]);

  useEffect(() => {
    if (!showTransactionComposer) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowTransactionComposer(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showTransactionComposer]);

  useEffect(() => {
    if (!workspaceMessage) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setWorkspaceMessage(null);
    }, 10000);
    return () => window.clearTimeout(timeoutId);
  }, [workspaceMessage]);

  useEffect(() => {
    const cashAccount = accounts.find((account) => account.name.toLowerCase() === "cash");
    const pendingFromFriendsAccount = accounts.find((account) => account.name.toLowerCase() === "pending from friends");

    setDefaultBalancesForm({
      cashOpeningBalance: cashAccount?.opening_balance ?? "0.00",
      pendingFromFriendsOpeningBalance: pendingFromFriendsAccount?.opening_balance ?? "0.00"
    });
  }, [accounts]);

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAccount(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);
    const payload: CreateAccountPayload = {
      name: accountForm.name,
      account_type: accountForm.accountType,
      opening_balance: accountForm.openingBalance || "0.00",
      notes: accountForm.notes || null
    };

    if (accountForm.accountType === "credit card") {
      payload.credit_limit = accountForm.creditLimit || null;
      payload.expiration_date = accountForm.expirationDate ? `${accountForm.expirationDate}T00:00:00Z` : null;
    }

    try {
      await api.createAccount(token, payload);
      setAccountForm({
        name: "",
        accountType: "wallet",
        openingBalance: "0.00",
        creditLimit: "",
        expirationDate: "",
        notes: ""
      });
      setWorkspaceMessage("Account added.");
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to save account.");
    } finally {
      setSavingAccount(false);
    }
  }

  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingTransaction(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    const payload: CreateTransactionPayload = {
      date: new Date(transactionForm.date).toISOString(),
      amount: transactionForm.amount,
      transaction_type: transactionForm.transactionType,
      merchant: transactionForm.merchant || null,
      notes: transactionForm.notes || null
    };

    if (transactionForm.transactionType === "TRANSFER") {
      payload.category_id = transactionForm.transferCategoryId ? Number(transactionForm.transferCategoryId) : null;
      if (transferUsesSourceDestination) {
        payload.source_account_id = Number(transactionForm.sourceAccountId);
        payload.destination_account_id = Number(transactionForm.destinationAccountId);
      } else {
        payload.account_id = Number(transactionForm.accountId);
      }
    } else {
      payload.account_id = Number(transactionForm.accountId);
      payload.category_id = transactionForm.categoryId ? Number(transactionForm.categoryId) : null;
    }

    try {
      const response = await api.createTransaction(token, payload);
      setWorkspaceMessage(response.message);
      setShowTransactionComposer(false);
      setTransactionForm({
        date: toDateTimeInputValue(),
        transactionType: transactionForm.transactionType,
        amount: "",
        merchant: "",
        accountId: "",
        sourceAccountId: "",
        destinationAccountId: "",
        transferCategoryId: "",
        categoryId: "",
        notes: ""
      });
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to save transaction.");
    } finally {
      setSavingTransaction(false);
    }
  }

  async function searchMutualFunds(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = mutualFundSearchQuery.trim();
    if (!query) {
      setMutualFundSearchResults([]);
      return;
    }

    setLoadingMutualFundSearch(true);
    setWorkspaceError(null);
    try {
      const results = await api.searchMutualFunds(token, query);
      setMutualFundSearchResults(results);
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to search mutual funds.");
    } finally {
      setLoadingMutualFundSearch(false);
    }
  }

  function chooseMutualFund(result: MutualFundSearchItem) {
    setSelectedMutualFund(result);
    setMutualFundSearchQuery(result.scheme_name);
    setMutualFundSearchResults([]);
  }

  async function submitMutualFundInvestment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMutualFund) {
      setWorkspaceError("Please search and select a mutual fund first.");
      return;
    }
    setSavingMutualFundInvestment(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    const payload: CreateMutualFundInvestmentPayload = {
      scheme_code: selectedMutualFund.scheme_code,
      goal_id: mutualFundForm.goalId || null,
      category_option_id: mutualFundForm.categoryOptionId || null,
      units: mutualFundForm.units,
      avg_price: mutualFundForm.avgPrice
    };

    try {
      await api.createMutualFundInvestment(token, payload);
      setWorkspaceMessage("Mutual fund investment saved.");
      setMutualFundForm({ goalId: "", categoryOptionId: "", units: "", avgPrice: "" });
      setSelectedMutualFund(null);
      setMutualFundSearchQuery("");
      setMutualFundSearchResults([]);
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to save mutual fund investment.");
    } finally {
      setSavingMutualFundInvestment(false);
    }
  }

  async function submitStockInvestment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingStockInvestment(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    const payload: CreateStockInvestmentPayload = {
      symbol: stockForm.symbol,
      company_name: stockForm.companyName || null,
      exchange: stockForm.exchange || null,
      goal_id: stockForm.goalId || null,
      sector_option_id: stockForm.sectorOptionId || null,
      quantity: stockForm.quantity,
      avg_price: stockForm.avgPrice,
      current_price: stockForm.currentPrice || undefined
    };

    try {
      await api.createStockInvestment(token, payload);
      setWorkspaceMessage("Stock investment saved.");
      setStockForm({
        symbol: "",
        companyName: "",
        exchange: "",
        goalId: "",
        sectorOptionId: "",
        quantity: "",
        avgPrice: "",
        currentPrice: ""
      });
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to save stock investment.");
    } finally {
      setSavingStockInvestment(false);
    }
  }

  async function fetchStockCurrentPrice() {
    const symbol = stockForm.symbol.trim();
    if (!symbol) {
      setWorkspaceError("Enter stock symbol first.");
      return;
    }
    setLoadingStockPrice(true);
    setWorkspaceError(null);
    try {
      const result = await api.fetchStockCurrentPrice(token, symbol, stockForm.exchange || undefined);
      setStockForm((current) => ({ ...current, currentPrice: result.current_price }));
      setWorkspaceMessage(`Fetched current price for ${result.market_symbol}.`);
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to fetch stock current price.");
    } finally {
      setLoadingStockPrice(false);
    }
  }

  async function fetchInternationalCurrentPrice() {
    const symbol = internationalForm.symbol.trim();
    if (!symbol) {
      setWorkspaceError("Enter international symbol first.");
      return;
    }
    setLoadingInternationalPrice(true);
    setWorkspaceError(null);
    try {
      const result = await api.fetchInternationalCurrentPrice(token, symbol);
      setInternationalForm((current) => ({ ...current, currentPrice: result.current_price }));
      setWorkspaceMessage(`Fetched current price for ${result.market_symbol}.`);
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to fetch international current price.");
    } finally {
      setLoadingInternationalPrice(false);
    }
  }

  async function submitInternationalInvestment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingInternationalInvestment(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    const payload: CreateInternationalInvestmentPayload = {
      symbol: internationalForm.symbol,
      security_name: internationalForm.securityName || null,
      market: "US",
      instrument_type: internationalForm.instrumentType,
      goal_id: internationalForm.goalId || null,
      sector_option_id: internationalForm.sectorOptionId || null,
      quantity: internationalForm.quantity,
      avg_price: internationalForm.avgPrice,
      current_price: internationalForm.currentPrice || undefined
    };

    try {
      await api.createInternationalInvestment(token, payload);
      setWorkspaceMessage("International investment saved.");
      setInternationalForm({
        symbol: "",
        securityName: "",
        instrumentType: "stock",
        goalId: "",
        sectorOptionId: "",
        quantity: "",
        avgPrice: "",
        currentPrice: ""
      });
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to save international investment.");
    } finally {
      setSavingInternationalInvestment(false);
    }
  }

  async function saveDefaultBalanceEdit() {
    if (!editingDefaultBalanceField) {
      return;
    }
    setSavingDefaultBalances(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    const cashOpeningBalance =
      editingDefaultBalanceField === "cash" ? defaultBalanceDraft || "0.00" : defaultBalancesForm.cashOpeningBalance || "0.00";
    const pendingFromFriendsOpeningBalance =
      editingDefaultBalanceField === "pending"
        ? defaultBalanceDraft || "0.00"
        : defaultBalancesForm.pendingFromFriendsOpeningBalance || "0.00";

    try {
      await api.setupDefaultOpeningBalances(token, {
        cash_opening_balance: cashOpeningBalance,
        pending_from_friends_opening_balance: pendingFromFriendsOpeningBalance
      });
      setWorkspaceMessage("Default account opening balances updated.");
      setEditingDefaultBalanceField(null);
      setDefaultBalanceDraft("");
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to update default opening balances.");
    } finally {
      setSavingDefaultBalances(false);
    }
  }

  function openDefaultBalanceEditor(field: "cash" | "pending") {
    setEditingDefaultBalanceField(field);
    setDefaultBalanceDraft(
      field === "cash" ? defaultBalancesForm.cashOpeningBalance : defaultBalancesForm.pendingFromFriendsOpeningBalance
    );
  }

  async function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingGoal(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    const payload: CreateGoalPayload = {
      name: goalForm.name,
      target_amount: goalForm.targetAmount,
      current_amount: goalForm.currentAmount || "0.00",
      target_date: goalForm.targetDate ? `${goalForm.targetDate}T00:00:00Z` : null
    };

    try {
      await api.createGoal(token, payload);
      setGoalForm({
        name: "",
        targetAmount: "",
        currentAmount: "0.00",
        targetDate: ""
      });
      setWorkspaceMessage("Goal added.");
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to save goal.");
    } finally {
      setSavingGoal(false);
    }
  }

  function startEditGoal(goal: Goal) {
    setEditingGoalId(goal.id);
    setGoalEditForm({
      targetAmount: goal.target_amount,
      currentAmount: goal.current_amount
    });
    setWorkspaceError(null);
    setWorkspaceMessage(null);
  }

  async function submitGoalEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingGoalId) {
      return;
    }
    setSavingGoalEdit(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    try {
      await api.updateGoal(token, editingGoalId, {
        target_amount: goalEditForm.targetAmount,
        current_amount: goalEditForm.currentAmount
      });
      setWorkspaceMessage("Goal amounts updated.");
      setEditingGoalId(null);
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to update goal.");
    } finally {
      setSavingGoalEdit(false);
    }
  }

  async function submitBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingBudget(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    const payload: CreateBudgetPayload = {
      name: budgetForm.name,
      amount: budgetForm.amount,
      category_id: budgetForm.categoryId ? Number(budgetForm.categoryId) : null,
      start_date: `${budgetForm.startDate}T00:00:00Z`,
      end_date: `${budgetForm.endDate}T23:59:59Z`,
      notes: budgetForm.notes || null
    };

    try {
      await api.createBudget(token, payload);
      setBudgetForm({
        name: "",
        amount: "",
        categoryId: "",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
        notes: ""
      });
      setWorkspaceMessage("Budget added.");
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to save budget.");
    } finally {
      setSavingBudget(false);
    }
  }

  function startEditTransaction(transaction: Transaction) {
    setEditingTransactionId(transaction.id);
    setEditingTransactionForm({
      date: toDateTimeInputValue(new Date(transaction.date)),
      transactionType: transaction.transaction_type,
      amount: transaction.amount,
      merchant: transaction.merchant ?? "",
      accountId: String(transaction.account_id),
      categoryId: transaction.category_id ? String(transaction.category_id) : "",
      notes: transaction.notes ?? ""
    });
    setWorkspaceError(null);
    setWorkspaceMessage(null);
  }

  async function submitTransactionEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTransactionId) {
      return;
    }
    if (editingTransactionForm.transactionType === "TRANSFER") {
      setWorkspaceError("Editing TRANSFER transactions is not supported.");
      return;
    }
    setSavingTransactionEdit(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    try {
      await api.updateTransaction(token, editingTransactionId, {
        date: new Date(editingTransactionForm.date).toISOString(),
        transaction_type: editingTransactionForm.transactionType,
        amount: editingTransactionForm.amount,
        merchant: editingTransactionForm.merchant || null,
        account_id: Number(editingTransactionForm.accountId),
        category_id: editingTransactionForm.categoryId ? Number(editingTransactionForm.categoryId) : null,
        notes: editingTransactionForm.notes || null
      });
      setWorkspaceMessage("Transaction updated.");
      setEditingTransactionId(null);
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to update transaction.");
    } finally {
      setSavingTransactionEdit(false);
    }
  }

  function renderDashboardSection() {
    return (
      <>
        <section className="dashboard-grid" aria-label="Dashboard overview">
          <article>
            <p>Total balance</p>
            <strong>{formatCurrency(totalBalance)}</strong>
          </article>
          <article>
            <p>Monthly spend</p>
            <strong>{formatCurrency(monthlySpend)}</strong>
          </article>
          <article>
            <p>Transactions</p>
            <strong>{transactions.length}</strong>
          </article>
        </section>
        <section className="workspace-panel">
          <div>
            <p className="eyebrow">Recent activity</p>
            <h2>Latest transactions</h2>
          </div>
          {transactions.length === 0 ? (
            <p>No transactions yet.</p>
          ) : (
            <div className="data-list">
              {transactions.slice(0, 6).map((transaction) => (
                <article key={transaction.id} className={`data-row ${transactionToneClass(transaction.transaction_type)}`}>
                  <div>
                    <strong>{transaction.merchant || transaction.transaction_type}</strong>
                    <p>{new Date(transaction.date).toLocaleString()}</p>
                  </div>
                  <span className={transactionAmountClass(transaction.transaction_type)}>
                    {transactionAmountPrefix(transaction.transaction_type)}
                    {formatCurrency(parseAmount(transaction.amount))}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      </>
    );
  }

  function renderTransactionComposer() {
    return (
      <section className="workspace-panel">
        <div>
          <p className="eyebrow">Transaction</p>
          <h2>Transaction details</h2>
          <p className="form-hint">
            Categories are filtered by selected transaction type (income, expense, transfer, investment, refund).
          </p>
        </div>
        <form className="workspace-form" onSubmit={submitTransaction}>
          <label>
            Type
            <select
              value={transactionForm.transactionType}
              onChange={(event) =>
                setTransactionForm({
                  ...transactionForm,
                  transactionType: event.target.value as TransactionType,
                  accountId: "",
                  sourceAccountId: "",
                  destinationAccountId: "",
                  transferCategoryId: "",
                  categoryId: ""
                })
              }
            >
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
              <option value="TRANSFER">Transfer</option>
              <option value="INVESTMENT">Investment</option>
              <option value="REFUND">Refund</option>
            </select>
          </label>
          <label>
            Amount
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              value={transactionForm.amount}
              onChange={(event) => setTransactionForm({ ...transactionForm, amount: event.target.value })}
            />
          </label>
          <label>
            Date
            <input
              required
              type="datetime-local"
              value={transactionForm.date}
              onChange={(event) => setTransactionForm({ ...transactionForm, date: event.target.value })}
            />
          </label>
          <label>
            Merchant
            <input
              value={transactionForm.merchant}
              onChange={(event) => setTransactionForm({ ...transactionForm, merchant: event.target.value })}
            />
          </label>
          {transactionForm.transactionType === "TRANSFER" ? (
            <label>
              Transfer category
              <select
                required
                value={transactionForm.transferCategoryId}
                onChange={(event) => setTransactionForm({ ...transactionForm, transferCategoryId: event.target.value })}
              >
                <option value="">Select category</option>
                {categoriesByKind.transfer.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Category
              <select
                value={transactionForm.categoryId}
                onChange={(event) => setTransactionForm({ ...transactionForm, categoryId: event.target.value })}
              >
                <option value="">Select category</option>
                {categoriesByKind[transactionCategoryKind].map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {transactionForm.transactionType !== "TRANSFER" || !transferUsesSourceDestination ? (
            <label>
              Account
              <select
                required
                value={transactionForm.accountId}
                onChange={(event) => setTransactionForm({ ...transactionForm, accountId: event.target.value })}
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                Source account
                <select
                  required
                  value={transactionForm.sourceAccountId}
                  onChange={(event) => setTransactionForm({ ...transactionForm, sourceAccountId: event.target.value })}
                >
                  <option value="">Select source account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Destination account
                <select
                  required
                  value={transactionForm.destinationAccountId}
                  onChange={(event) =>
                    setTransactionForm({ ...transactionForm, destinationAccountId: event.target.value })
                  }
                >
                  <option value="">Select destination account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>
            Notes
            <input
              value={transactionForm.notes}
              onChange={(event) => setTransactionForm({ ...transactionForm, notes: event.target.value })}
            />
          </label>
          <button className="primary-action transaction-submit-action" disabled={savingTransaction} type="submit">
            {savingTransaction && <Loader2 className="spin" size={16} />}
            {savingTransaction ? "Saving" : "Create transaction"}
          </button>
        </form>
      </section>
    );
  }

  function renderRecentTransactionsSection() {
    return (
      <section className="workspace-panel">
        <div>
          <p className="eyebrow">Transactions</p>
          <h2>Recent transactions</h2>
        </div>
        {editingTransactionId !== null && (
          <form className="workspace-form" onSubmit={submitTransactionEdit}>
            <label>
              Type
              <select
                value={editingTransactionForm.transactionType}
                onChange={(event) =>
                  setEditingTransactionForm({
                    ...editingTransactionForm,
                    transactionType: event.target.value as TransactionType,
                    categoryId: ""
                  })
                }
              >
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
                <option value="INVESTMENT">Investment</option>
                <option value="REFUND">Refund</option>
              </select>
            </label>
            <label>
              Amount
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                value={editingTransactionForm.amount}
                onChange={(event) => setEditingTransactionForm({ ...editingTransactionForm, amount: event.target.value })}
              />
            </label>
            <label>
              Date
              <input
                required
                type="datetime-local"
                value={editingTransactionForm.date}
                onChange={(event) => setEditingTransactionForm({ ...editingTransactionForm, date: event.target.value })}
              />
            </label>
            <label>
              Merchant
              <input
                value={editingTransactionForm.merchant}
                onChange={(event) =>
                  setEditingTransactionForm({ ...editingTransactionForm, merchant: event.target.value })
                }
              />
            </label>
            <label>
              Account
              <select
                required
                value={editingTransactionForm.accountId}
                onChange={(event) => setEditingTransactionForm({ ...editingTransactionForm, accountId: event.target.value })}
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={editingTransactionForm.categoryId}
                onChange={(event) => setEditingTransactionForm({ ...editingTransactionForm, categoryId: event.target.value })}
              >
                <option value="">Select category</option>
                {categoriesByKind[editingCategoryKind].map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <input
                value={editingTransactionForm.notes}
                onChange={(event) => setEditingTransactionForm({ ...editingTransactionForm, notes: event.target.value })}
              />
            </label>
            <div className="inline-actions">
              <button className="primary-action" disabled={savingTransactionEdit} type="submit">
                {savingTransactionEdit && <Loader2 className="spin" size={16} />}
                {savingTransactionEdit ? "Saving" : "Save changes"}
              </button>
              <button className="subtle-action small-action" type="button" onClick={() => setEditingTransactionId(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        <div className="data-list">
          {transactions.slice(0, 10).map((transaction) => (
            <article key={transaction.id} className={`data-row ${transactionToneClass(transaction.transaction_type)}`}>
              <div>
                <strong>{transaction.merchant || transaction.transaction_type}</strong>
                <p>{new Date(transaction.date).toLocaleString()}</p>
              </div>
              <div className="row-actions">
                <span className={transactionAmountClass(transaction.transaction_type)}>
                  {transactionAmountPrefix(transaction.transaction_type)}
                  {formatCurrency(parseAmount(transaction.amount))}
                </span>
                {transaction.transaction_type !== "TRANSFER" && (
                  <button className="subtle-action small-action" type="button" onClick={() => startEditTransaction(transaction)}>
                    Edit
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderAccountSection() {
    return (
      <section className="workspace-panel">
        <div>
          <p className="eyebrow">Accounts</p>
          <h2>Create and view accounts</h2>
        </div>
        <form className="workspace-form" onSubmit={submitAccount}>
          <label>
            Name
            <input
              required
              value={accountForm.name}
              onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })}
            />
          </label>
          <label>
            Type
            <select
              value={accountForm.accountType}
              onChange={(event) =>
                setAccountForm({ ...accountForm, accountType: event.target.value as AccountType, creditLimit: "" })
              }
            >
              <option value="wallet">Wallet</option>
              <option value="bank account">Bank account</option>
              <option value="credit card">Credit card</option>
            </select>
          </label>
          <label>
            Opening balance
            <input
              min="0"
              step="0.01"
              type="number"
              value={accountForm.openingBalance}
              onChange={(event) => setAccountForm({ ...accountForm, openingBalance: event.target.value })}
            />
          </label>
          {accountForm.accountType === "credit card" && (
            <>
              <label>
                Credit limit
                <input
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  value={accountForm.creditLimit}
                  onChange={(event) => setAccountForm({ ...accountForm, creditLimit: event.target.value })}
                />
              </label>
              <label>
                Expiration date
                <input
                  required
                  type="date"
                  value={accountForm.expirationDate}
                  onChange={(event) => setAccountForm({ ...accountForm, expirationDate: event.target.value })}
                />
              </label>
            </>
          )}
          <label>
            Note
            <input
              value={accountForm.notes}
              onChange={(event) => setAccountForm({ ...accountForm, notes: event.target.value })}
            />
          </label>
          <button className="primary-action compact-primary-action account-submit-action" disabled={savingAccount} type="submit">
            {savingAccount && <Loader2 className="spin" size={16} />}
            {savingAccount ? "Saving" : "Add account"}
          </button>
        </form>
        <div className="data-list">
          {accounts.map((account) => {
            const lowerName = account.name.toLowerCase();
            const isDefaultEditable = lowerName === "cash" || lowerName === "pending from friends";
            return (
              <article key={account.id} className="data-row">
                <div>
                  <strong>{account.name}</strong>
                  <p>{account.account_type}</p>
                  {account.notes && <p>{account.notes}</p>}
                </div>
                {isDefaultEditable ? (
                  <div className="row-actions">
                    <span>{formatCurrency(parseAmount(account.current_balance))}</span>
                    <button
                      className="subtle-action icon-action amount-edit-action"
                      type="button"
                      aria-label={`Edit ${account.name} opening balance`}
                      title={`Edit ${account.name} opening balance`}
                      onClick={() => openDefaultBalanceEditor(lowerName === "cash" ? "cash" : "pending")}
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                ) : (
                  <span>{formatCurrency(parseAmount(account.current_balance))}</span>
                )}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderGoalSection() {
    return (
      <section className="workspace-panel">
        <div>
          <p className="eyebrow">Goal</p>
          <h2>Create and track goals</h2>
        </div>
        <form className="workspace-form" onSubmit={submitGoal}>
          <label>
            Name
            <input required value={goalForm.name} onChange={(event) => setGoalForm({ ...goalForm, name: event.target.value })} />
          </label>
          <label>
            Target amount
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              value={goalForm.targetAmount}
              onChange={(event) => setGoalForm({ ...goalForm, targetAmount: event.target.value })}
            />
          </label>
          <label>
            Current amount
            <input
              min="0"
              step="0.01"
              type="number"
              value={goalForm.currentAmount}
              onChange={(event) => setGoalForm({ ...goalForm, currentAmount: event.target.value })}
            />
          </label>
          <label>
            Target date
            <input
              type="date"
              value={goalForm.targetDate}
              onChange={(event) => setGoalForm({ ...goalForm, targetDate: event.target.value })}
            />
          </label>
          <button className="primary-action" disabled={savingGoal} type="submit">
            {savingGoal && <Loader2 className="spin" size={16} />}
            {savingGoal ? "Saving" : "Add goal"}
          </button>
        </form>
        <div className="data-list">
          {goals.length === 0 ? (
            <p>No goals yet.</p>
          ) : (
            goals.map((goal) => {
              const target = parseAmount(goal.target_amount);
              const current = parseAmount(goal.current_amount);
              const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
              const needed = Math.max(target - current, 0);
              return (
                <article key={goal.id} className="data-row goal-row">
                  <div className="goal-row-main">
                    <div>
                      <strong>{goal.name}</strong>
                      <p>
                        Current {formatCurrency(current)} | Needed {formatCurrency(needed)} | Target {formatCurrency(target)}
                      </p>
                    </div>
                    <div className="goal-progress-block" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                      <div className="goal-progress-track">
                        <div className="goal-progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                      <span>{progress.toFixed(1)}%</span>
                    </div>
                    {editingGoalId === goal.id ? (
                      <form className="workspace-form goal-edit-form" onSubmit={submitGoalEdit}>
                        <label>
                          Target amount
                          <input
                            required
                            min="0.01"
                            step="0.01"
                            type="number"
                            value={goalEditForm.targetAmount}
                            onChange={(event) => setGoalEditForm({ ...goalEditForm, targetAmount: event.target.value })}
                          />
                        </label>
                        <label>
                          Current amount
                          <input
                            required
                            min="0"
                            step="0.01"
                            type="number"
                            value={goalEditForm.currentAmount}
                            onChange={(event) => setGoalEditForm({ ...goalEditForm, currentAmount: event.target.value })}
                          />
                        </label>
                        <div className="inline-actions">
                          <button className="primary-action compact-primary-action" type="submit" disabled={savingGoalEdit}>
                            {savingGoalEdit && <Loader2 className="spin" size={16} />}
                            {savingGoalEdit ? "Saving" : "Save amount"}
                          </button>
                          <button
                            className="subtle-action small-action"
                            type="button"
                            disabled={savingGoalEdit}
                            onClick={() => setEditingGoalId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button className="subtle-action small-action" type="button" onClick={() => startEditGoal(goal)}>
                        Edit Amount
                      </button>
                    )}
                  </div>
                  <span>{goal.target_date ? new Date(goal.target_date).toLocaleDateString() : "No target date"}</span>
                </article>
              );
            })
          )}
        </div>
      </section>
    );
  }

  function renderBudgetSection() {
    return (
      <section className="workspace-panel">
        <div>
          <p className="eyebrow">Budget</p>
          <h2>Create and track budgets</h2>
        </div>
        <form className="workspace-form" onSubmit={submitBudget}>
          <label>
            Name
            <input
              required
              value={budgetForm.name}
              onChange={(event) => setBudgetForm({ ...budgetForm, name: event.target.value })}
            />
          </label>
          <label>
            Amount
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              value={budgetForm.amount}
              onChange={(event) => setBudgetForm({ ...budgetForm, amount: event.target.value })}
            />
          </label>
          <label>
            Category
            <select
              value={budgetForm.categoryId}
              onChange={(event) => setBudgetForm({ ...budgetForm, categoryId: event.target.value })}
            >
              <option value="">All expense categories</option>
              {categoriesByKind.expense.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start date
            <input
              required
              type="date"
              value={budgetForm.startDate}
              onChange={(event) => setBudgetForm({ ...budgetForm, startDate: event.target.value })}
            />
          </label>
          <label>
            End date
            <input
              required
              type="date"
              value={budgetForm.endDate}
              onChange={(event) => setBudgetForm({ ...budgetForm, endDate: event.target.value })}
            />
          </label>
          <label>
            Notes
            <input
              value={budgetForm.notes}
              onChange={(event) => setBudgetForm({ ...budgetForm, notes: event.target.value })}
            />
          </label>
          <button className="primary-action" disabled={savingBudget} type="submit">
            {savingBudget && <Loader2 className="spin" size={16} />}
            {savingBudget ? "Saving" : "Add budget"}
          </button>
        </form>
        <div className="data-list">
          {budgets.length === 0 ? (
            <p>No budgets yet.</p>
          ) : (
            budgets.map((budget) => {
              const budgetAmount = parseAmount(budget.amount);
              const spentAmount = parseAmount(budget.spent_amount);
              const remainingAmount = parseAmount(budget.remaining_amount);
              const usagePercent = budgetAmount > 0 ? Math.min(100, Math.round((spentAmount / budgetAmount) * 100)) : 0;
              return (
                <article key={budget.id} className="data-row">
                  <div>
                    <strong>{budget.name}</strong>
                    <p>
                      Spent {formatCurrency(spentAmount)} of {formatCurrency(budgetAmount)} ({usagePercent}%)
                    </p>
                    <p>
                      Remaining {formatCurrency(remainingAmount)} | {new Date(budget.start_date).toLocaleDateString()} -{" "}
                      {new Date(budget.end_date).toLocaleDateString()}
                    </p>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    );
  }

  function renderInvestmentSection() {
    const isMutualFundsTab = activeInvestmentTab === "Mutual Funds";
    const isStocksTab = activeInvestmentTab === "Stocks";
    const isInternationalTab = activeInvestmentTab === "International Investment";

    if (!isMutualFundsTab && !isStocksTab && !isInternationalTab) {
      return (
        <section className="workspace-panel">
          <div>
            <p className="eyebrow">Investment</p>
            <h2>Track investment categories</h2>
          </div>
          <div className="section-pills" aria-label="Investment categories">
            {investmentTabNames.map((tabName) => (
              <button key={tabName} className={activeInvestmentTab === tabName ? "active" : ""} type="button" onClick={() => setActiveInvestmentTab(tabName)}>
                {tabName}
              </button>
            ))}
          </div>
          <div className="data-list">
            {investmentTransactions.length === 0 ? (
              <p>No transactions for {activeInvestmentTab} yet.</p>
            ) : (
              investmentTransactions.slice(0, 10).map((transaction) => (
                <article key={transaction.id} className="data-row">
                  <div>
                    <strong>{transaction.merchant || activeInvestmentTab}</strong>
                    <p>{new Date(transaction.date).toLocaleString()}</p>
                  </div>
                  <span className={transactionAmountClass(transaction.transaction_type)}>
                    {transactionAmountPrefix(transaction.transaction_type)}
                    {formatCurrency(parseAmount(transaction.amount))}
                  </span>
                </article>
              ))
            )}
          </div>
        </section>
      );
    }

    const activePortfolio = isMutualFundsTab
      ? mutualFundPortfolio
      : isStocksTab
        ? stockPortfolio
        : internationalPortfolio;
    const totalInvested = parseAmount(activePortfolio?.total_invested_amount ?? "0");
    const totalCurrent = parseAmount(activePortfolio?.total_current_value ?? "0");
    const totalPnl = parseAmount(activePortfolio?.total_pnl ?? "0");
    const totalPnlPercent = parseAmount(activePortfolio?.total_pnl_percent ?? "0");

    return (
      <section className="workspace-panel">
        <div>
          <p className="eyebrow">Investment</p>
          <h2>{isMutualFundsTab ? "Mutual fund portfolio" : isStocksTab ? "Stock portfolio" : "International portfolio"}</h2>
        </div>
        <div className="section-pills" aria-label="Investment categories">
          {investmentTabNames.map((tabName) => (
            <button key={tabName} className={activeInvestmentTab === tabName ? "active" : ""} type="button" onClick={() => setActiveInvestmentTab(tabName)}>
              {tabName}
            </button>
          ))}
        </div>

        {isMutualFundsTab && (
          <>
            <div className="investment-layout">
              <form className="workspace-form investment-form" onSubmit={searchMutualFunds}>
                <label>
                  Search mutual fund
                  <input
                    placeholder="Try: axis, hdfc, nifty"
                    value={mutualFundSearchQuery}
                    onChange={(event) => setMutualFundSearchQuery(event.target.value)}
                  />
                </label>
                <button className="subtle-action mf-search-button" type="submit" disabled={loadingMutualFundSearch}>
                  {loadingMutualFundSearch && <Loader2 className="spin" size={16} />}
                  {loadingMutualFundSearch ? "Searching" : "Search"}
                </button>
              </form>

              <div className="data-list investment-search-results">
                {mutualFundSearchResults.length === 0 ? (
                  <p>No search results yet.</p>
                ) : (
                  mutualFundSearchResults.slice(0, 8).map((result) => (
                    <article key={result.scheme_code} className="data-row compact-selection-row">
                      <div>
                        <strong>{result.scheme_name}</strong>
                        <p>
                          Code: {result.scheme_code}
                          {result.fund_house ? ` | ${result.fund_house}` : ""}
                        </p>
                        <p>
                          Latest NAV: {result.nav !== null ? formatCurrency(parseAmount(result.nav)) : "N/A"}
                          {" | "}
                          Date: {formatOptionalDate(result.date)}
                        </p>
                      </div>
                      <button className="subtle-action small-action" type="button" onClick={() => chooseMutualFund(result)}>
                        Select
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>

            <form className="workspace-form investment-form compact-investment-form" onSubmit={submitMutualFundInvestment}>
              <div className="selected-mf-block">
                <p className="eyebrow">Selected mutual fund</p>
                {selectedMutualFund ? (
                  <>
                    <strong>{selectedMutualFund.scheme_name}</strong>
                    <p>
                      Code: {selectedMutualFund.scheme_code}
                      {selectedMutualFund.fund_house ? ` | ${selectedMutualFund.fund_house}` : ""}
                    </p>
                    <p>
                      Latest NAV: {selectedMutualFund.nav !== null ? formatCurrency(parseAmount(selectedMutualFund.nav)) : "N/A"}
                      {" | "}
                      Date: {formatOptionalDate(selectedMutualFund.date)}
                    </p>
                  </>
                ) : (
                  <p>Select a mutual fund from the search results above.</p>
                )}
              </div>
              <label>
                Goal tag
                <select value={mutualFundForm.goalId} onChange={(event) => setMutualFundForm({ ...mutualFundForm, goalId: event.target.value })}>
                  <option value="">No goal</option>
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select
                  value={mutualFundForm.categoryOptionId}
                  onChange={(event) => setMutualFundForm({ ...mutualFundForm, categoryOptionId: event.target.value })}
                >
                  <option value="">No category</option>
                  {investmentOptions.mutual_fund_categories.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Units
                <input
                  required
                  min="0.001"
                  step="0.001"
                  type="number"
                  value={mutualFundForm.units}
                  onChange={(event) => setMutualFundForm({ ...mutualFundForm, units: event.target.value })}
                />
              </label>
              <label>
                Avg buy price
                <input
                  required
                  min="0.001"
                  step="0.001"
                  type="number"
                  value={mutualFundForm.avgPrice}
                  onChange={(event) => setMutualFundForm({ ...mutualFundForm, avgPrice: event.target.value })}
                />
              </label>
              <button className="primary-action" disabled={savingMutualFundInvestment || !selectedMutualFund} type="submit">
                {savingMutualFundInvestment && <Loader2 className="spin" size={16} />}
                {savingMutualFundInvestment ? "Saving" : "Add investment"}
              </button>
            </form>

            <section className="dashboard-grid investment-summary-grid" aria-label="Investment summary">
              <article>
                <p>Total invested</p>
                <strong>{formatCurrency(totalInvested)}</strong>
              </article>
              <article>
                <p>Current value</p>
                <strong>{formatCurrency(totalCurrent)}</strong>
              </article>
              <article>
                <p>Total P/L</p>
                <strong className={totalPnl >= 0 ? "amount-positive" : "amount-negative"}>
                  {formatSignedCurrency(totalPnl)} ({totalPnlPercent.toFixed(2)}%)
                </strong>
              </article>
            </section>

            <div className="table-wrapper">
              {!mutualFundPortfolio || mutualFundPortfolio.holdings.length === 0 ? (
                <p>No mutual fund holdings yet.</p>
              ) : (
                <table className="portfolio-table">
                  <thead>
                    <tr>
                      <th>Scheme Code</th>
                      <th>Units</th>
                      <th>Avg. NAV</th>
                      <th>Catagory</th>
                      <th>Scheme Name</th>
                      <th>NAV</th>
                      <th>NAV Date</th>
                      <th>Invested</th>
                      <th>Current</th>
                      <th>Abs. P&amp;L</th>
                      <th>Abs. P&amp;L %</th>
                      <th>Goal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mutualFundPortfolio.holdings.map((holding) => {
                      const pnlValue = parseAmount(holding.pnl);
                      const pnlPercent = parseAmount(holding.pnl_percent);
                      return (
                        <tr key={holding.id}>
                          <td>{holding.scheme_code}</td>
                          <td>{holding.units}</td>
                          <td>{holding.avg_price}</td>
                          <td>{holding.category_name ?? "-"}</td>
                          <td title={holding.scheme_name} className="table-text-ellipsis">{holding.scheme_name}</td>
                          <td>{holding.nav ?? "-"}</td>
                          <td>{formatOptionalDate(holding.nav_date)}</td>
                          <td>{formatCurrency(parseAmount(holding.invested_amount))}</td>
                          <td>{formatCurrency(parseAmount(holding.current_value))}</td>
                          <td className={pnlValue >= 0 ? "amount-positive" : "amount-negative"}>{formatSignedCurrency(pnlValue)}</td>
                          <td className={pnlPercent >= 0 ? "amount-positive" : "amount-negative"}>
                            {pnlPercent >= 0 ? "+" : ""}
                            {pnlPercent.toFixed(2)}%
                          </td>
                          <td>{holding.goal_name ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {isStocksTab && (
          <>
            <form className="workspace-form investment-form compact-investment-form" onSubmit={submitStockInvestment}>
              <label>
                Symbol
                <input required value={stockForm.symbol} onChange={(event) => setStockForm({ ...stockForm, symbol: event.target.value })} />
              </label>
              <label>
                Company name
                <input value={stockForm.companyName} onChange={(event) => setStockForm({ ...stockForm, companyName: event.target.value })} />
              </label>
              <label>
                Exchange
                <input placeholder="NSE, BSE" value={stockForm.exchange} onChange={(event) => setStockForm({ ...stockForm, exchange: event.target.value })} />
              </label>
              <label>
                Goal tag
                <select value={stockForm.goalId} onChange={(event) => setStockForm({ ...stockForm, goalId: event.target.value })}>
                  <option value="">No goal</option>
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sector
                <select
                  value={stockForm.sectorOptionId}
                  onChange={(event) => setStockForm({ ...stockForm, sectorOptionId: event.target.value })}
                >
                  <option value="">No sector</option>
                  {investmentOptions.stock_sectors.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity
                <input required min="0.001" step="0.001" type="number" value={stockForm.quantity} onChange={(event) => setStockForm({ ...stockForm, quantity: event.target.value })} />
              </label>
              <label>
                Avg buy price
                <input required min="0.001" step="0.001" type="number" value={stockForm.avgPrice} onChange={(event) => setStockForm({ ...stockForm, avgPrice: event.target.value })} />
              </label>
              <label>
                Current price
                <div className="inline-actions">
                  <input
                    required
                    min="0.001"
                    step="0.001"
                    type="number"
                    value={stockForm.currentPrice}
                    onChange={(event) => setStockForm({ ...stockForm, currentPrice: event.target.value })}
                  />
                  <button className="subtle-action small-action" type="button" disabled={loadingStockPrice} onClick={() => void fetchStockCurrentPrice()}>
                    {loadingStockPrice && <Loader2 className="spin" size={14} />}
                    {loadingStockPrice ? "Fetching" : "Auto"}
                  </button>
                </div>
              </label>
              <button className="primary-action" disabled={savingStockInvestment} type="submit">
                {savingStockInvestment && <Loader2 className="spin" size={16} />}
                {savingStockInvestment ? "Saving" : "Add stock"}
              </button>
            </form>
            <section className="dashboard-grid investment-summary-grid" aria-label="Investment summary">
              <article>
                <p>Total invested</p>
                <strong>{formatCurrency(totalInvested)}</strong>
              </article>
              <article>
                <p>Current value</p>
                <strong>{formatCurrency(totalCurrent)}</strong>
              </article>
              <article>
                <p>Total P/L</p>
                <strong className={totalPnl >= 0 ? "amount-positive" : "amount-negative"}>
                  {formatSignedCurrency(totalPnl)} ({totalPnlPercent.toFixed(2)}%)
                </strong>
              </article>
            </section>
            <div className="table-wrapper">
              {!stockPortfolio || stockPortfolio.holdings.length === 0 ? (
                <p>No stock holdings yet.</p>
              ) : (
                <table className="portfolio-table">
                  <thead>
                    <tr>
                      <th>Security Code</th>
                      <th>Quantity</th>
                      <th>Avg. Price</th>
                      <th>Sector</th>
                      <th>Name</th>
                      <th>Current Price</th>
                      <th>Invested</th>
                      <th>Current</th>
                      <th>Abs P&amp;L</th>
                      <th>Abs.P&amp;L %</th>
                      <th>Goal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockPortfolio.holdings.map((holding) => {
                      const pnlValue = parseAmount(holding.pnl);
                      const pnlPercent = parseAmount(holding.pnl_percent);
                      return (
                        <tr key={holding.id}>
                          <td>{holding.symbol}</td>
                          <td>{holding.quantity}</td>
                          <td>{holding.avg_price}</td>
                          <td>{holding.sector_name ?? "-"}</td>
                          <td title={holding.company_name ?? "Stock"} className="table-text-ellipsis">
                            {holding.company_name ?? "Stock"}
                          </td>
                          <td>{holding.current_price}</td>
                          <td>{formatCurrency(parseAmount(holding.invested_amount))}</td>
                          <td>{formatCurrency(parseAmount(holding.current_value))}</td>
                          <td className={pnlValue >= 0 ? "amount-positive" : "amount-negative"}>{formatSignedCurrency(pnlValue)}</td>
                          <td className={pnlPercent >= 0 ? "amount-positive" : "amount-negative"}>
                            {pnlPercent >= 0 ? "+" : ""}
                            {pnlPercent.toFixed(2)}%
                          </td>
                          <td>{holding.goal_name ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {isInternationalTab && (
          <>
            <form className="workspace-form investment-form compact-investment-form" onSubmit={submitInternationalInvestment}>
              <label>
                Symbol
                <input
                  required
                  placeholder="AAPL, MSFT, ^GSPC, ^NDX"
                  value={internationalForm.symbol}
                  onChange={(event) => setInternationalForm({ ...internationalForm, symbol: event.target.value })}
                />
              </label>
              <label>
                Security name
                <input
                  value={internationalForm.securityName}
                  onChange={(event) => setInternationalForm({ ...internationalForm, securityName: event.target.value })}
                />
              </label>
              <label>
                Type
                <select
                  value={internationalForm.instrumentType}
                  onChange={(event) =>
                    setInternationalForm({ ...internationalForm, instrumentType: event.target.value as "stock" | "index" })
                  }
                >
                  <option value="stock">US Stock</option>
                  <option value="index">US Index</option>
                </select>
              </label>
              <label>
                Goal tag
                <select value={internationalForm.goalId} onChange={(event) => setInternationalForm({ ...internationalForm, goalId: event.target.value })}>
                  <option value="">No goal</option>
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sector
                <select
                  value={internationalForm.sectorOptionId}
                  onChange={(event) => setInternationalForm({ ...internationalForm, sectorOptionId: event.target.value })}
                >
                  <option value="">No sector</option>
                  {investmentOptions.international_sectors.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity
                <input
                  required
                  min="0.001"
                  step="0.001"
                  type="number"
                  value={internationalForm.quantity}
                  onChange={(event) => setInternationalForm({ ...internationalForm, quantity: event.target.value })}
                />
              </label>
              <label>
                Avg buy price
                <input
                  required
                  min="0.001"
                  step="0.001"
                  type="number"
                  value={internationalForm.avgPrice}
                  onChange={(event) => setInternationalForm({ ...internationalForm, avgPrice: event.target.value })}
                />
              </label>
              <label>
                Current price
                <div className="inline-actions">
                  <input
                    required
                    min="0.001"
                    step="0.001"
                    type="number"
                    value={internationalForm.currentPrice}
                    onChange={(event) => setInternationalForm({ ...internationalForm, currentPrice: event.target.value })}
                  />
                  <button className="subtle-action small-action" type="button" disabled={loadingInternationalPrice} onClick={() => void fetchInternationalCurrentPrice()}>
                    {loadingInternationalPrice && <Loader2 className="spin" size={14} />}
                    {loadingInternationalPrice ? "Fetching" : "Auto"}
                  </button>
                </div>
              </label>
              <button className="primary-action" disabled={savingInternationalInvestment} type="submit">
                {savingInternationalInvestment && <Loader2 className="spin" size={16} />}
                {savingInternationalInvestment ? "Saving" : "Add international"}
              </button>
            </form>

            <section className="dashboard-grid investment-summary-grid" aria-label="Investment summary">
              <article>
                <p>Total invested</p>
                <strong>{formatCurrency(totalInvested)}</strong>
              </article>
              <article>
                <p>Current value</p>
                <strong>{formatCurrency(totalCurrent)}</strong>
              </article>
              <article>
                <p>Total P/L</p>
                <strong className={totalPnl >= 0 ? "amount-positive" : "amount-negative"}>
                  {formatSignedCurrency(totalPnl)} ({totalPnlPercent.toFixed(2)}%)
                </strong>
              </article>
            </section>

            <div className="table-wrapper">
              {!internationalPortfolio || internationalPortfolio.holdings.length === 0 ? (
                <p>No international holdings yet.</p>
              ) : (
                <table className="portfolio-table">
                  <thead>
                    <tr>
                      <th>Security Code</th>
                      <th>Quantity</th>
                      <th>Avg. Price</th>
                      <th>Sector</th>
                      <th>Name</th>
                      <th>Current Price</th>
                      <th>Invested</th>
                      <th>Current</th>
                      <th>Abs P&amp;L</th>
                      <th>Abs.P&amp;L %</th>
                      <th>Goal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {internationalPortfolio.holdings.map((holding) => {
                      const pnlValue = parseAmount(holding.pnl);
                      const pnlPercent = parseAmount(holding.pnl_percent);
                      return (
                        <tr key={holding.id}>
                          <td>{holding.symbol}</td>
                          <td>{holding.quantity}</td>
                          <td>{holding.avg_price}</td>
                          <td>{holding.sector_name ?? "-"}</td>
                          <td title={holding.security_name ?? holding.symbol} className="table-text-ellipsis">
                            {holding.security_name ?? holding.symbol}
                          </td>
                          <td>{holding.current_price}</td>
                          <td>{formatCurrency(parseAmount(holding.invested_amount))}</td>
                          <td>{formatCurrency(parseAmount(holding.current_value))}</td>
                          <td className={pnlValue >= 0 ? "amount-positive" : "amount-negative"}>{formatSignedCurrency(pnlValue)}</td>
                          <td className={pnlPercent >= 0 ? "amount-positive" : "amount-negative"}>
                            {pnlPercent >= 0 ? "+" : ""}
                            {pnlPercent.toFixed(2)}%
                          </td>
                          <td>{holding.goal_name ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </section>
    );
  }

  function renderProfileSection() {
    return (
      <section className="workspace-panel">
        <div>
          <p className="eyebrow">Profile</p>
          <h2>Account details</h2>
        </div>
        <div className="profile-grid">
          <article>
            <p>Email</p>
            <strong>{profile.email}</strong>
          </article>
          <article>
            <p>Display name</p>
            <strong>{displayName}</strong>
          </article>
          <article>
            <p>Total accounts</p>
            <strong>{accounts.length}</strong>
          </article>
          <article>
            <p>Total transactions</p>
            <strong>{transactions.length}</strong>
          </article>
          <article>
            <p>Goals count</p>
            <strong>{goalsCount}</strong>
          </article>
        </div>
        <p>Member since {new Date(profile.created_at).toLocaleDateString()}</p>
      </section>
    );
  }

  function renderMainSection() {
    if (loadingWorkspace) {
      return (
        <section className="workspace-panel">
          <p>Loading workspace...</p>
        </section>
      );
    }
    if (activeSection === "Dashboard") return renderDashboardSection();
    if (activeSection === "Transaction") {
      return renderRecentTransactionsSection();
    }
    if (activeSection === "Investment") return renderInvestmentSection();
    if (activeSection === "Budget") return renderBudgetSection();
    if (activeSection === "Goal") return renderGoalSection();
    if (activeSection === "Accounts") return renderAccountSection();
    if (activeSection === "Profile") return renderProfileSection();
    return (
      <section className="workspace-panel">
        <div>
          <p className="eyebrow">Coming soon</p>
          <h2>{activeSection}</h2>
        </div>
        <p>This section is available in navigation and will be connected to backend APIs next.</p>
      </section>
    );
  }

  const sidebarCollapsed = !sidebarHovered;

  return (
    <main className={`dashboard-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside
        className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}
        aria-label="Sidebar"
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        <div className="sidebar-brand">
          <div className="sidebar-mark">
            <WalletCards size={20} />
          </div>
          <div className="sidebar-brand-copy">
            <p className="eyebrow">Ledgr</p>
            <strong>Workspace</strong>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Workspace sections">
          {sections.map((section) => (
            <button
              key={section.label}
              className={activeSection === section.label ? "active" : ""}
              title={section.label}
              type="button"
              onClick={() => onSelectSection(section.label)}
            >
              {section.icon}
              <span className="sidebar-label">{section.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <span>Workspace</span>
              <span>/</span>
              <span>{activeSection}</span>
            </nav>
            <h1>{activeSection}</h1>
          </div>
          <div className="topbar-actions">
            <button
              className="subtle-action add-transaction-action"
              type="button"
              onClick={() => setShowTransactionComposer((current) => !current)}
            >
              {showTransactionComposer ? "Close transaction" : "Add transaction"}
            </button>
            <button className="subtle-action icon-action" type="button" aria-label="Logout" title="Logout" onClick={onLogout}>
              <LogOut size={16} />
            </button>
            <div className="profile-pill">
              <UserRound size={18} />
              <span>{displayName}</span>
            </div>
          </div>
        </header>
        {workspaceMessage && <div className="notice success">{workspaceMessage}</div>}
        {workspaceError && <div className="notice">{workspaceError}</div>}
        <div className="toolbar-row">
          <button
            className="subtle-action icon-action"
            type="button"
            aria-label="Refresh data"
            title="Refresh data"
            onClick={() => void loadWorkspace()}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {showTransactionComposer && (
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => setShowTransactionComposer(false)}
          >
            <div
              className="transaction-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Add transaction"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2>Add transaction</h2>
                <button
                  className="subtle-action small-action icon-action"
                  type="button"
                  aria-label="Close add transaction form"
                  onClick={() => setShowTransactionComposer(false)}
                >
                  <X size={14} />
                </button>
              </div>
              {renderTransactionComposer()}
            </div>
          </div>
        )}
        {editingDefaultBalanceField !== null && (
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => {
              if (!savingDefaultBalances) {
                setEditingDefaultBalanceField(null);
              }
            }}
          >
            <div
              className="transaction-modal default-balance-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Edit opening balance"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2>{editingDefaultBalanceField === "cash" ? "Edit Cash opening balance" : "Edit Pending opening balance"}</h2>
                <button
                  className="subtle-action icon-action"
                  type="button"
                  aria-label="Close opening balance editor"
                  disabled={savingDefaultBalances}
                  onClick={() => setEditingDefaultBalanceField(null)}
                >
                  <X size={14} />
                </button>
              </div>
              <form
                className="workspace-form single-field-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveDefaultBalanceEdit();
                }}
              >
                <label>
                  Opening balance
                  <input
                    required
                    step="0.01"
                    type="number"
                    value={defaultBalanceDraft}
                    onChange={(event) => setDefaultBalanceDraft(event.target.value)}
                  />
                </label>
                <button className="primary-action compact-primary-action" disabled={savingDefaultBalances} type="submit">
                  {savingDefaultBalances && <Loader2 className="spin" size={16} />}
                  {savingDefaultBalances ? "Saving" : "Save changes"}
                </button>
              </form>
            </div>
          </div>
        )}
        {renderMainSection()}
      </section>
    </main>
  );
}

export default App;
