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
  Category,
  CategoryGroups,
  CategoryKind,
  CreateAccountPayload,
  CreateBudgetPayload,
  CreateGoalPayload,
  CreateTransactionPayload,
  Budget,
  Goal,
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
  const [savingBudget, setSavingBudget] = useState(false);
  const [savingTransaction, setSavingTransaction] = useState(false);
  const [showTransactionComposer, setShowTransactionComposer] = useState(false);
  const [editingDefaultBalanceField, setEditingDefaultBalanceField] = useState<"cash" | "pending" | null>(null);
  const [defaultBalanceDraft, setDefaultBalanceDraft] = useState("");
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [activeInvestmentTab, setActiveInvestmentTab] = useState<(typeof investmentTabNames)[number]>(investmentTabNames[0]);
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
    const [accountsResult, goalsResult, budgetsResult, transactionsResult, categoriesResult] = await Promise.allSettled([
      api.listAccounts(token),
      api.listGoals(token),
      api.listBudgets(token),
      api.listTransactions(token),
      api.listCategories(token)
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

    const failed = [accountsResult, goalsResult, budgetsResult, transactionsResult, categoriesResult].filter(
      (result) => result.status === "rejected"
    );
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

  async function submitDefaultOpeningBalances(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingDefaultBalances(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    try {
      await api.setupDefaultOpeningBalances(token, {
        cash_opening_balance: defaultBalancesForm.cashOpeningBalance || "0.00",
        pending_from_friends_opening_balance: defaultBalancesForm.pendingFromFriendsOpeningBalance || "0.00"
      });
      setWorkspaceMessage("Default account opening balances updated.");
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to update default opening balances.");
    } finally {
      setSavingDefaultBalances(false);
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
              const progress = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
              return (
                <article key={goal.id} className="data-row">
                  <div>
                    <strong>{goal.name}</strong>
                    <p>
                      {formatCurrency(current)} / {formatCurrency(target)} - {progress}% complete
                    </p>
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
    return (
      <section className="workspace-panel">
        <div>
          <p className="eyebrow">Investment</p>
          <h2>Track investment categories</h2>
        </div>
        <div className="section-pills" aria-label="Investment categories">
          {investmentTabNames.map((tabName) => (
            <button
              key={tabName}
              className={activeInvestmentTab === tabName ? "active" : ""}
              type="button"
              onClick={() => setActiveInvestmentTab(tabName)}
            >
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
