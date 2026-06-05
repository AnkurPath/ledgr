import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Banknote,
  CalendarDays,
  CircleDollarSign,
  Loader2,
  Plus,
  ReceiptText,
  Tag as TagIcon,
  Trash2,
  UserRound
} from "lucide-react";
import { api } from "./api";
import type { Account, Category, CategoryKind, DailyExpenseSummary, Expense, ExpenseCreate, Tag, User } from "./types";

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

function formatMoney(value: string | number) {
  return currency.format(Number(value));
}

function compactKind(kind: CategoryKind) {
  return kind.replace("_", " ");
}

const blankExpense: ExpenseCreate = {
  expense_date: today,
  description: "",
  amount: "",
  category: "",
  payment_method: "",
  notes: ""
};

function App() {
  const [health, setHealth] = useState<"checking" | "ok" | "offline">("checking");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<DailyExpenseSummary[]>([]);
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expenseForm, setExpenseForm] = useState<ExpenseCreate>(blankExpense);
  const [userForm, setUserForm] = useState({ username: "", display_name: "" });
  const [accountForm, setAccountForm] = useState({ name: "", account_type: "", opening_balance: "0.00" });
  const [categoryForm, setCategoryForm] = useState<{ name: string; kind: CategoryKind }>({
    name: "",
    kind: "expense"
  });
  const [tagForm, setTagForm] = useState({ name: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const expenseCategories = categories.filter((category) => category.kind === "expense");

  const totals = useMemo(() => {
    const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const average = summary.length > 0 ? total / summary.length : 0;
    const largest = expenses.reduce((max, expense) => Math.max(max, Number(expense.amount)), 0);
    return { total, average, largest };
  }, [expenses, summary.length]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [status, userRows, expenseRows, summaryRows] = await Promise.all([
        api.health(),
        api.users(),
        api.expenses({ from_date: fromDate, to_date: toDate, category: categoryFilter }),
        api.dailySummary({ from_date: fromDate, to_date: toDate })
      ]);
      setHealth(status.status === "ok" ? "ok" : "offline");
      setUsers(userRows);
      setExpenses(expenseRows);
      setSummary(summaryRows);
      setSelectedUserId((current) => current ?? userRows[0]?.id ?? null);
    } catch (caught) {
      setHealth("offline");
      setError(caught instanceof Error ? caught.message : "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, fromDate, toDate]);

  const loadSetup = useCallback(async (userId: number) => {
    setError(null);
    try {
      const [accountRows, categoryRows, tagRows] = await Promise.all([
        api.accounts(userId),
        api.categories(userId),
        api.tags(userId)
      ]);
      setAccounts(accountRows);
      setCategories(categoryRows);
      setTags(tagRows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load setup data.");
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (selectedUserId !== null) {
      void loadSetup(selectedUserId);
    } else {
      setAccounts([]);
      setCategories([]);
      setTags([]);
    }
  }, [loadSetup, selectedUserId]);

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("expense");
    setError(null);
    try {
      await api.createExpense({
        ...expenseForm,
        category: expenseForm.category || null,
        payment_method: expenseForm.payment_method || null,
        notes: expenseForm.notes || null
      });
      setExpenseForm({ ...blankExpense, expense_date: expenseForm.expense_date });
      await loadDashboard();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save expense.");
    } finally {
      setSaving(null);
    }
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("user");
    setError(null);
    try {
      const user = await api.createUser({
        username: userForm.username,
        display_name: userForm.display_name || null
      });
      setUserForm({ username: "", display_name: "" });
      setSelectedUserId(user.id);
      await loadDashboard();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create user.");
    } finally {
      setSaving(null);
    }
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedUserId === null) return;
    setSaving("account");
    setError(null);
    try {
      await api.createAccount(selectedUserId, {
        name: accountForm.name,
        account_type: accountForm.account_type || null,
        opening_balance: accountForm.opening_balance || "0.00"
      });
      setAccountForm({ name: "", account_type: "", opening_balance: "0.00" });
      await loadSetup(selectedUserId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create account.");
    } finally {
      setSaving(null);
    }
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedUserId === null) return;
    setSaving("category");
    setError(null);
    try {
      await api.createCategory(selectedUserId, categoryForm);
      setCategoryForm({ ...categoryForm, name: "" });
      await loadSetup(selectedUserId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create category.");
    } finally {
      setSaving(null);
    }
  }

  async function submitTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedUserId === null) return;
    setSaving("tag");
    setError(null);
    try {
      await api.createTag(selectedUserId, tagForm);
      setTagForm({ name: "" });
      await loadSetup(selectedUserId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create tag.");
    } finally {
      setSaving(null);
    }
  }

  async function deleteExpense(expenseId: number) {
    setSaving(`delete-${expenseId}`);
    setError(null);
    try {
      await api.deleteExpense(expenseId);
      await loadDashboard();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete expense.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Ledgr</p>
          <h1>Personal finance workspace</h1>
        </div>
        <div className={`status-pill ${health}`}>
          <Activity size={16} />
          <span>{health === "checking" ? "Checking API" : health === "ok" ? "API online" : "API offline"}</span>
        </div>
      </header>

      {error && <div className="notice">{error}</div>}

      <section className="toolbar" aria-label="Expense filters">
        <label>
          From
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
        <label>
          Category
          <input value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} placeholder="All" />
        </label>
        <button className="primary-action" type="button" onClick={() => void loadDashboard()}>
          {loading ? <Loader2 className="spin" size={17} /> : <CalendarDays size={17} />}
          Refresh
        </button>
      </section>

      <section className="metric-grid" aria-label="Expense summary">
        <Metric icon={<CircleDollarSign size={22} />} label="Period spend" value={formatMoney(totals.total)} />
        <Metric icon={<ReceiptText size={22} />} label="Expenses" value={String(expenses.length)} />
        <Metric icon={<CalendarDays size={22} />} label="Daily average" value={formatMoney(totals.average)} />
        <Metric icon={<Banknote size={22} />} label="Largest item" value={formatMoney(totals.largest)} />
      </section>

      <section className="content-grid">
        <div className="panel expense-panel">
          <div className="panel-heading">
            <div>
              <h2>Expenses</h2>
              <p>{fromDate} to {toDate}</p>
            </div>
          </div>

          <form className="expense-form" onSubmit={submitExpense}>
            <input
              required
              type="date"
              value={expenseForm.expense_date}
              onChange={(event) => setExpenseForm({ ...expenseForm, expense_date: event.target.value })}
            />
            <input
              required
              value={expenseForm.description}
              onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })}
              placeholder="Description"
            />
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              value={expenseForm.amount}
              onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })}
              placeholder="Amount"
            />
            <input
              list="expense-categories"
              value={expenseForm.category ?? ""}
              onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })}
              placeholder="Category"
            />
            <datalist id="expense-categories">
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.name} />
              ))}
            </datalist>
            <input
              value={expenseForm.payment_method ?? ""}
              onChange={(event) => setExpenseForm({ ...expenseForm, payment_method: event.target.value })}
              placeholder="Payment method"
            />
            <button className="primary-action" disabled={saving === "expense"} type="submit">
              {saving === "expense" ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
              Add
            </button>
          </form>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Method</th>
                  <th className="amount-cell">Amount</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{expense.expense_date}</td>
                    <td>{expense.description}</td>
                    <td>{expense.category ?? "-"}</td>
                    <td>{expense.payment_method ?? "-"}</td>
                    <td className="amount-cell">{formatMoney(expense.amount)}</td>
                    <td className="icon-cell">
                      <button
                        className="icon-button"
                        disabled={saving === `delete-${expense.id}`}
                        title="Delete expense"
                        type="button"
                        onClick={() => void deleteExpense(expense.id)}
                      >
                        {saving === `delete-${expense.id}` ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && expenses.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-cell">No expenses match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="side-stack">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>Users</h2>
                <p>{selectedUser ? selectedUser.display_name ?? selectedUser.username : "No user selected"}</p>
              </div>
              <UserRound size={20} />
            </div>
            <select
              value={selectedUserId ?? ""}
              onChange={(event) => setSelectedUserId(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">Select user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name ?? user.username}
                </option>
              ))}
            </select>
            <form className="stack-form" onSubmit={submitUser}>
              <input
                required
                value={userForm.username}
                onChange={(event) => setUserForm({ ...userForm, username: event.target.value })}
                placeholder="Username"
              />
              <input
                value={userForm.display_name}
                onChange={(event) => setUserForm({ ...userForm, display_name: event.target.value })}
                placeholder="Display name"
              />
              <button className="secondary-action" disabled={saving === "user"} type="submit">
                <Plus size={16} />
                User
              </button>
            </form>
          </div>

          <SetupPanel
            icon={<Banknote size={20} />}
            title="Accounts"
            disabled={selectedUserId === null}
            onSubmit={submitAccount}
            buttonLabel="Account"
            saving={saving === "account"}
          >
            <input
              required
              value={accountForm.name}
              onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })}
              placeholder="Name"
            />
            <input
              value={accountForm.account_type}
              onChange={(event) => setAccountForm({ ...accountForm, account_type: event.target.value })}
              placeholder="Type"
            />
            <input
              required
              min="0"
              step="0.01"
              type="number"
              value={accountForm.opening_balance}
              onChange={(event) => setAccountForm({ ...accountForm, opening_balance: event.target.value })}
              placeholder="Opening balance"
            />
            <ChipList items={accounts.map((account) => `${account.name} ${formatMoney(account.opening_balance)}`)} />
          </SetupPanel>

          <SetupPanel
            icon={<ReceiptText size={20} />}
            title="Categories"
            disabled={selectedUserId === null}
            onSubmit={submitCategory}
            buttonLabel="Category"
            saving={saving === "category"}
          >
            <input
              required
              value={categoryForm.name}
              onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}
              placeholder="Name"
            />
            <select
              value={categoryForm.kind}
              onChange={(event) => setCategoryForm({ ...categoryForm, kind: event.target.value as CategoryKind })}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="non_expense">Non expense</option>
              <option value="non_income">Non income</option>
            </select>
            <ChipList items={categories.map((category) => `${category.name} / ${compactKind(category.kind)}`)} />
          </SetupPanel>

          <SetupPanel
            icon={<TagIcon size={20} />}
            title="Tags"
            disabled={selectedUserId === null}
            onSubmit={submitTag}
            buttonLabel="Tag"
            saving={saving === "tag"}
          >
            <input
              required
              value={tagForm.name}
              onChange={(event) => setTagForm({ name: event.target.value })}
              placeholder="Name"
            />
            <ChipList items={tags.map((tag) => tag.name)} />
          </SetupPanel>
        </aside>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <article className="metric">
      <div className="metric-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function SetupPanel({
  buttonLabel,
  children,
  disabled,
  icon,
  onSubmit,
  saving,
  title
}: {
  buttonLabel: string;
  children: React.ReactNode;
  disabled: boolean;
  icon: React.ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  title: string;
}) {
  return (
    <div className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        {icon}
      </div>
      <form className="stack-form" onSubmit={onSubmit}>
        <fieldset disabled={disabled || saving}>{children}</fieldset>
        <button className="secondary-action" disabled={disabled || saving} type="submit">
          {saving ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
          {buttonLabel}
        </button>
      </form>
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="muted">Nothing saved yet.</p>;
  }
  return (
    <div className="chip-list">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

export default App;
