import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  LogIn,
  LogOut,
  Pencil,
  PiggyBank,
  Plus,
  RefreshCw,
  Target,
  Trash2,
  TrendingUp,
  UserPlus,
  UserRound,
  Wallet,
  WalletCards,
  X
} from "lucide-react";
import { api, ApiError, accessTokenStorageKey, clearStoredTokens, persistTokens, refreshTokenStorageKey, tokensRefreshedEvent } from "./api";
import type {
  Account,
  AccountType,
  CategoryGroups,
  CategoryKind,
  CreateMutualFundInvestmentPayload,
  CreateInternationalInvestmentPayload,
  CreateStockInvestmentPayload,
  CreateCryptoInvestmentPayload,
  CreateAccountPayload,
  CreateBudgetPayload,
  CreateGoalPayload,
  CreateTransactionPayload,
  Budget,
  Goal,
  GoalTemplate,
  MutualFundPortfolio,
  MutualFundPortfolioHolding,
  MutualFundSearchItem,
  NetWorthOverview,
  StockPortfolio,
  CryptoPortfolio,
  InternationalPortfolio,
  InvestmentOptionsCatalog,
  Tag,
  TokenResponse,
  Transaction,
  TransactionType,
  UserProfile
} from "./types";

type AuthMode = "login" | "register";
type PublicView = "landing" | "auth";
type DashboardSection = "Dashboard" | "Transaction" | "Investment" | "Budget" | "Goal" | "Accounts" | "Profile";
type TransactionDatePreset = "this_month" | "last_month" | "this_year" | "custom";
const ANALYSIS_TAG_NAMES = ["Needs", "Wants", "Investments"] as const;
type AnalysisTagName = (typeof ANALYSIS_TAG_NAMES)[number];
const ANALYSIS_TAG_COLORS: Record<AnalysisTagName, string> = {
  Needs: "#0a0a0a",
  Wants: "#6b6b6b",
  Investments: "#b0b0b0"
};
const ASSET_CLASS_LABELS = [
  "Mutual Funds",
  "Stocks",
  "International Investment",
  "EPF/PPF/NPS",
  "Gold",
  "Fixed Deposit",
  "Real Estate",
  "Crypto"
] as const;
type AssetClassLabel = (typeof ASSET_CLASS_LABELS)[number];
const INVESTMENT_ALLOCATION_COLORS: Record<AssetClassLabel, string> = {
  "Mutual Funds": "#1e3a5f",
  Stocks: "#3b6ea5",
  "International Investment": "#6b8cae",
  "EPF/PPF/NPS": "#5c5346",
  Gold: "#d4af37",
  "Fixed Deposit": "#8b7355",
  "Real Estate": "#c0563a",
  Crypto: "#8b5e3c"
};
const TRANSACTION_ASSET_CLASSES = ["EPF/PPF/NPS", "Fixed Deposit", "Real Estate"] as const;
type TransactionAssetClass = (typeof TRANSACTION_ASSET_CLASSES)[number];
const INVESTMENT_TAB_ASSET_CLASSES = ASSET_CLASS_LABELS.filter(
  (label) => label !== "Gold"
) as Exclude<AssetClassLabel, "Gold">[];

function isTransactionAssetClass(label: string): label is TransactionAssetClass {
  return (TRANSACTION_ASSET_CLASSES as readonly string[]).includes(label);
}

function isGoldLabeled(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === "gold";
}

function isInternationalLabeled(name: string | null | undefined): boolean {
  const normalized = (name ?? "").trim().toLowerCase();
  return normalized === "international fund" || normalized === "international";
}

function mutualFundOverviewClass(categoryName: string | null | undefined): AssetClassLabel {
  if (isGoldLabeled(categoryName)) {
    return "Gold";
  }
  if (isInternationalLabeled(categoryName)) {
    return "International Investment";
  }
  return "Mutual Funds";
}

function stockOverviewClass(sectorName: string | null | undefined): AssetClassLabel {
  if (isGoldLabeled(sectorName)) {
    return "Gold";
  }
  if (isInternationalLabeled(sectorName)) {
    return "International Investment";
  }
  return "Stocks";
}

function internationalOverviewClass(sectorName: string | null | undefined): AssetClassLabel {
  return isGoldLabeled(sectorName) ? "Gold" : "International Investment";
}

const investmentTabNames = ["Overview", ...INVESTMENT_TAB_ASSET_CLASSES] as const;

type GoalPercentAllocation = { goalId: string; percent: string };

function goalCompletionPercent(goal: Goal, currentAmount?: number): number {
  const target = parseAmount(goal.target_amount);
  if (target <= 0) {
    return 0;
  }
  const current = currentAmount ?? parseAmount(goal.current_amount);
  return Math.min(100, (current / target) * 100);
}

function compareGoalsByCompletion(
  left: Goal,
  right: Goal,
  currentById?: Map<string, number>
): number {
  const completionDelta =
    goalCompletionPercent(right, currentById?.get(right.id)) -
    goalCompletionPercent(left, currentById?.get(left.id));
  if (completionDelta !== 0) {
    return completionDelta;
  }
  return left.name.localeCompare(right.name);
}

function formatPercentValue(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function formatInvestmentSummaryNote(parts: string[]): string {
  if (parts.length === 0) {
    return "Mutual funds, stocks & international";
  }
  if (parts.length === 1) {
    return parts[0];
  }
  if (parts.length === 2) {
    return `${parts[0]} & ${parts[1]}`;
  }
  return `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;
}

function equalGoalPercents(count: number): string[] {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return ["100.00"];
  }
  const base = Math.floor(10000 / count) / 100;
  const percents = Array.from({ length: count }, () => base);
  const assigned = base * (count - 1);
  percents[count - 1] = Math.round((100 - assigned) * 100) / 100;
  return percents.map((value) => formatPercentValue(value));
}

function redistributeGoalPercents(allocations: GoalPercentAllocation[]): GoalPercentAllocation[] {
  const percents = equalGoalPercents(allocations.length);
  return allocations.map((entry, index) => ({ ...entry, percent: percents[index] ?? "0.00" }));
}

function toggleGoalPercentAllocation(
  current: GoalPercentAllocation[],
  goalId: string
): GoalPercentAllocation[] {
  const exists = current.some((entry) => entry.goalId === goalId);
  const next = exists
    ? current.filter((entry) => entry.goalId !== goalId)
    : [...current, { goalId, percent: "0" }];
  return redistributeGoalPercents(next);
}

function updateGoalPercent(
  current: GoalPercentAllocation[],
  goalId: string,
  percent: string
): GoalPercentAllocation[] {
  return current.map((entry) => (entry.goalId === goalId ? { ...entry, percent } : entry));
}

function goalPercentTotal(allocations: GoalPercentAllocation[]): number {
  return allocations.reduce((sum, entry) => sum + (Number.parseFloat(entry.percent) || 0), 0);
}

function validateGoalPercentAllocations(allocations: GoalPercentAllocation[]): string | null {
  if (allocations.length === 0) {
    return null;
  }
  const total = goalPercentTotal(allocations);
  if (Math.abs(total - 100) > 0.01) {
    return `Goal percentages must add up to 100% (currently ${total.toFixed(2)}%).`;
  }
  if (allocations.some((entry) => (Number.parseFloat(entry.percent) || 0) <= 0)) {
    return "Each selected goal needs a percentage greater than 0.";
  }
  return null;
}

function splitQuantityByPercents(total: number, percents: number[], decimalPlaces: number): number[] {
  if (percents.length === 0) {
    return [];
  }
  const factor = 10 ** decimalPlaces;
  const roundedTotal = Math.round(total * factor) / factor;
  const shares = percents.map((percent) => Math.floor((roundedTotal * percent * factor) / 100) / factor);
  const assigned = shares.slice(0, -1).reduce((sum, value) => sum + value, 0);
  shares[shares.length - 1] = Math.round((roundedTotal - assigned) * factor) / factor;
  return shares;
}

function quantityToPayload(value: number, decimalPlaces: number): string {
  return value.toFixed(decimalPlaces);
}

type GoalQuantitySibling = { id: string; goal_id: string | null; quantity: number };

function proportionsFromQuantities(quantities: number[]): number[] {
  const total = quantities.reduce((sum, value) => sum + value, 0);
  if (quantities.length === 0) {
    return [];
  }
  if (total <= 0) {
    return equalGoalPercents(quantities.length).map((value) => Number.parseFloat(value));
  }
  const percents = quantities.map((value) => (value / total) * 100);
  const rounded = percents.map((percent, index) =>
    index === percents.length - 1 ? 0 : Math.round(percent * 100) / 100
  );
  const assigned = rounded.slice(0, -1).reduce((sum, value) => sum + value, 0);
  rounded[rounded.length - 1] = Math.round((100 - assigned) * 100) / 100;
  return rounded;
}

function resolveSipGoalSplits(options: {
  pickerAllocations: GoalPercentAllocation[];
  siblingHoldings: GoalQuantitySibling[];
}): { goalIds: (string | null)[]; percents: number[]; usedExistingSiblings: boolean } {
  if (options.pickerAllocations.length > 0) {
    return {
      goalIds: options.pickerAllocations.map((entry) => entry.goalId),
      percents: options.pickerAllocations.map((entry) => Number.parseFloat(entry.percent) || 0),
      usedExistingSiblings: false
    };
  }

  const siblings = options.siblingHoldings.filter((holding) => holding.goal_id != null);
  if (siblings.length > 0) {
    return {
      goalIds: siblings.map((holding) => holding.goal_id),
      percents: proportionsFromQuantities(siblings.map((holding) => holding.quantity)),
      usedExistingSiblings: siblings.length > 1
    };
  }

  return { goalIds: [null], percents: [100], usedExistingSiblings: false };
}

function mutualFundGoalSiblings(
  holdings: MutualFundPortfolioHolding[],
  schemeCode: number
): GoalQuantitySibling[] {
  return holdings
    .filter((holding) => holding.scheme_code === schemeCode && holding.goal_id != null)
    .map((holding) => ({
      id: holding.id,
      goal_id: holding.goal_id,
      quantity: parseAmount(holding.units)
    }));
}

function symbolGoalSiblings(
  holdings: Array<{ id: string; symbol: string; goal_id: string | null; quantity: string }>,
  symbol: string
): GoalQuantitySibling[] {
  const normalized = symbol.trim().toUpperCase();
  return holdings
    .filter((holding) => holding.symbol.trim().toUpperCase() === normalized && holding.goal_id != null)
    .map((holding) => ({
      id: holding.id,
      goal_id: holding.goal_id,
      quantity: parseAmount(holding.quantity)
    }));
}

type LinkedGoalShare = { goalId: string; goalName: string; percent: number };

function linkedGoalShares(
  siblings: Array<{ goal_id: string | null; goal_name: string | null; quantity: number }>
): LinkedGoalShare[] {
  const withGoals = siblings.filter((entry) => entry.goal_id != null);
  const percents = proportionsFromQuantities(withGoals.map((entry) => entry.quantity));
  return withGoals.map((entry, index) => ({
    goalId: entry.goal_id as string,
    goalName: entry.goal_name?.trim() || "Goal",
    percent: percents[index] ?? 0
  }));
}

function LinkedGoalsCell({ shares }: { shares: LinkedGoalShare[] }) {
  return (
    <div className="linked-goals-cell">
      {shares.map((share) => (
        <span key={share.goalId} className="linked-goals-chip">
          {share.goalName} {share.percent.toFixed(0)}%
        </span>
      ))}
    </div>
  );
}

function GoalAllocationPicker({
  goals,
  allocations,
  onChange,
  sipHint
}: {
  goals: Goal[];
  allocations: GoalPercentAllocation[];
  onChange: (next: GoalPercentAllocation[]) => void;
  sipHint?: string | null;
}) {
  const total = goalPercentTotal(allocations);
  const totalOk = allocations.length === 0 || Math.abs(total - 100) <= 0.01;

  return (
    <div className="goal-allocation-picker">
      <div className="goal-allocation-picker-header">
        <span>Goals &amp; allocation</span>
        {allocations.length > 0 ? (
          <span className={`goal-allocation-total${totalOk ? " ok" : " bad"}`}>Total {total.toFixed(2)}%</span>
        ) : (
          <span className="goal-allocation-total">Optional — select one or more goals</span>
        )}
      </div>
      {sipHint ? <p className="form-hint goal-sip-hint">{sipHint}</p> : null}
      {goals.length === 0 ? (
        <p className="form-hint">No goals yet. Create goals to split this investment across them.</p>
      ) : (
        <div className="goal-allocation-list">
          {goals.map((goal) => {
            const selected = allocations.find((entry) => entry.goalId === goal.id);
            return (
              <div key={goal.id} className={`goal-allocation-row${selected ? " selected" : ""}`}>
                <label className="goal-allocation-check">
                  <input
                    type="checkbox"
                    checked={Boolean(selected)}
                    onChange={() => onChange(toggleGoalPercentAllocation(allocations, goal.id))}
                  />
                  <span>{goal.name}</span>
                </label>
                {selected && (
                  <label className="goal-allocation-percent">
                    <input
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={selected.percent}
                      onChange={(event) => onChange(updateGoalPercent(allocations, goal.id, event.target.value))}
                    />
                    <span>%</span>
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
      {allocations.length > 1 && (
        <p className="form-hint">
          Selecting goals auto-fills equal percentages (for example 50/50 or 33.33/33.33/33.34). Adjust as needed so
          they total 100%.
        </p>
      )}
    </div>
  );
}

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

type AllocationItem = { label: string; value: number; color: string };

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians)
  };
}

function describeDonutSlice(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
) {
  const sweep = Math.max(endAngle - startAngle, 0.001);
  const largeArc = sweep > 180 ? 1 : 0;
  const outerStart = polarToCartesian(cx, cy, outerRadius, endAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${innerEnd.x} ${innerEnd.y}`,
    "Z"
  ].join(" ");
}

function AllocationDonutChart({
  items,
  activeLabel,
  onSelect,
  size,
  holeRatio = 0.62,
  explodeDistance = 10,
  centerValue,
  centerLabel,
  ariaLabel
}: {
  items: AllocationItem[];
  activeLabel: string | null;
  onSelect: (label: string) => void;
  size: number;
  holeRatio?: number;
  explodeDistance?: number;
  centerValue?: string;
  centerLabel?: string;
  ariaLabel: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - explodeDistance - 2;
  const innerRadius = outerRadius * holeRatio;
  let cursor = 0;
  const slices =
    total <= 0
      ? []
      : items
          .filter((item) => item.value > 0)
          .map((item) => {
            const sweep = Math.min((item.value / total) * 360, 359.999);
            const startAngle = cursor;
            const endAngle = cursor + sweep;
            cursor += (item.value / total) * 360;
            const midAngle = startAngle + sweep / 2;
            const isActive = activeLabel === item.label;
            const offset = isActive ? explodeDistance : 0;
            const radians = ((midAngle - 90) * Math.PI) / 180;
            return {
              ...item,
              startAngle,
              endAngle,
              path: describeDonutSlice(cx, cy, outerRadius, innerRadius, startAngle, endAngle),
              transform: `translate(${Math.cos(radians) * offset} ${Math.sin(radians) * offset})`,
              isActive
            };
          });

  return (
    <div className="allocation-donut-wrap" style={{ width: size, height: size }}>
      <svg
        className="allocation-donut-svg"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel}
      >
        {slices.length === 0 ? (
          <circle cx={cx} cy={cy} r={outerRadius} fill="#f0f0f0" />
        ) : (
          slices.map((slice) => (
            <path
              key={slice.label}
              className={`allocation-donut-slice${slice.isActive ? " active" : ""}${activeLabel && !slice.isActive ? " dimmed" : ""}`}
              d={slice.path}
              fill={slice.color}
              transform={slice.transform}
              data-allocation-interactive="true"
              onClick={() => onSelect(slice.label)}
              style={{ cursor: "pointer" }}
            >
              <title>{`${slice.label}: ${((slice.value / total) * 100).toFixed(1)}%`}</title>
            </path>
          ))
        )}
        <circle cx={cx} cy={cy} r={innerRadius - 1} fill="#fff" />
      </svg>
      {(centerValue || centerLabel) && (
        <div className="allocation-donut-center">
          {centerValue ? <strong>{centerValue}</strong> : null}
          {centerLabel ? <span>{centerLabel}</span> : null}
        </div>
      )}
    </div>
  );
}

function AllocationBarChart({
  items,
  activeLabel,
  onSelect,
  height = 220,
  centerValue,
  centerLabel,
  ariaLabel
}: {
  items: AllocationItem[];
  activeLabel: string | null;
  onSelect: (label: string) => void;
  height?: number;
  centerValue?: string;
  centerLabel?: string;
  ariaLabel: string;
}) {
  const bars = items.filter((item) => item.value > 0);
  const total = bars.reduce((sum, item) => sum + item.value, 0);
  const maxValue = Math.max(...bars.map((item) => item.value), 1);
  const plottedBars = bars.map((item) => {
    const share = total > 0 ? (item.value / total) * 100 : 0;
    const heightPercent = Math.max((item.value / maxValue) * 100, 6);
    return { ...item, share, heightPercent };
  });
  const linePoints = plottedBars
    .map((item, index) => {
      const x = ((index + 0.5) / plottedBars.length) * 100;
      const y = 100 - item.heightPercent;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="allocation-bar-chart" style={{ minHeight: height }}>
      {(centerValue || centerLabel) && (
        <div className="allocation-bar-summary">
          {centerValue ? <strong>{centerValue}</strong> : null}
          {centerLabel ? <span>{centerLabel}</span> : null}
        </div>
      )}
      <div className="allocation-bar-plot" role="img" aria-label={ariaLabel}>
        {plottedBars.length === 0 ? (
          <div className="allocation-bar-empty">No allocation data</div>
        ) : (
          <>
            <div className="allocation-bar-canvas">
              {plottedBars.length > 1 && (
                <svg
                  className="allocation-bar-trend"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polyline
                    className="allocation-bar-trend-line"
                    points={linePoints}
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
              {plottedBars.map((item) => {
                const isActive = activeLabel === item.label;
                return (
                  <button
                    key={item.label}
                    type="button"
                    data-allocation-interactive="true"
                    className={`allocation-bar-group${isActive ? " active" : ""}${activeLabel && !isActive ? " dimmed" : ""}`}
                    onClick={() => onSelect(item.label)}
                    aria-label={`${item.label}: ${item.share.toFixed(1)}%`}
                    title={`${item.label}: ${item.share.toFixed(1)}%`}
                  >
                    <span className="allocation-bar-track">
                      <span
                        className="allocation-bar-point"
                        style={{ bottom: `${item.heightPercent}%` }}
                      >
                        <span className="allocation-bar-percent">{item.share.toFixed(1)}%</span>
                        <span className="allocation-bar-dot" style={{ backgroundColor: item.color }} />
                      </span>
                      <span
                        className="allocation-bar"
                        style={{ height: `${item.heightPercent}%`, backgroundColor: item.color }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="allocation-bar-labels">
              {plottedBars.map((item) => (
                <span key={`label-${item.label}`} className="allocation-bar-label">
                  {item.label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
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

function formatUsdCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatSignedUsdCurrency(value: number) {
  if (value > 0) {
    return `+${formatUsdCurrency(value)}`;
  }
  if (value < 0) {
    return `-${formatUsdCurrency(Math.abs(value))}`;
  }
  return formatUsdCurrency(value);
}

function formatClockLabel(value = new Date()) {
  const date = value.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const time = value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
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

function pnlTone(value: number): "gain" | "loss" | "flat" {
  if (value > 0) {
    return "gain";
  }
  if (value < 0) {
    return "loss";
  }
  return "flat";
}

function pnlAmountClass(tone: "gain" | "loss" | "flat") {
  if (tone === "gain") {
    return "amount-positive";
  }
  if (tone === "loss") {
    return "amount-negative";
  }
  return "amount-neutral";
}

function formatPnlPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function toDateInputValue(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function dateInputToIso(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getTransactionDateRange(
  preset: TransactionDatePreset,
  customStart: string,
  customEnd: string
): { start: Date; end: Date } {
  const now = new Date();
  if (preset === "this_month") {
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }
  if (preset === "last_month") {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
  }
  if (preset === "this_year") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
    };
  }
  const start = customStart ? new Date(`${customStart}T00:00:00`) : startOfMonth(now);
  const end = customEnd ? new Date(`${customEnd}T23:59:59.999`) : endOfMonth(now);
  return { start, end };
}

function isDateInRange(value: string, start: Date, end: Date) {
  const date = new Date(value);
  return date >= start && date <= end;
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

function readPublicViewFromHash(): PublicView {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "login" || hash === "register" || hash === "auth") {
    return "auth";
  }
  return "landing";
}

function readAuthModeFromHash(): AuthMode {
  const hash = window.location.hash.replace(/^#/, "");
  return hash === "register" ? "register" : "login";
}

function LandingPage({
  onGetStarted,
  onLogin
}: {
  onGetStarted: () => void;
  onLogin: () => void;
}) {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <button className="landing-brand" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          Ledgr
        </button>
        <div className="landing-nav-actions">
          <button className="landing-link" type="button" onClick={onLogin}>
            Log in
          </button>
          <button className="landing-nav-cta" type="button" onClick={onGetStarted}>
            Get started
          </button>
        </div>
      </header>

      <section className="landing-hero" aria-label="Ledgr introduction">
        <div className="landing-hero-plane" aria-hidden="true">
          <div className="landing-hero-mesh" />
          <svg className="landing-hero-chart" viewBox="0 0 1200 640" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id="landing-chart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(0, 0, 0, 0.16)" />
                <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
              </linearGradient>
            </defs>
            <path
              className="landing-hero-chart-area"
              d="M0 520 C180 480 260 390 420 360 C580 330 640 420 780 300 C920 180 1020 220 1200 140 L1200 640 L0 640 Z"
              fill="url(#landing-chart-fill)"
            />
            <path
              className="landing-hero-chart-line"
              d="M0 520 C180 480 260 390 420 360 C580 330 640 420 780 300 C920 180 1020 220 1200 140"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="landing-hero-copy">
          <p className="landing-brand-hero">Ledgr</p>
          <h1>Personal finance, kept simple.</h1>
          <p className="landing-hero-support">
            Spend, save, and invest with a clear picture of where your money goes.
          </p>
          <div className="landing-hero-ctas">
            <button className="landing-cta-primary" type="button" onClick={onGetStarted}>
              Start free
              <ArrowRight size={18} />
            </button>
            <button className="landing-cta-ghost" type="button" onClick={onLogin}>
              Log in
            </button>
          </div>
        </div>
      </section>

      <section className="landing-focus" aria-label="What Ledgr helps with">
        <h2>Clarity for every rupee.</h2>
        <p>Accounts, budgets, investments, and goals — one quiet place to steer your money.</p>
      </section>
    </div>
  );
}

function App() {
  const [publicView, setPublicView] = useState<PublicView>(() => readPublicViewFromHash());
  const [mode, setMode] = useState<AuthMode>(() => readAuthModeFromHash());
  const [form, setForm] = useState(blankForm);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(accessTokenStorageKey));
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
    function onTokensRefreshed(event: Event) {
      const nextToken = (event as CustomEvent<string>).detail;
      if (typeof nextToken === "string" && nextToken) {
        setToken(nextToken);
      }
    }
    window.addEventListener(tokensRefreshedEvent, onTokensRefreshed);
    return () => window.removeEventListener(tokensRefreshedEvent, onTokensRefreshed);
  }, []);

  useEffect(() => {
    function syncFromHash() {
      if (localStorage.getItem(accessTokenStorageKey)) {
        return;
      }
      setPublicView(readPublicViewFromHash());
      setMode(readAuthModeFromHash());
    }
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
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
        clearStoredTokens();
        setToken(null);
      })
      .finally(() => setLoadingProfile(false));
  }, [token]);

  function openLanding() {
    setPublicView("landing");
    setError(null);
    setMessage(null);
    window.history.replaceState(null, "", window.location.pathname);
  }

  function openAuth(nextMode: AuthMode) {
    setMode(nextMode);
    setPublicView("auth");
    setError(null);
    setMessage(null);
    window.history.replaceState(null, "", `#${nextMode}`);
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
    window.history.replaceState(null, "", `#${nextMode}`);
  }

  function storeToken(response: TokenResponse) {
    persistTokens(response);
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

  async function logout() {
    const refreshToken = localStorage.getItem(refreshTokenStorageKey);
    if (refreshToken) {
      try {
        await api.logout(refreshToken);
      } catch {
        // Clear local session even if revoke fails.
      }
    }
    clearStoredTokens();
    window.history.replaceState(null, "", window.location.pathname);
    setToken(null);
    setProfile(null);
    setPublicView("landing");
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

  if (publicView === "landing") {
    return <LandingPage onGetStarted={() => openAuth("register")} onLogin={() => openAuth("login")} />;
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-label="Ledgr authentication">
        <div className="brand-pane">
          <button className="brand-home" type="button" onClick={openLanding}>
            <p className="brand-pane-name">Ledgr</p>
          </button>
          <h1>Personal finance, kept simple.</h1>
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

          <button className="auth-back-link" type="button" onClick={openLanding}>
            Back to home
          </button>
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
  const [tags, setTags] = useState<Tag[]>([]);
  const [transactionDatePreset, setTransactionDatePreset] = useState<TransactionDatePreset>("this_month");
  const [transactionCustomStart, setTransactionCustomStart] = useState(toDateInputValue(startOfMonth(new Date())));
  const [transactionCustomEnd, setTransactionCustomEnd] = useState(toDateInputValue(new Date()));
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
  const [cryptoPortfolio, setCryptoPortfolio] = useState<CryptoPortfolio | null>(null);
  const [internationalPortfolio, setInternationalPortfolio] = useState<InternationalPortfolio | null>(null);
  const [usdInrRate, setUsdInrRate] = useState<number | null>(null);
  const [netWorthOverview, setNetWorthOverview] = useState<NetWorthOverview | null>(null);
  const [monthDonutFocus, setMonthDonutFocus] = useState<"income" | "expenses" | null>(null);
  const [netWorthHoverIndex, setNetWorthHoverIndex] = useState<number | null>(null);
  const [analysisDonutFocus, setAnalysisDonutFocus] = useState<AnalysisTagName | "untagged" | null>(null);
  const [allocationFocus, setAllocationFocus] = useState<string | null>(null);
  const [goalAllocationFocus, setGoalAllocationFocus] = useState<{
    goalId: string;
    label: string | null;
  } | null>(null);

  useEffect(() => {
    if (allocationFocus === null && goalAllocationFocus === null) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("[data-allocation-interactive='true']")) {
        return;
      }
      setAllocationFocus(null);
      setGoalAllocationFocus(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [allocationFocus, goalAllocationFocus]);
  const [investmentOptions, setInvestmentOptions] = useState<InvestmentOptionsCatalog>({
    stock_sectors: [],
    international_sectors: [],
    mutual_fund_categories: [],
    crypto_sectors: []
  });
  const [loadingMutualFundSearch, setLoadingMutualFundSearch] = useState(false);
  const [savingMutualFundInvestment, setSavingMutualFundInvestment] = useState(false);
  const [savingStockInvestment, setSavingStockInvestment] = useState(false);
  const [savingInternationalInvestment, setSavingInternationalInvestment] = useState(false);
  const [savingCryptoInvestment, setSavingCryptoInvestment] = useState(false);
  const [loadingStockPrice, setLoadingStockPrice] = useState(false);
  const [loadingInternationalPrice, setLoadingInternationalPrice] = useState(false);
  const [loadingCryptoPrice, setLoadingCryptoPrice] = useState(false);
  const [refreshingInvestmentData, setRefreshingInvestmentData] = useState(false);
  const [latestNavDateFromSource, setLatestNavDateFromSource] = useState<string | null>(null);
  const [mutualFundForm, setMutualFundForm] = useState({
    goalAllocations: [] as GoalPercentAllocation[],
    categoryOptionId: "",
    units: "",
    avgPrice: ""
  });
  const [stockForm, setStockForm] = useState({
    symbol: "",
    companyName: "",
    exchange: "",
    goalAllocations: [] as GoalPercentAllocation[],
    sectorOptionId: "",
    quantity: "",
    avgPrice: "",
    currentPrice: ""
  });
  const [internationalForm, setInternationalForm] = useState({
    symbol: "",
    securityName: "",
    instrumentType: "stock" as "stock" | "index",
    goalAllocations: [] as GoalPercentAllocation[],
    sectorOptionId: "",
    quantity: "",
    avgPrice: "",
    currentPrice: ""
  });
  const [cryptoForm, setCryptoForm] = useState({
    symbol: "",
    assetName: "",
    sectorOptionId: "",
    quantity: "",
    avgPrice: "",
    currentPrice: "",
    goalAllocations: [] as GoalPercentAllocation[]
  });
  const [transactionAssetForm, setTransactionAssetForm] = useState({
    name: "",
    amount: "",
    goalAllocations: [] as GoalPercentAllocation[]
  });
  const [savingTransactionAsset, setSavingTransactionAsset] = useState(false);
  const [editingTransactionAssetId, setEditingTransactionAssetId] = useState<string | null>(null);
  const [transactionAssetEditForm, setTransactionAssetEditForm] = useState({
    name: "",
    amount: "",
    goalId: ""
  });
  const [savingTransactionAssetEdit, setSavingTransactionAssetEdit] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | number | null>(null);
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
    date: toDateInputValue(),
    transactionType: "EXPENSE" as TransactionType,
    amount: "",
    merchant: "",
    accountId: "",
    sourceAccountId: "",
    destinationAccountId: "",
    transferCategoryId: "",
    categoryId: "",
    tagId: "",
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
    currentAmount: "",
    targetDate: ""
  });
  const [goalTemplates, setGoalTemplates] = useState<GoalTemplate[]>([]);
  const [showSuggestedGoals, setShowSuggestedGoals] = useState(false);
  const [editingHoldingId, setEditingHoldingId] = useState<string | null>(null);
  const [holdingEditForm, setHoldingEditForm] = useState({
    unitsOrQuantity: "",
    avgPrice: "",
    optionId: "",
    goalId: ""
  });
  const [savingHoldingEdit, setSavingHoldingEdit] = useState(false);
  const [holdingPendingDelete, setHoldingPendingDelete] = useState<{
    id: string;
    label: string;
    assetClass: "mutual_funds" | "stocks" | "international" | "crypto" | "transaction_asset";
  } | null>(null);
  const [deletingHolding, setDeletingHolding] = useState(false);
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
    tagId: "",
    notes: ""
  });

  const sections: Array<{ icon: ReactNode; label: DashboardSection }> = [
    { icon: <BarChart3 size={16} />, label: "Dashboard" },
    { icon: <ArrowLeftRight size={16} />, label: "Transaction" },
    { icon: <TrendingUp size={16} />, label: "Investment" },
    { icon: <PiggyBank size={16} />, label: "Budget" },
    { icon: <Target size={16} />, label: "Goal" },
    { icon: <Wallet size={16} />, label: "Accounts" },
    { icon: <UserRound size={16} />, label: "Profile" }
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
  const refundCategoryOptions = useMemo(
    () => [...categoriesByKind.expense, ...categoriesByKind.refund],
    [categoriesByKind.expense, categoriesByKind.refund]
  );
  const transferUsesSourceDestination = Boolean(
    transferCategory && ["A/C Transfer", "Cash Withdrawal", "Business"].includes(transferCategory.name)
  );
  const totalBalance = useMemo(
    () => accounts.reduce((total, account) => total + parseAmount(account.current_balance), 0),
    [accounts]
  );
  const liquidBalance = useMemo(
    () =>
      accounts
        .filter((account) => account.account_type === "wallet" || account.account_type === "bank account")
        .reduce((total, account) => total + parseAmount(account.current_balance), 0),
    [accounts]
  );
  const creditCardUsage = useMemo(() => {
    const cards = accounts.filter((account) => account.account_type === "credit card");
    const used = cards.reduce((total, account) => total + Math.max(0, parseAmount(account.current_balance)), 0);
    const limit = cards.reduce((total, account) => total + parseAmount(account.credit_limit ?? "0"), 0);
    const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    return { used, limit, percent };
  }, [accounts]);
  const analysisTags = useMemo(() => {
    return ANALYSIS_TAG_NAMES.map((name) => {
      const tag = tags.find((item) => item.name.toLowerCase() === name.toLowerCase());
      return {
        name,
        id: tag ? String(tag.id) : "",
        color: tag?.color ?? ANALYSIS_TAG_COLORS[name]
      };
    }).filter((item) => item.id);
  }, [tags]);
  const expenseAnalysisTags = useMemo(
    () => analysisTags.filter((tag) => tag.name === "Needs" || tag.name === "Wants"),
    [analysisTags]
  );
  const analysisTagById = useMemo(() => {
    const map: Record<string, AnalysisTagName> = {};
    for (const tag of analysisTags) {
      map[tag.id] = tag.name;
    }
    return map;
  }, [analysisTags]);
  const transactionDateRange = useMemo(
    () => getTransactionDateRange(transactionDatePreset, transactionCustomStart, transactionCustomEnd),
    [transactionDatePreset, transactionCustomStart, transactionCustomEnd]
  );
  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) =>
        isDateInRange(transaction.date, transactionDateRange.start, transactionDateRange.end)
      ),
    [transactions, transactionDateRange]
  );
  // Portfolio holdings (EPF/PPF/NPS, FD, etc.) stay in Investment — not the Transactions ledger.
  const ledgerTransactions = useMemo(
    () => filteredTransactions.filter((transaction) => transaction.transaction_type !== "INVESTMENT"),
    [filteredTransactions]
  );
  // EPF/FD/RE holdings are stored as INVESTMENT rows but are not ledger transactions.
  const ledgerTransactionCount = useMemo(
    () => transactions.filter((transaction) => transaction.transaction_type !== "INVESTMENT").length,
    [transactions]
  );
  const spendingAnalysis = useMemo(() => {
    const totals: Record<AnalysisTagName, number> = {
      Needs: 0,
      Wants: 0,
      Investments: 0
    };
    let untagged = 0;
    for (const transaction of ledgerTransactions) {
      const type = transaction.transaction_type;
      if (type !== "EXPENSE" && type !== "REFUND") {
        continue;
      }
      const amount = Math.abs(parseAmount(transaction.amount));
      const sign = type === "REFUND" ? -1 : 1;
      const tagName = transaction.tag_id ? analysisTagById[String(transaction.tag_id)] : undefined;
      if (tagName === "Needs" || tagName === "Wants") {
        totals[tagName] += sign * amount;
      } else if (tagName === "Investments") {
        totals.Investments += amount;
      } else {
        untagged += sign * amount;
      }
    }
    for (const name of ANALYSIS_TAG_NAMES) {
      totals[name] = Math.max(0, totals[name]);
    }
    untagged = Math.max(0, untagged);
    const taggedTotal = totals.Needs + totals.Wants + totals.Investments;
    return { totals, taggedTotal, untagged, total: taggedTotal + untagged };
  }, [ledgerTransactions, analysisTagById]);
  const investmentCategoryById = useMemo(
    () => Object.fromEntries(categoriesByKind.investment.map((category) => [category.id, category.name])),
    [categoriesByKind.investment]
  );
  const transactionInvestmentValueByClass = useMemo(() => {
    const totals = Object.fromEntries(TRANSACTION_ASSET_CLASSES.map((label) => [label, 0])) as Record<
      TransactionAssetClass,
      number
    >;
    for (const transaction of transactions) {
      if (transaction.transaction_type !== "INVESTMENT" || !transaction.category_id) {
        continue;
      }
      const categoryName = investmentCategoryById[transaction.category_id];
      if (!categoryName || !isTransactionAssetClass(categoryName)) {
        continue;
      }
      totals[categoryName] += Math.abs(parseAmount(transaction.amount));
    }
    return totals;
  }, [transactions, investmentCategoryById]);
  const otherInvestmentsValue = useMemo(
    () => TRANSACTION_ASSET_CLASSES.reduce((sum, label) => sum + transactionInvestmentValueByClass[label], 0),
    [transactionInvestmentValueByClass]
  );
  const investmentsValue = useMemo(() => {
    const mf = parseAmount(mutualFundPortfolio?.total_current_value ?? "0");
    const stocks = parseAmount(stockPortfolio?.total_current_value ?? "0");
    const intlUsd = parseAmount(internationalPortfolio?.total_current_value ?? "0");
    const intl = usdInrRate !== null ? intlUsd * usdInrRate : 0;
    const cryptoUsd = parseAmount(cryptoPortfolio?.total_current_value ?? "0");
    const crypto = usdInrRate !== null ? cryptoUsd * usdInrRate : 0;
    return mf + stocks + intl + crypto + otherInvestmentsValue;
  }, [mutualFundPortfolio, stockPortfolio, internationalPortfolio, cryptoPortfolio, usdInrRate, otherInvestmentsValue]);
  const investmentSummaryNote = useMemo(() => {
    const mf = parseAmount(mutualFundPortfolio?.total_current_value ?? "0");
    const stocks = parseAmount(stockPortfolio?.total_current_value ?? "0");
    const intlUsd = parseAmount(internationalPortfolio?.total_current_value ?? "0");
    const intl = usdInrRate !== null ? intlUsd * usdInrRate : 0;
    const cryptoUsd = parseAmount(cryptoPortfolio?.total_current_value ?? "0");
    const crypto = usdInrRate !== null ? cryptoUsd * usdInrRate : 0;
    const parts: string[] = [];
    if (mf > 0) {
      parts.push("Mutual funds");
    }
    if (stocks > 0) {
      parts.push("stocks");
    }
    if (intl > 0) {
      parts.push("international");
    }
    if (transactionInvestmentValueByClass["EPF/PPF/NPS"] > 0) {
      parts.push("EPF/PPF/NPS");
    }
    if (crypto > 0) {
      parts.push("crypto");
    }
    if (transactionInvestmentValueByClass["Fixed Deposit"] > 0) {
      parts.push("fixed deposits");
    }
    if (transactionInvestmentValueByClass["Real Estate"] > 0) {
      parts.push("real estate");
    }
    return formatInvestmentSummaryNote(parts);
  }, [
    mutualFundPortfolio,
    stockPortfolio,
    internationalPortfolio,
    cryptoPortfolio,
    usdInrRate,
    transactionInvestmentValueByClass
  ]);
  const netWorth = useMemo(() => {
    if (netWorthOverview) {
      return parseAmount(netWorthOverview.net_worth);
    }
    return totalBalance + investmentsValue;
  }, [netWorthOverview, totalBalance, investmentsValue]);
  const netWorthHistory = useMemo(() => {
    if (netWorthOverview?.history?.length) {
      return netWorthOverview.history.map((point) => ({
        date: point.date,
        value: parseAmount(point.net_worth)
      }));
    }
    return [{ date: new Date().toISOString().slice(0, 10), value: netWorth }];
  }, [netWorthOverview, netWorth]);
  const monthlySpend = useMemo(() => {
    const now = new Date();
    const net = transactions.reduce((total, transaction) => {
      const date = new Date(transaction.date);
      if (date.getUTCFullYear() !== now.getUTCFullYear() || date.getUTCMonth() !== now.getUTCMonth()) {
        return total;
      }
      const amount = Math.abs(parseAmount(transaction.amount));
      if (transaction.transaction_type === "EXPENSE") {
        return total + amount;
      }
      if (transaction.transaction_type === "REFUND") {
        return total - amount;
      }
      return total;
    }, 0);
    return Math.max(0, net);
  }, [transactions]);
  const spendingByCategory = useMemo(() => {
    const now = new Date();
    const categoryNameById = Object.fromEntries(
      [...categoriesByKind.expense, ...categoriesByKind.refund].map((category) => [
        String(category.id),
        category.name
      ])
    );
    const totals = new Map<string, number>();
    for (const transaction of transactions) {
      const date = new Date(transaction.date);
      if (date.getUTCFullYear() !== now.getUTCFullYear() || date.getUTCMonth() !== now.getUTCMonth()) {
        continue;
      }
      const amount = Math.abs(parseAmount(transaction.amount));
      const key = transaction.category_id ? String(transaction.category_id) : "uncategorized";
      if (transaction.transaction_type === "EXPENSE") {
        totals.set(key, (totals.get(key) ?? 0) + amount);
      } else if (transaction.transaction_type === "REFUND") {
        totals.set(key, (totals.get(key) ?? 0) - amount);
      }
    }
    const rows = Array.from(totals.entries())
      .map(([id, amount]) => ({
        id,
        name: id === "uncategorized" ? "Uncategorized" : categoryNameById[id] ?? "Category",
        amount: Math.max(0, amount)
      }))
      .filter((row) => row.amount > 0)
      .sort((left, right) => right.amount - left.amount);
    const maxAmount = Math.max(...rows.map((row) => row.amount), 1);
    const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
    return { rows: rows.slice(0, 6), maxAmount, totalAmount };
  }, [transactions, categoriesByKind.expense, categoriesByKind.refund]);
  const monthlyIncome = useMemo(() => {
    const now = new Date();
    return transactions
      .filter((transaction) => {
        const date = new Date(transaction.date);
        return (
          transaction.transaction_type === "INCOME" &&
          date.getUTCFullYear() === now.getUTCFullYear() &&
          date.getUTCMonth() === now.getUTCMonth()
        );
      })
      .reduce((total, transaction) => total + parseAmount(transaction.amount), 0);
  }, [transactions]);
  const netChangePercent = useMemo(() => {
    if (monthlyIncome <= 0) {
      return monthlySpend > 0 ? -100 : 0;
    }
    return Math.round(((monthlyIncome - monthlySpend) / monthlyIncome) * 100);
  }, [monthlyIncome, monthlySpend]);
  const initials = useMemo(() => {
    const source = displayName.trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return source.slice(0, 2).toUpperCase() || "L";
  }, [displayName]);
  const [clockLabel, setClockLabel] = useState(() => formatClockLabel());
  useEffect(() => {
    const tick = () => setClockLabel(formatClockLabel());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const goalsCount = goals.length;
  // Same INR totals as Investment Overview "Asset allocation by goal".
  const goalCurrentAmountById = useMemo(() => {
    const totals = new Map<string, number>();
    const linkedGoalIds = new Set<string>();
    const add = (goalId: string | null | undefined, value: number) => {
      if (goalId == null) {
        return;
      }
      linkedGoalIds.add(goalId);
      totals.set(goalId, (totals.get(goalId) ?? 0) + value);
    };

    for (const holding of mutualFundPortfolio?.holdings ?? []) {
      add(holding.goal_id, parseAmount(holding.current_value));
    }
    for (const holding of stockPortfolio?.holdings ?? []) {
      add(holding.goal_id, parseAmount(holding.current_value));
    }
    if (usdInrRate !== null) {
      for (const holding of internationalPortfolio?.holdings ?? []) {
        add(holding.goal_id, parseAmount(holding.current_value) * usdInrRate);
      }
      for (const holding of cryptoPortfolio?.holdings ?? []) {
        add(holding.goal_id, parseAmount(holding.current_value) * usdInrRate);
      }
    }
    for (const transaction of transactions) {
      if (transaction.transaction_type !== "INVESTMENT" || !transaction.category_id) {
        continue;
      }
      const categoryName = investmentCategoryById[transaction.category_id];
      if (!categoryName || !isTransactionAssetClass(categoryName)) {
        continue;
      }
      add(transaction.goal_id != null ? String(transaction.goal_id) : null, parseAmount(transaction.amount));
    }

    const resolved = new Map<string, number>();
    for (const goal of goals) {
      if (linkedGoalIds.has(goal.id)) {
        resolved.set(goal.id, totals.get(goal.id) ?? 0);
      } else {
        resolved.set(goal.id, parseAmount(goal.current_amount));
      }
    }
    return resolved;
  }, [
    goals,
    mutualFundPortfolio,
    stockPortfolio,
    internationalPortfolio,
    cryptoPortfolio,
    usdInrRate,
    transactions,
    investmentCategoryById
  ]);
  const goalsByCompletion = useMemo(
    () => [...goals].sort((left, right) => compareGoalsByCompletion(left, right, goalCurrentAmountById)),
    [goals, goalCurrentAmountById]
  );
  const goalNameById = useMemo(
    () => Object.fromEntries(goals.map((goal) => [goal.id, goal.name])),
    [goals]
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
    const [accountsResult, goalsResult, budgetsResult, transactionsResult, categoriesResult, tagsResult, mutualFundsResult, stocksResult, cryptoResult, internationalResult, investmentOptionsResult, goalTemplatesResult, netWorthResult, usdInrRateResult] =
      await Promise.allSettled([
      api.listAccounts(token),
      api.listGoals(token),
      api.listBudgets(token),
      api.listTransactions(token),
      api.listCategories(token),
      api.listTags(token),
      api.listMutualFundPortfolio(token),
      api.listStockPortfolio(token),
      api.listCryptoPortfolio(token),
      api.listInternationalPortfolio(token),
      api.listInvestmentOptions(token),
      api.listGoalTemplates(token),
      api.getNetWorth(token, 30),
      api.fetchInternationalCurrentPrice(token, "INR=X")
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
    if (tagsResult.status === "fulfilled") {
      setTags(tagsResult.value);
    }
    if (mutualFundsResult.status === "fulfilled") {
      setMutualFundPortfolio(mutualFundsResult.value);
    }
    if (stocksResult.status === "fulfilled") {
      setStockPortfolio(stocksResult.value);
    }
    if (cryptoResult.status === "fulfilled") {
      setCryptoPortfolio(cryptoResult.value);
    }
    if (internationalResult.status === "fulfilled") {
      setInternationalPortfolio(internationalResult.value);
    }
    if (investmentOptionsResult.status === "fulfilled") {
      setInvestmentOptions(investmentOptionsResult.value);
    }
    if (goalTemplatesResult.status === "fulfilled") {
      setGoalTemplates(goalTemplatesResult.value);
    }
    if (netWorthResult.status === "fulfilled") {
      setNetWorthOverview(netWorthResult.value);
    }
    if (usdInrRateResult.status === "fulfilled") {
      setUsdInrRate(parseAmount(usdInrRateResult.value.current_price));
    } else {
      setUsdInrRate(null);
    }

    const failed = [
      accountsResult,
      goalsResult,
      budgetsResult,
      transactionsResult,
      categoriesResult,
      tagsResult,
      mutualFundsResult,
      stocksResult,
      cryptoResult,
      internationalResult,
      investmentOptionsResult,
      goalTemplatesResult,
      netWorthResult
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
    if (activeSection !== "Investment" || activeInvestmentTab !== "Mutual Funds") {
      return;
    }

    let cancelled = false;
    const refreshOnSectionOpen = async () => {
      setRefreshingInvestmentData(true);
      try {
        const result = await api.refreshInvestmentPrices(token);
        if (cancelled) {
          return;
        }
        setLatestNavDateFromSource(result.latest_nav_date ?? null);
        await loadWorkspace({ showLoader: false });
        if (cancelled) {
          return;
        }
        if (
          result.nav_refreshed ||
          result.stocks_updated > 0 ||
          result.international_updated > 0
        ) {
          setWorkspaceMessage("Investment data refreshed with latest prices.");
        }
      } catch (caught) {
        if (cancelled) {
          return;
        }
        setWorkspaceError(
          caught instanceof ApiError
            ? caught.message
            : "Unable to refresh latest investment prices right now."
        );
      } finally {
        if (!cancelled) {
          setRefreshingInvestmentData(false);
        }
      }
    };

    void refreshOnSectionOpen();
    return () => {
      cancelled = true;
    };
  }, [activeSection, activeInvestmentTab, token]);

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
    if (transactionForm.transactionType === "INVESTMENT") {
      setWorkspaceError("Add EPF/PPF/NPS and other holdings under Investment, not Transactions.");
      return;
    }
    setSavingTransaction(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    const payload: CreateTransactionPayload = {
      date: dateInputToIso(transactionForm.date),
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

    if (transactionForm.transactionType === "EXPENSE" || transactionForm.transactionType === "REFUND") {
      payload.tag_id = transactionForm.tagId || null;
    }

    try {
      const response = await api.createTransaction(token, payload);
      setWorkspaceMessage(response.message);
      setShowTransactionComposer(false);
      setTransactionForm({
        date: toDateInputValue(),
        transactionType: transactionForm.transactionType,
        amount: "",
        merchant: "",
        accountId: "",
        sourceAccountId: "",
        destinationAccountId: "",
        transferCategoryId: "",
        categoryId: "",
        tagId: "",
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
    const allocationError = validateGoalPercentAllocations(mutualFundForm.goalAllocations);
    if (allocationError) {
      setWorkspaceError(allocationError);
      return;
    }

    const totalUnits = Number.parseFloat(mutualFundForm.units);
    if (!Number.isFinite(totalUnits) || totalUnits <= 0) {
      setWorkspaceError("Enter a valid units amount.");
      return;
    }

    setSavingMutualFundInvestment(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    const allocations = mutualFundForm.goalAllocations;
    const existingSiblings = mutualFundGoalSiblings(
      mutualFundPortfolio?.holdings ?? [],
      selectedMutualFund.scheme_code
    );
    const { goalIds, percents, usedExistingSiblings } = resolveSipGoalSplits({
      pickerAllocations: allocations,
      siblingHoldings: existingSiblings
    });
    const unitShares = splitQuantityByPercents(totalUnits, percents, 3);

    try {
      for (let index = 0; index < goalIds.length; index += 1) {
        const units = unitShares[index] ?? 0;
        if (units <= 0) {
          continue;
        }
        const payload: CreateMutualFundInvestmentPayload = {
          scheme_code: selectedMutualFund.scheme_code,
          goal_id: goalIds[index],
          category_option_id: mutualFundForm.categoryOptionId || null,
          units: quantityToPayload(units, 3),
          avg_price: mutualFundForm.avgPrice
        };
        await api.createMutualFundInvestment(token, payload);
      }
      setWorkspaceMessage(
        usedExistingSiblings
          ? `SIP added across ${goalIds.length} existing goals.`
          : allocations.length > 1
            ? `Mutual fund investment saved across ${allocations.length} goals.`
            : "Mutual fund investment saved."
      );
      setMutualFundForm({ goalAllocations: [], categoryOptionId: "", units: "", avgPrice: "" });
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
    const allocationError = validateGoalPercentAllocations(stockForm.goalAllocations);
    if (allocationError) {
      setWorkspaceError(allocationError);
      return;
    }

    const totalQuantity = Number.parseFloat(stockForm.quantity);
    if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) {
      setWorkspaceError("Enter a valid quantity.");
      return;
    }

    setSavingStockInvestment(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    const allocations = stockForm.goalAllocations;
    const existingSiblings = symbolGoalSiblings(stockPortfolio?.holdings ?? [], stockForm.symbol);
    const { goalIds, percents, usedExistingSiblings } = resolveSipGoalSplits({
      pickerAllocations: allocations,
      siblingHoldings: existingSiblings
    });
    const quantityShares = splitQuantityByPercents(totalQuantity, percents, 3);

    try {
      for (let index = 0; index < goalIds.length; index += 1) {
        const quantity = quantityShares[index] ?? 0;
        if (quantity <= 0) {
          continue;
        }
        const payload: CreateStockInvestmentPayload = {
          symbol: stockForm.symbol,
          company_name: stockForm.companyName || null,
          exchange: stockForm.exchange || null,
          goal_id: goalIds[index],
          sector_option_id: stockForm.sectorOptionId || null,
          quantity: quantityToPayload(quantity, 3),
          avg_price: stockForm.avgPrice,
          current_price: stockForm.currentPrice || undefined
        };
        await api.createStockInvestment(token, payload);
      }
      setWorkspaceMessage(
        usedExistingSiblings
          ? `SIP added across ${goalIds.length} existing goals.`
          : allocations.length > 1
            ? `Stock investment saved across ${allocations.length} goals.`
            : "Stock investment saved."
      );
      setStockForm({
        symbol: "",
        companyName: "",
        exchange: "",
        goalAllocations: [],
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
      setStockForm((current) => ({
        ...current,
        currentPrice: result.current_price,
        companyName: result.name?.trim() || current.companyName
      }));
      setWorkspaceMessage(
        result.name
          ? `Fetched ${result.name} at ${result.current_price} (${result.market_symbol}).`
          : `Fetched current price for ${result.market_symbol}.`
      );
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
      setInternationalForm((current) => ({
        ...current,
        currentPrice: result.current_price,
        securityName: result.name?.trim() || current.securityName
      }));
      setWorkspaceMessage(
        result.name
          ? `Fetched ${result.name} at ${result.current_price} (${result.market_symbol}).`
          : `Fetched current price for ${result.market_symbol}.`
      );
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to fetch international current price.");
    } finally {
      setLoadingInternationalPrice(false);
    }
  }

  function defaultInvestmentAccountId(): string {
    const cash = accounts.find((account) => account.name.trim().toLowerCase() === "cash");
    if (cash) {
      return String(cash.id);
    }
    const nonCredit = accounts.find((account) => account.account_type !== "credit card");
    if (nonCredit) {
      return String(nonCredit.id);
    }
    return accounts[0] ? String(accounts[0].id) : "";
  }

  async function submitTransactionAssetInvestment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isTransactionAssetClass(activeInvestmentTab)) {
      return;
    }
    const category = categoriesByKind.investment.find((entry) => entry.name === activeInvestmentTab);
    if (!category) {
      setWorkspaceError(`${activeInvestmentTab} category is not available yet.`);
      return;
    }
    const accountId = defaultInvestmentAccountId();
    if (!accountId) {
      setWorkspaceError("Add an account first to save this investment.");
      return;
    }
    const allocationError = validateGoalPercentAllocations(transactionAssetForm.goalAllocations);
    if (allocationError) {
      setWorkspaceError(allocationError);
      return;
    }
    const totalAmount = Number.parseFloat(transactionAssetForm.amount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      setWorkspaceError("Enter a valid amount.");
      return;
    }

    setSavingTransactionAsset(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    const allocations = transactionAssetForm.goalAllocations;
    const goalIds: (string | null)[] = allocations.length > 0 ? allocations.map((entry) => entry.goalId) : [null];
    const percents =
      allocations.length > 0 ? allocations.map((entry) => Number.parseFloat(entry.percent) || 0) : [100];
    const amountShares = splitQuantityByPercents(totalAmount, percents, 2);

    try {
      for (let index = 0; index < goalIds.length; index += 1) {
        const amount = amountShares[index] ?? 0;
        if (amount <= 0) {
          continue;
        }
        const payload: CreateTransactionPayload = {
          date: dateInputToIso(toDateInputValue()),
          amount: quantityToPayload(amount, 2),
          transaction_type: "INVESTMENT",
          merchant: transactionAssetForm.name.trim() || activeInvestmentTab,
          notes: null,
          account_id: accountId,
          category_id: category.id,
          goal_id: goalIds[index],
          tag_id: analysisTags.find((tag) => tag.name === "Investments")?.id ?? null
        };
        await api.createTransaction(token, payload);
      }
      setWorkspaceMessage(
        allocations.length > 1
          ? `${activeInvestmentTab} saved across ${allocations.length} goals.`
          : allocations.length === 1
            ? `${activeInvestmentTab} saved and linked to goal.`
            : `${activeInvestmentTab} saved.`
      );
      setTransactionAssetForm({
        name: "",
        amount: "",
        goalAllocations: []
      });
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(
        caught instanceof ApiError ? caught.message : `Unable to save ${activeInvestmentTab}.`
      );
    } finally {
      setSavingTransactionAsset(false);
    }
  }

  function startEditTransactionAsset(transaction: Transaction) {
    setEditingTransactionAssetId(String(transaction.id));
    setTransactionAssetEditForm({
      name: transaction.merchant?.trim() || activeInvestmentTab,
      amount: String(Math.abs(parseAmount(transaction.amount))),
      goalId: transaction.goal_id != null ? String(transaction.goal_id) : ""
    });
    setWorkspaceError(null);
    setWorkspaceMessage(null);
  }

  async function submitTransactionAssetEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTransactionAssetId) {
      return;
    }
    setSavingTransactionAssetEdit(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);
    try {
      await api.updateTransaction(token, editingTransactionAssetId, {
        merchant: transactionAssetEditForm.name.trim() || activeInvestmentTab,
        amount: transactionAssetEditForm.amount,
        goal_id: transactionAssetEditForm.goalId || null
      });
      setWorkspaceMessage(`${activeInvestmentTab} updated.`);
      setEditingTransactionAssetId(null);
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(
        caught instanceof ApiError ? caught.message : `Unable to update ${activeInvestmentTab}.`
      );
    } finally {
      setSavingTransactionAssetEdit(false);
    }
  }

  async function submitInternationalInvestment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const allocationError = validateGoalPercentAllocations(internationalForm.goalAllocations);
    if (allocationError) {
      setWorkspaceError(allocationError);
      return;
    }

    const totalQuantity = Number.parseFloat(internationalForm.quantity);
    if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) {
      setWorkspaceError("Enter a valid quantity.");
      return;
    }

    setSavingInternationalInvestment(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    const allocations = internationalForm.goalAllocations;
    const existingSiblings = symbolGoalSiblings(
      internationalPortfolio?.holdings ?? [],
      internationalForm.symbol
    );
    const { goalIds, percents, usedExistingSiblings } = resolveSipGoalSplits({
      pickerAllocations: allocations,
      siblingHoldings: existingSiblings
    });
    const quantityShares = splitQuantityByPercents(totalQuantity, percents, 6);

    try {
      for (let index = 0; index < goalIds.length; index += 1) {
        const quantity = quantityShares[index] ?? 0;
        if (quantity <= 0) {
          continue;
        }
        const payload: CreateInternationalInvestmentPayload = {
          symbol: internationalForm.symbol,
          security_name: internationalForm.securityName || null,
          market: "US",
          instrument_type: internationalForm.instrumentType,
          goal_id: goalIds[index],
          sector_option_id: internationalForm.sectorOptionId || null,
          quantity: quantityToPayload(quantity, 6),
          avg_price: internationalForm.avgPrice,
          current_price: internationalForm.currentPrice || undefined
        };
        await api.createInternationalInvestment(token, payload);
      }
      setWorkspaceMessage(
        usedExistingSiblings
          ? `SIP added across ${goalIds.length} existing goals.`
          : allocations.length > 1
            ? `International investment saved across ${allocations.length} goals.`
            : "International investment saved."
      );
      setInternationalForm({
        symbol: "",
        securityName: "",
        instrumentType: "stock",
        goalAllocations: [],
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

  async function submitCryptoInvestment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const allocationError = validateGoalPercentAllocations(cryptoForm.goalAllocations);
    if (allocationError) {
      setWorkspaceError(allocationError);
      return;
    }

    const totalQuantity = Number.parseFloat(cryptoForm.quantity);
    if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) {
      setWorkspaceError("Enter a valid quantity.");
      return;
    }

    setSavingCryptoInvestment(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    const allocations = cryptoForm.goalAllocations;
    const existingSiblings = symbolGoalSiblings(cryptoPortfolio?.holdings ?? [], cryptoForm.symbol);
    const { goalIds, percents, usedExistingSiblings } = resolveSipGoalSplits({
      pickerAllocations: allocations,
      siblingHoldings: existingSiblings
    });
    const quantityShares = splitQuantityByPercents(totalQuantity, percents, 6);

    try {
      for (let index = 0; index < goalIds.length; index += 1) {
        const quantity = quantityShares[index] ?? 0;
        if (quantity <= 0) {
          continue;
        }
        const payload: CreateCryptoInvestmentPayload = {
          symbol: cryptoForm.symbol,
          asset_name: cryptoForm.assetName || null,
          goal_id: goalIds[index],
          sector_option_id: cryptoForm.sectorOptionId || null,
          quantity: quantityToPayload(quantity, 6),
          avg_price: cryptoForm.avgPrice,
          current_price: cryptoForm.currentPrice || undefined
        };
        await api.createCryptoInvestment(token, payload);
      }
      setWorkspaceMessage(
        usedExistingSiblings
          ? `SIP added across ${goalIds.length} existing goals.`
          : allocations.length > 1
            ? `Crypto investment saved across ${allocations.length} goals.`
            : "Crypto investment saved."
      );
      setCryptoForm({
        symbol: "",
        assetName: "",
        sectorOptionId: "",
        quantity: "",
        avgPrice: "",
        currentPrice: "",
        goalAllocations: []
      });
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to save crypto investment.");
    } finally {
      setSavingCryptoInvestment(false);
    }
  }

  async function fetchCryptoCurrentPrice() {
    const symbol = cryptoForm.symbol.trim();
    if (!symbol) {
      setWorkspaceError("Enter crypto symbol first.");
      return;
    }
    setLoadingCryptoPrice(true);
    setWorkspaceError(null);
    try {
      const result = await api.fetchCryptoCurrentPrice(token, symbol);
      setCryptoForm((current) => ({
        ...current,
        currentPrice: result.current_price,
        assetName: result.name?.trim() || current.assetName
      }));
      setWorkspaceMessage(
        result.name
          ? `Fetched ${result.name} at ${result.current_price} (${result.market_symbol}).`
          : `Fetched current price for ${result.market_symbol}.`
      );
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to fetch crypto current price.");
    } finally {
      setLoadingCryptoPrice(false);
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
      currentAmount: goal.current_amount,
      targetDate: goal.target_date ? goal.target_date.slice(0, 10) : ""
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
        current_amount: goalEditForm.currentAmount,
        target_date: goalEditForm.targetDate ? `${goalEditForm.targetDate}T00:00:00Z` : null
      });
      setWorkspaceMessage("Goal updated.");
      setEditingGoalId(null);
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to update goal.");
    } finally {
      setSavingGoalEdit(false);
    }
  }

  function applySuggestedGoal(template: GoalTemplate) {
    setGoalForm({
      name: template.name,
      targetAmount: "",
      currentAmount: "0.00",
      targetDate: ""
    });
    setShowSuggestedGoals(false);
    setWorkspaceError(null);
    setWorkspaceMessage(`Enter a target amount for ${template.name}.`);
  }

  function startEditHolding(
    holdingId: string,
    unitsOrQuantity: string,
    avgPrice: string,
    optionId?: string | null,
    goalId?: string | null
  ) {
    let editUnitsOrQuantity = unitsOrQuantity;
    if (activeInvestmentTab === "Mutual Funds") {
      const holding = mutualFundPortfolio?.holdings.find((entry) => entry.id === holdingId);
      if (holding) {
        const siblings = mutualFundGoalSiblings(mutualFundPortfolio?.holdings ?? [], holding.scheme_code);
        if (siblings.length > 1) {
          const totalUnits = siblings.reduce((sum, entry) => sum + entry.quantity, 0);
          editUnitsOrQuantity = quantityToPayload(totalUnits, 3);
        }
      }
    } else if (activeInvestmentTab === "Stocks") {
      const holding = stockPortfolio?.holdings.find((entry) => entry.id === holdingId);
      if (holding) {
        const siblings = symbolGoalSiblings(stockPortfolio?.holdings ?? [], holding.symbol);
        if (siblings.length > 1) {
          const totalQuantity = siblings.reduce((sum, entry) => sum + entry.quantity, 0);
          editUnitsOrQuantity = quantityToPayload(totalQuantity, 3);
        }
      }
    } else if (activeInvestmentTab === "International Investment") {
      const holding = internationalPortfolio?.holdings.find((entry) => entry.id === holdingId);
      if (holding) {
        const siblings = symbolGoalSiblings(internationalPortfolio?.holdings ?? [], holding.symbol);
        if (siblings.length > 1) {
          const totalQuantity = siblings.reduce((sum, entry) => sum + entry.quantity, 0);
          editUnitsOrQuantity = quantityToPayload(totalQuantity, 6);
        }
      }
    } else if (activeInvestmentTab === "Crypto") {
      const holding = cryptoPortfolio?.holdings.find((entry) => entry.id === holdingId);
      if (holding) {
        const siblings = symbolGoalSiblings(cryptoPortfolio?.holdings ?? [], holding.symbol);
        if (siblings.length > 1) {
          const totalQuantity = siblings.reduce((sum, entry) => sum + entry.quantity, 0);
          editUnitsOrQuantity = quantityToPayload(totalQuantity, 6);
        }
      }
    }

    setEditingHoldingId(holdingId);
    setHoldingEditForm({
      unitsOrQuantity: editUnitsOrQuantity,
      avgPrice,
      optionId: optionId ?? "",
      goalId: goalId ?? ""
    });
    setWorkspaceError(null);
    setWorkspaceMessage(null);
  }

  async function submitHoldingEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingHoldingId) {
      return;
    }
    setSavingHoldingEdit(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);
    try {
      if (activeInvestmentTab === "Mutual Funds") {
        const holding = mutualFundPortfolio?.holdings.find((entry) => entry.id === editingHoldingId);
        const siblings = holding
          ? mutualFundGoalSiblings(mutualFundPortfolio?.holdings ?? [], holding.scheme_code)
          : [];
        const originalGoalId = holding?.goal_id ?? null;
        const nextGoalId = holdingEditForm.goalId || null;
        const shouldRedistribute =
          siblings.length > 1 && (originalGoalId ?? "") === (nextGoalId ?? "");

        if (shouldRedistribute) {
          const newTotal = Number.parseFloat(holdingEditForm.unitsOrQuantity);
          if (!Number.isFinite(newTotal) || newTotal <= 0) {
            throw new Error("Enter a valid total units amount.");
          }
          const percents = proportionsFromQuantities(siblings.map((entry) => entry.quantity));
          const unitShares = splitQuantityByPercents(newTotal, percents, 3);
          for (let index = 0; index < siblings.length; index += 1) {
            const sibling = siblings[index];
            const units = unitShares[index] ?? 0;
            if (!sibling || units <= 0) {
              continue;
            }
            await api.updateMutualFundInvestment(token, sibling.id, {
              units: quantityToPayload(units, 3),
              avg_price: holdingEditForm.avgPrice,
              goal_id: sibling.goal_id,
              category_option_id: holdingEditForm.optionId || null
            });
          }
          setWorkspaceMessage(`Holding updated across ${siblings.length} linked goals.`);
        } else {
          await api.updateMutualFundInvestment(token, editingHoldingId, {
            units: holdingEditForm.unitsOrQuantity,
            avg_price: holdingEditForm.avgPrice,
            goal_id: nextGoalId,
            category_option_id: holdingEditForm.optionId || null
          });
          setWorkspaceMessage("Holding updated.");
        }
      } else if (activeInvestmentTab === "Stocks") {
        const holding = stockPortfolio?.holdings.find((entry) => entry.id === editingHoldingId);
        const siblings = holding ? symbolGoalSiblings(stockPortfolio?.holdings ?? [], holding.symbol) : [];
        const originalGoalId = holding?.goal_id ?? null;
        const nextGoalId = holdingEditForm.goalId || null;
        const shouldRedistribute =
          siblings.length > 1 && (originalGoalId ?? "") === (nextGoalId ?? "");

        if (shouldRedistribute) {
          const newTotal = Number.parseFloat(holdingEditForm.unitsOrQuantity);
          if (!Number.isFinite(newTotal) || newTotal <= 0) {
            throw new Error("Enter a valid total quantity.");
          }
          const percents = proportionsFromQuantities(siblings.map((entry) => entry.quantity));
          const quantityShares = splitQuantityByPercents(newTotal, percents, 3);
          for (let index = 0; index < siblings.length; index += 1) {
            const sibling = siblings[index];
            const quantity = quantityShares[index] ?? 0;
            if (!sibling || quantity <= 0) {
              continue;
            }
            await api.updateStockInvestment(token, sibling.id, {
              quantity: quantityToPayload(quantity, 3),
              avg_price: holdingEditForm.avgPrice,
              goal_id: sibling.goal_id,
              sector_option_id: holdingEditForm.optionId || null
            });
          }
          setWorkspaceMessage(`Holding updated across ${siblings.length} linked goals.`);
        } else {
          await api.updateStockInvestment(token, editingHoldingId, {
            quantity: holdingEditForm.unitsOrQuantity,
            avg_price: holdingEditForm.avgPrice,
            goal_id: nextGoalId,
            sector_option_id: holdingEditForm.optionId || null
          });
          setWorkspaceMessage("Holding updated.");
        }
      } else if (activeInvestmentTab === "International Investment") {
        const holding = internationalPortfolio?.holdings.find((entry) => entry.id === editingHoldingId);
        const siblings = holding
          ? symbolGoalSiblings(internationalPortfolio?.holdings ?? [], holding.symbol)
          : [];
        const originalGoalId = holding?.goal_id ?? null;
        const nextGoalId = holdingEditForm.goalId || null;
        const shouldRedistribute =
          siblings.length > 1 && (originalGoalId ?? "") === (nextGoalId ?? "");

        if (shouldRedistribute) {
          const newTotal = Number.parseFloat(holdingEditForm.unitsOrQuantity);
          if (!Number.isFinite(newTotal) || newTotal <= 0) {
            throw new Error("Enter a valid total quantity.");
          }
          const percents = proportionsFromQuantities(siblings.map((entry) => entry.quantity));
          const quantityShares = splitQuantityByPercents(newTotal, percents, 6);
          for (let index = 0; index < siblings.length; index += 1) {
            const sibling = siblings[index];
            const quantity = quantityShares[index] ?? 0;
            if (!sibling || quantity <= 0) {
              continue;
            }
            await api.updateInternationalInvestment(token, sibling.id, {
              quantity: quantityToPayload(quantity, 6),
              avg_price: holdingEditForm.avgPrice,
              goal_id: sibling.goal_id,
              sector_option_id: holdingEditForm.optionId || null
            });
          }
          setWorkspaceMessage(`Holding updated across ${siblings.length} linked goals.`);
        } else {
          await api.updateInternationalInvestment(token, editingHoldingId, {
            quantity: holdingEditForm.unitsOrQuantity,
            avg_price: holdingEditForm.avgPrice,
            goal_id: nextGoalId,
            sector_option_id: holdingEditForm.optionId || null
          });
          setWorkspaceMessage("Holding updated.");
        }
      } else if (activeInvestmentTab === "Crypto") {
        const holding = cryptoPortfolio?.holdings.find((entry) => entry.id === editingHoldingId);
        const siblings = holding ? symbolGoalSiblings(cryptoPortfolio?.holdings ?? [], holding.symbol) : [];
        const originalGoalId = holding?.goal_id ?? null;
        const nextGoalId = holdingEditForm.goalId || null;
        const shouldRedistribute =
          siblings.length > 1 && (originalGoalId ?? "") === (nextGoalId ?? "");

        if (shouldRedistribute) {
          const newTotal = Number.parseFloat(holdingEditForm.unitsOrQuantity);
          if (!Number.isFinite(newTotal) || newTotal <= 0) {
            throw new Error("Enter a valid total quantity.");
          }
          const percents = proportionsFromQuantities(siblings.map((entry) => entry.quantity));
          const quantityShares = splitQuantityByPercents(newTotal, percents, 6);
          for (let index = 0; index < siblings.length; index += 1) {
            const sibling = siblings[index];
            const quantity = quantityShares[index] ?? 0;
            if (!sibling || quantity <= 0) {
              continue;
            }
            await api.updateCryptoInvestment(token, sibling.id, {
              quantity: quantityToPayload(quantity, 6),
              avg_price: holdingEditForm.avgPrice,
              goal_id: sibling.goal_id,
              sector_option_id: holdingEditForm.optionId || null
            });
          }
          setWorkspaceMessage(`Holding updated across ${siblings.length} linked goals.`);
        } else {
          await api.updateCryptoInvestment(token, editingHoldingId, {
            quantity: holdingEditForm.unitsOrQuantity,
            avg_price: holdingEditForm.avgPrice,
            goal_id: nextGoalId,
            sector_option_id: holdingEditForm.optionId || null
          });
          setWorkspaceMessage("Holding updated.");
        }
      }
      setEditingHoldingId(null);
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Unable to update holding."
      );
    } finally {
      setSavingHoldingEdit(false);
    }
  }

  function requestDeleteHolding(
    id: string,
    label: string,
    assetClass: "mutual_funds" | "stocks" | "international" | "crypto" | "transaction_asset"
  ) {
    setHoldingPendingDelete({ id, label, assetClass });
    setWorkspaceError(null);
    setWorkspaceMessage(null);
  }

  async function confirmDeleteHolding() {
    if (!holdingPendingDelete) {
      return;
    }
    setDeletingHolding(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);
    try {
      if (holdingPendingDelete.assetClass === "mutual_funds") {
        await api.deleteMutualFundInvestment(token, holdingPendingDelete.id);
      } else if (holdingPendingDelete.assetClass === "stocks") {
        await api.deleteStockInvestment(token, holdingPendingDelete.id);
      } else if (holdingPendingDelete.assetClass === "international") {
        await api.deleteInternationalInvestment(token, holdingPendingDelete.id);
      } else if (holdingPendingDelete.assetClass === "crypto") {
        await api.deleteCryptoInvestment(token, holdingPendingDelete.id);
      } else {
        await api.deleteTransaction(token, holdingPendingDelete.id);
      }
      if (editingHoldingId === holdingPendingDelete.id) {
        setEditingHoldingId(null);
      }
      if (editingTransactionAssetId === holdingPendingDelete.id) {
        setEditingTransactionAssetId(null);
      }
      setHoldingPendingDelete(null);
      setWorkspaceMessage("Holding deleted.");
      await loadWorkspace({ showLoader: false });
    } catch (caught) {
      setWorkspaceError(caught instanceof ApiError ? caught.message : "Unable to delete holding.");
    } finally {
      setDeletingHolding(false);
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
      date: toDateInputValue(new Date(transaction.date)),
      transactionType: transaction.transaction_type,
      amount: transaction.amount,
      merchant: transaction.merchant ?? "",
      accountId: String(transaction.account_id),
      categoryId: transaction.category_id ? String(transaction.category_id) : "",
      tagId: transaction.tag_id ? String(transaction.tag_id) : "",
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
    if (editingTransactionForm.transactionType === "INVESTMENT") {
      setWorkspaceError("Edit EPF/PPF/NPS and other holdings under Investment, not Transactions.");
      return;
    }
    setSavingTransactionEdit(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);

    try {
      await api.updateTransaction(token, editingTransactionId, {
        date: dateInputToIso(editingTransactionForm.date),
        transaction_type: editingTransactionForm.transactionType,
        amount: editingTransactionForm.amount,
        merchant: editingTransactionForm.merchant || null,
        account_id: Number(editingTransactionForm.accountId),
        category_id: editingTransactionForm.categoryId ? Number(editingTransactionForm.categoryId) : null,
        tag_id:
          editingTransactionForm.transactionType === "EXPENSE" ||
          editingTransactionForm.transactionType === "REFUND"
            ? editingTransactionForm.tagId || null
            : null,
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
    const chartPoints =
      netWorthHistory.length > 14
        ? netWorthHistory.filter((_, index) => index % 2 === 0 || index === netWorthHistory.length - 1)
        : netWorthHistory;
    const monthTotal = monthlyIncome + monthlySpend;
    const expenseRatio = monthTotal > 0 ? monthlySpend / monthTotal : 0.55;
    const incomeRatio = 1 - expenseRatio;
    const donutSize = 120;
    const donutStroke = 18;
    const donutRadius = (donutSize - donutStroke) / 2;
    const donutCircumference = 2 * Math.PI * donutRadius;
    const expenseArc = expenseRatio * donutCircumference;
    const incomeArc = incomeRatio * donutCircumference;
    const donutCenterValue = monthDonutFocus === "income" ? monthlyIncome : monthlySpend;
    const donutCenterLabel = monthDonutFocus === "income" ? "Income" : "Expenses";
    const linePad = { top: 16, right: 12, bottom: 28, left: 12 };
    const lineW = 560;
    const lineH = 220;
    const plotW = lineW - linePad.left - linePad.right;
    const plotH = lineH - linePad.top - linePad.bottom;
    const minWorth = Math.min(...chartPoints.map((point) => point.value));
    const maxWorth = Math.max(...chartPoints.map((point) => point.value), minWorth);
    const flatSeries = maxWorth === minWorth;
    const worthSpan = flatSeries ? 1 : Math.max(maxWorth - minWorth, 1);
    const lineCoords = chartPoints.map((point, index) => {
      const x =
        chartPoints.length === 1
          ? linePad.left + plotW / 2
          : linePad.left + (index / (chartPoints.length - 1)) * plotW;
      const y = flatSeries
        ? linePad.top + plotH * 0.58
        : linePad.top + plotH - ((point.value - minWorth) / worthSpan) * plotH;
      return { x, y, point };
    });
    const linePath = lineCoords.map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x} ${coord.y}`).join(" ");
    const areaPath =
      lineCoords.length > 0
        ? `${linePath} L ${lineCoords[lineCoords.length - 1].x} ${linePad.top + plotH} L ${lineCoords[0].x} ${linePad.top + plotH} Z`
        : "";

    return (
      <>
        <section className="dashboard-overview" aria-label="Dashboard overview">
          <article className="summary-card">
            <p>Networth</p>
            <div className="summary-card-value">
              <strong>{formatCurrency(netWorth)}</strong>
              <span className={`growth-badge ${netChangePercent < 0 ? "negative" : ""}`}>
                {netChangePercent >= 0 ? "+" : ""}
                {netChangePercent}%
              </span>
            </div>
          </article>
          <article className="summary-card">
            <p>Total Investment</p>
            <div className="summary-card-value">
              <strong>{formatCurrency(investmentsValue)}</strong>
            </div>
            <p className="summary-card-note">{investmentSummaryNote}</p>
          </article>
          <article className="summary-card">
            <p>Liquid Balance</p>
            <div className="summary-card-value">
              <strong>{formatCurrency(liquidBalance)}</strong>
            </div>
            <p className="summary-card-note">Wallet and bank accounts</p>
          </article>
          <article className="summary-card credit-usage-card">
            <p>Credit Card Usage</p>
            <div className="summary-card-value">
              <strong>{creditCardUsage.percent}%</strong>
            </div>
            <div
              className="credit-usage-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={creditCardUsage.percent}
              aria-label="Credit card usage"
            >
              <span className="credit-usage-fill" style={{ width: `${creditCardUsage.percent}%` }} />
            </div>
            <div className="credit-usage-stats">
              <div>
                <span>Used</span>
                <strong>{formatCurrency(creditCardUsage.used)}</strong>
              </div>
              <div>
                <span>Limit</span>
                <strong>{formatCurrency(creditCardUsage.limit)}</strong>
              </div>
            </div>
          </article>
          <article className="summary-card expense-card">
            <div className="donut-chart-wrap" onMouseLeave={() => setMonthDonutFocus(null)}>
              <svg
                className="donut-chart-svg"
                viewBox={`0 0 ${donutSize} ${donutSize}`}
                role="img"
                aria-label={`This month income ${formatCurrency(monthlyIncome)}, expenses ${formatCurrency(monthlySpend)}`}
              >
                <g transform={`rotate(-90 ${donutSize / 2} ${donutSize / 2})`}>
                  <circle
                    className={`donut-segment income${monthDonutFocus === "income" ? " active" : ""}${monthDonutFocus === "expenses" ? " dimmed" : ""}`}
                    cx={donutSize / 2}
                    cy={donutSize / 2}
                    r={donutRadius}
                    fill="none"
                    strokeWidth={donutStroke}
                    strokeDasharray={`${incomeArc} ${donutCircumference - incomeArc}`}
                    strokeDashoffset={0}
                    onMouseEnter={() => setMonthDonutFocus("income")}
                    onFocus={() => setMonthDonutFocus("income")}
                    onBlur={() => setMonthDonutFocus(null)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Income ${formatCurrency(monthlyIncome)}`}
                  />
                  <circle
                    className={`donut-segment expenses${monthDonutFocus === "expenses" ? " active" : ""}${monthDonutFocus === "income" ? " dimmed" : ""}`}
                    cx={donutSize / 2}
                    cy={donutSize / 2}
                    r={donutRadius}
                    fill="none"
                    strokeWidth={donutStroke}
                    strokeDasharray={`${expenseArc} ${donutCircumference - expenseArc}`}
                    strokeDashoffset={-incomeArc}
                    onMouseEnter={() => setMonthDonutFocus("expenses")}
                    onFocus={() => setMonthDonutFocus("expenses")}
                    onBlur={() => setMonthDonutFocus(null)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Expenses ${formatCurrency(monthlySpend)}`}
                  />
                </g>
              </svg>
              <div className="donut-center">
                <strong>{formatCurrency(donutCenterValue)}</strong>
                <span>{donutCenterLabel}</span>
              </div>
            </div>
            <div className="expense-meta">
              <p>This month</p>
              <button
                type="button"
                className={`legend-row interactive${monthDonutFocus === "income" ? " active" : ""}`}
                onMouseEnter={() => setMonthDonutFocus("income")}
                onMouseLeave={() => setMonthDonutFocus(null)}
                onFocus={() => setMonthDonutFocus("income")}
                onBlur={() => setMonthDonutFocus(null)}
              >
                <span className="legend-dot blue" />
                Income {formatCurrency(monthlyIncome)}
              </button>
              <button
                type="button"
                className={`legend-row interactive${monthDonutFocus === "expenses" ? " active" : ""}`}
                onMouseEnter={() => setMonthDonutFocus("expenses")}
                onMouseLeave={() => setMonthDonutFocus(null)}
                onFocus={() => setMonthDonutFocus("expenses")}
                onBlur={() => setMonthDonutFocus(null)}
              >
                <span className="legend-dot pink" />
                Expenses {formatCurrency(monthlySpend)}
              </button>
            </div>
          </article>
        </section>

        <section className="dashboard-charts" aria-label="Dashboard charts">
          <section className="chart-panel networth-panel" aria-label="Networth graph">
            <div className="chart-panel-header">
              <h2>Networth Graph</h2>
              {netWorthHoverIndex !== null && lineCoords[netWorthHoverIndex] && (
                <strong className="chart-hover-value">
                  {formatCurrency(lineCoords[netWorthHoverIndex].point.value)}
                </strong>
              )}
            </div>
            <div
              className="networth-chart-interactive"
              onMouseLeave={() => setNetWorthHoverIndex(null)}
            >
              <svg
                className="networth-line-chart"
                viewBox={`0 0 ${lineW} ${lineH}`}
                role="img"
                aria-label="Net worth over time"
                preserveAspectRatio="xMidYMid meet"
                onMouseMove={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  if (bounds.width <= 0 || lineCoords.length === 0) {
                    return;
                  }
                  const ratioX = (event.clientX - bounds.left) / bounds.width;
                  const svgX = ratioX * lineW;
                  let nearestIndex = 0;
                  let nearestDistance = Number.POSITIVE_INFINITY;
                  lineCoords.forEach((coord, index) => {
                    const distance = Math.abs(coord.x - svgX);
                    if (distance < nearestDistance) {
                      nearestDistance = distance;
                      nearestIndex = index;
                    }
                  });
                  setNetWorthHoverIndex(nearestIndex);
                }}
              >
                <defs>
                  <linearGradient id="networthArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(119, 138, 251, 0.28)" />
                    <stop offset="100%" stopColor="rgba(119, 138, 251, 0)" />
                  </linearGradient>
                </defs>
                {areaPath && <path d={areaPath} fill="url(#networthArea)" />}
                {linePath && (
                  <path
                    d={linePath}
                    fill="none"
                    stroke="var(--accent-blue)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {netWorthHoverIndex !== null && lineCoords[netWorthHoverIndex] && (
                  <line
                    className="networth-hover-guide"
                    x1={lineCoords[netWorthHoverIndex].x}
                    x2={lineCoords[netWorthHoverIndex].x}
                    y1={linePad.top}
                    y2={linePad.top + plotH}
                  />
                )}
                {lineCoords.map((coord, index) => {
                  const label = new Date(`${coord.point.date}T00:00:00`).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short"
                  });
                  const isActive = netWorthHoverIndex === index;
                  return (
                    <g key={coord.point.date}>
                      <circle
                        className={`networth-point${isActive ? " active" : ""}`}
                        cx={coord.x}
                        cy={coord.y}
                        r={isActive ? 6 : 4}
                        fill="var(--accent-violet)"
                        onMouseEnter={() => setNetWorthHoverIndex(index)}
                      />
                      <title>{`${label}: ${formatCurrency(coord.point.value)}`}</title>
                    </g>
                  );
                })}
                {lineCoords
                  .filter(
                    (_, index) =>
                      index === 0 ||
                      index === lineCoords.length - 1 ||
                      index % Math.ceil(lineCoords.length / 4) === 0
                  )
                  .map((coord) => {
                    const label = new Date(`${coord.point.date}T00:00:00`).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short"
                    });
                    return (
                      <text
                        key={`label-${coord.point.date}`}
                        x={coord.x}
                        y={lineH - 6}
                        textAnchor="middle"
                        className="networth-line-label"
                      >
                        {label}
                      </text>
                    );
                  })}
              </svg>
              {netWorthHoverIndex !== null && lineCoords[netWorthHoverIndex] && (
                <div
                  className="chart-tooltip"
                  style={{
                    left: `${(lineCoords[netWorthHoverIndex].x / lineW) * 100}%`,
                    top: `${(lineCoords[netWorthHoverIndex].y / lineH) * 100}%`
                  }}
                >
                  <strong>
                    {new Date(`${lineCoords[netWorthHoverIndex].point.date}T00:00:00`).toLocaleDateString(
                      undefined,
                      { day: "numeric", month: "short", year: "numeric" }
                    )}
                  </strong>
                  <span>{formatCurrency(lineCoords[netWorthHoverIndex].point.value)}</span>
                </div>
              )}
            </div>
          </section>

          <section className="chart-panel budget-overview-panel" aria-label="Budget overview">
            <div className="chart-panel-header">
              <h2>Budget Overview</h2>
              <button className="rail-link" type="button" onClick={() => onSelectSection("Budget")}>
                see all
              </button>
            </div>
            <div className="budget-overview-list">
              {budgets.length === 0 ? (
                <div className="panel-empty compact">
                  <strong>No budgets yet</strong>
                  <p>Create a budget to track spending.</p>
                </div>
              ) : (
                budgets.slice(0, 5).map((budget) => {
                  const budgetAmount = parseAmount(budget.amount);
                  const spentAmount = parseAmount(budget.spent_amount);
                  const usagePercent =
                    budgetAmount > 0 ? Math.min(100, Math.round((spentAmount / budgetAmount) * 100)) : 0;
                  return (
                    <button
                      key={budget.id}
                      className="budget-overview-row interactive-chart-row"
                      type="button"
                      onClick={() => onSelectSection("Budget")}
                      title={`${budget.name}: ${formatCurrency(spentAmount)} of ${formatCurrency(budgetAmount)} (${usagePercent}%)`}
                    >
                      <div className="budget-overview-copy">
                        <strong>{budget.name}</strong>
                        <p>
                          {formatCurrency(spentAmount)} of {formatCurrency(budgetAmount)}
                        </p>
                      </div>
                      <div
                        className="budget-overview-track"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={usagePercent}
                        aria-label={`${budget.name} ${usagePercent}% used`}
                      >
                        <span className="budget-overview-fill" style={{ width: `${usagePercent}%` }} />
                      </div>
                      <span className="budget-overview-percent">{usagePercent}%</span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="chart-panel category-spend-panel" aria-label="Spending by category">
            <div className="chart-panel-header">
              <h2>Spending by Category</h2>
              <button className="rail-link" type="button" onClick={() => onSelectSection("Transaction")}>
                see all
              </button>
            </div>
            <div className="category-spend-list">
              {spendingByCategory.rows.length === 0 ? (
                <div className="panel-empty compact">
                  <strong>No spending yet</strong>
                  <p>Expense categories will appear here this month.</p>
                </div>
              ) : (
                spendingByCategory.rows.map((row) => {
                  const sharePercent =
                    spendingByCategory.totalAmount > 0
                      ? Math.round((row.amount / spendingByCategory.totalAmount) * 100)
                      : 0;
                  const barPercent = Math.max(6, Math.round((row.amount / spendingByCategory.maxAmount) * 100));
                  return (
                    <button
                      key={row.id}
                      className="category-spend-row interactive-chart-row"
                      type="button"
                      onClick={() => onSelectSection("Transaction")}
                      title={`${row.name}: ${formatCurrency(row.amount)} (${sharePercent}%)`}
                    >
                      <div className="category-spend-copy">
                        <strong>{row.name}</strong>
                        <span>{formatCurrency(row.amount)}</span>
                      </div>
                      <div
                        className="category-spend-track"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={sharePercent}
                        aria-label={`${row.name} ${sharePercent}% of spending`}
                      >
                        <span className="category-spend-fill" style={{ width: `${barPercent}%` }} />
                      </div>
                      <span className="category-spend-percent">{sharePercent}%</span>
                    </button>
                  );
                })
              )}
            </div>
          </section>
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
            Categories are filtered by selected transaction type (income, expense, transfer, refund). Add
            EPF/PPF/NPS and other holdings under Investment.
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
                  categoryId: "",
                  tagId: ""
                })
              }
            >
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
              <option value="TRANSFER">Transfer</option>
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
              type="date"
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
                {(transactionForm.transactionType === "REFUND"
                  ? refundCategoryOptions
                  : categoriesByKind[transactionCategoryKind]
                ).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(transactionForm.transactionType === "EXPENSE" || transactionForm.transactionType === "REFUND") && (
            <fieldset className="analysis-tag-fieldset">
              <legend>Spending analysis</legend>
              <p className="form-hint">
                {transactionForm.transactionType === "REFUND"
                  ? "Tag the refund as a need or want so it reduces that spending bucket."
                  : "Classify this expense as a need or want. Track EPF/PPF/NPS and other holdings under Investment."}
              </p>
              <div className="analysis-tag-options" role="radiogroup" aria-label="Spending analysis">
                {expenseAnalysisTags.map((tag) => (
                  <label
                    key={tag.id}
                    className={`analysis-tag-option ${transactionForm.tagId === tag.id ? "selected" : ""}`}
                    style={{ ["--analysis-tag-color" as string]: tag.color }}
                  >
                    <input
                      type="radio"
                      name="analysis-tag"
                      value={tag.id}
                      checked={transactionForm.tagId === tag.id}
                      onChange={() => setTransactionForm({ ...transactionForm, tagId: tag.id })}
                    />
                    <span>{tag.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
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
    const analysisTotal = Math.max(spendingAnalysis.total, 1);
    const needsShare = (spendingAnalysis.totals.Needs / analysisTotal) * 100;
    const wantsShare = (spendingAnalysis.totals.Wants / analysisTotal) * 100;
    const investmentsShare = (spendingAnalysis.totals.Investments / analysisTotal) * 100;
    const untaggedShare = (spendingAnalysis.untagged / analysisTotal) * 100;
    const analysisDonut = `conic-gradient(
      ${ANALYSIS_TAG_COLORS.Needs} 0% ${needsShare}%,
      ${ANALYSIS_TAG_COLORS.Wants} ${needsShare}% ${needsShare + wantsShare}%,
      ${ANALYSIS_TAG_COLORS.Investments} ${needsShare + wantsShare}% ${needsShare + wantsShare + investmentsShare}%,
      #e5e5e5 ${needsShare + wantsShare + investmentsShare}% 100%
    )`;
    const analysisCenterValue =
      analysisDonutFocus === "untagged"
        ? spendingAnalysis.untagged
        : analysisDonutFocus
          ? spendingAnalysis.totals[analysisDonutFocus]
          : spendingAnalysis.total;
    const analysisCenterLabel =
      analysisDonutFocus === "untagged"
        ? "Untagged"
        : analysisDonutFocus
          ? analysisDonutFocus
          : "Analyzed";
    const analysisCenterPercent =
      spendingAnalysis.total > 0 ? Math.round((analysisCenterValue / spendingAnalysis.total) * 100) : 0;

    return (
      <section className="workspace-panel">
        <div>
          <p className="eyebrow">Transactions</p>
          <h2>Recent transactions</h2>
        </div>

        <div className="transaction-analysis-panel" aria-label="Spending analysis">
          <div className="transaction-date-filters">
            <div className="date-preset-row" role="group" aria-label="Date range">
              {(
                [
                  ["this_month", "This Month"],
                  ["last_month", "Last Month"],
                  ["this_year", "This Year"],
                  ["custom", "Custom"]
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`date-preset-btn ${transactionDatePreset === value ? "active" : ""}`}
                  onClick={() => setTransactionDatePreset(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {transactionDatePreset === "custom" && (
              <div className="custom-date-range">
                <label>
                  From
                  <input
                    type="date"
                    value={transactionCustomStart}
                    onChange={(event) => setTransactionCustomStart(event.target.value)}
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    value={transactionCustomEnd}
                    onChange={(event) => setTransactionCustomEnd(event.target.value)}
                  />
                </label>
              </div>
            )}
          </div>

          <div
            className="transaction-analysis-chart"
            onMouseLeave={() => setAnalysisDonutFocus(null)}
          >
            <div className="analysis-donut" style={{ background: analysisDonut }}>
              <div className="analysis-donut-center">
                <strong>{formatCurrency(analysisCenterValue)}</strong>
                <span>
                  {analysisCenterLabel}
                  {analysisDonutFocus ? ` · ${analysisCenterPercent}%` : ""}
                </span>
              </div>
            </div>
            <div className="analysis-breakdown">
              {ANALYSIS_TAG_NAMES.map((name) => {
                const amount = spendingAnalysis.totals[name];
                const percent = spendingAnalysis.total > 0 ? Math.round((amount / spendingAnalysis.total) * 100) : 0;
                const isActive = analysisDonutFocus === name;
                return (
                  <button
                    key={name}
                    type="button"
                    className={`analysis-breakdown-row interactive-chart-row${isActive ? " active" : ""}${analysisDonutFocus && !isActive ? " dimmed" : ""}`}
                    onMouseEnter={() => setAnalysisDonutFocus(name)}
                    onFocus={() => setAnalysisDonutFocus(name)}
                    onBlur={() => setAnalysisDonutFocus(null)}
                  >
                    <div className="analysis-breakdown-label">
                      <span className="legend-dot" style={{ background: ANALYSIS_TAG_COLORS[name] }} />
                      <strong>{name}</strong>
                    </div>
                    <div className="analysis-bar-track" aria-hidden="true">
                      <div
                        className="analysis-bar-fill"
                        style={{
                          width: `${percent}%`,
                          background: ANALYSIS_TAG_COLORS[name]
                        }}
                      />
                    </div>
                    <div className="analysis-breakdown-values">
                      <span>{formatCurrency(amount)}</span>
                      <span>{percent}%</span>
                    </div>
                  </button>
                );
              })}
              {spendingAnalysis.untagged > 0 && (
                <button
                  type="button"
                  className={`analysis-untagged-note interactive-chart-row${analysisDonutFocus === "untagged" ? " active" : ""}`}
                  onMouseEnter={() => setAnalysisDonutFocus("untagged")}
                  onFocus={() => setAnalysisDonutFocus("untagged")}
                  onBlur={() => setAnalysisDonutFocus(null)}
                >
                  Untagged spending: {formatCurrency(spendingAnalysis.untagged)}
                  {untaggedShare > 0 ? ` (${Math.round(untaggedShare)}%)` : ""}
                </button>
              )}
            </div>
          </div>
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
                    categoryId: "",
                    tagId:
                      event.target.value === "EXPENSE" || event.target.value === "REFUND"
                        ? expenseAnalysisTags.some((tag) => tag.id === editingTransactionForm.tagId)
                          ? editingTransactionForm.tagId
                          : ""
                        : ""
                  })
                }
              >
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
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
                type="date"
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
                {(editingTransactionForm.transactionType === "REFUND"
                  ? refundCategoryOptions
                  : categoriesByKind[editingCategoryKind]
                ).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            {(editingTransactionForm.transactionType === "EXPENSE" ||
              editingTransactionForm.transactionType === "REFUND") && (
              <fieldset className="analysis-tag-fieldset">
                <legend>Spending analysis</legend>
                <p className="form-hint">
                  {editingTransactionForm.transactionType === "REFUND"
                    ? "Tag the refund as a need or want so it reduces that spending bucket."
                    : "Classify this expense as a need or want. Track EPF/PPF/NPS and other holdings under Investment."}
                </p>
                <div className="analysis-tag-options" role="radiogroup" aria-label="Spending analysis">
                  {expenseAnalysisTags.map((tag) => (
                    <label
                      key={tag.id}
                      className={`analysis-tag-option ${editingTransactionForm.tagId === tag.id ? "selected" : ""}`}
                      style={{ ["--analysis-tag-color" as string]: tag.color }}
                    >
                      <input
                        type="radio"
                        name="edit-analysis-tag"
                        value={tag.id}
                        checked={editingTransactionForm.tagId === tag.id}
                        onChange={() => setEditingTransactionForm({ ...editingTransactionForm, tagId: tag.id })}
                      />
                      <span>{tag.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
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
          {ledgerTransactions.slice(0, 10).map((transaction) => {
            const analysisLabel = transaction.tag_id
              ? analysisTagById[String(transaction.tag_id)]
              : null;
            return (
              <article key={transaction.id} className={`data-row ${transactionToneClass(transaction.transaction_type)}`}>
                <div>
                  <strong>{transaction.merchant || transaction.transaction_type}</strong>
                  <p>
                    {new Date(transaction.date).toLocaleDateString()}
                    {analysisLabel ? ` · ${analysisLabel}` : ""}
                  </p>
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
            );
          })}
          {ledgerTransactions.length === 0 && (
            <p className="form-hint">No transactions in this date range.</p>
          )}
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
          {accounts.slice(0, 3).map((account) => {
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
    const existingGoalNames = new Set(goals.map((goal) => goal.name));
    const availableTemplates = goalTemplates.filter((template) => !existingGoalNames.has(template.name));

    return (
      <section className="workspace-panel goal-workspace">
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

        <div className="suggested-goals-block">
          <button
            className="subtle-action"
            type="button"
            onClick={() => setShowSuggestedGoals((current) => !current)}
          >
            {showSuggestedGoals ? "Hide suggested goals" : "Browse suggested goals"}
          </button>
          {showSuggestedGoals && (
            <div className="suggested-goals-list">
              {availableTemplates.length === 0 ? (
                <p>All suggested goals are already added.</p>
              ) : (
                availableTemplates.map((template) => (
                  <article key={template.name} className="data-row compact-selection-row">
                    <div>
                      <strong>{template.name}</strong>
                      <p>Set your own target amount</p>
                    </div>
                    <button
                      className="subtle-action small-action"
                      type="button"
                      onClick={() => applySuggestedGoal(template)}
                    >
                      Use
                    </button>
                  </article>
                ))
              )}
            </div>
          )}
        </div>

        <div className="data-list goal-scroll-list">
          {goalsByCompletion.length === 0 ? (
            <p>No goals yet. Add one above, or browse suggested goals.</p>
          ) : (
            goalsByCompletion.map((goal) => {
              const target = parseAmount(goal.target_amount);
              const current = goalCurrentAmountById.get(goal.id) ?? parseAmount(goal.current_amount);
              const progress = goalCompletionPercent(goal, current);
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
                    {editingGoalId === goal.id && (
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
                        <label>
                          Target date
                          <input
                            type="date"
                            value={goalEditForm.targetDate}
                            onChange={(event) => setGoalEditForm({ ...goalEditForm, targetDate: event.target.value })}
                          />
                        </label>
                        <div className="inline-actions">
                          <button className="primary-action compact-primary-action" type="submit" disabled={savingGoalEdit}>
                            {savingGoalEdit && <Loader2 className="spin" size={16} />}
                            {savingGoalEdit ? "Saving" : "Save"}
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
                    )}
                  </div>
                  <div className="goal-row-aside">
                    <span>{goal.target_date ? new Date(goal.target_date).toLocaleDateString() : "No target date"}</span>
                    {editingGoalId !== goal.id && (
                      <button className="subtle-action small-action" type="button" onClick={() => startEditGoal(goal)}>
                        Edit
                      </button>
                    )}
                  </div>
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
    const isOverviewTab = activeInvestmentTab === "Overview";
    const isMutualFundsTab = activeInvestmentTab === "Mutual Funds";
    const isStocksTab = activeInvestmentTab === "Stocks";
    const isInternationalTab = activeInvestmentTab === "International Investment";
    const isCryptoTab = activeInvestmentTab === "Crypto";

    const categoryPills = (
      <>
        <div className="section-pills investment-category-pills" aria-label="Investment categories">
          {investmentTabNames.map((tabName) => (
            <button
              key={tabName}
              className={activeInvestmentTab === tabName ? "active" : ""}
              type="button"
              onClick={() => {
                setActiveInvestmentTab(tabName);
                setEditingHoldingId(null);
                setHoldingPendingDelete(null);
                setTransactionAssetForm({ name: "", amount: "", goalAllocations: [] });
                setEditingTransactionAssetId(null);
              }}
            >
              {tabName}
            </button>
          ))}
        </div>
        {refreshingInvestmentData && <p className="form-hint">Refreshing latest NAV and market prices...</p>}
      </>
    );

    if (isOverviewTab) {
      const mutualFundHoldings = mutualFundPortfolio?.holdings ?? [];
      const stockHoldings = stockPortfolio?.holdings ?? [];
      const internationalCurrentUsd = parseAmount(internationalPortfolio?.total_current_value ?? "0");
      const internationalCurrentInr = usdInrRate !== null ? internationalCurrentUsd * usdInrRate : 0;
      const internationalHoldings = internationalPortfolio?.holdings ?? [];
      const cryptoHoldings = cryptoPortfolio?.holdings ?? [];
      const cryptoCurrentUsd = parseAmount(cryptoPortfolio?.total_current_value ?? "0");
      const cryptoCurrentInr = usdInrRate !== null ? cryptoCurrentUsd * usdInrRate : 0;

      const mutualFundGoldInr = mutualFundHoldings.reduce(
        (sum, holding) =>
          mutualFundOverviewClass(holding.category_name) === "Gold"
            ? sum + parseAmount(holding.current_value)
            : sum,
        0
      );
      const stockGoldInr = stockHoldings.reduce(
        (sum, holding) =>
          stockOverviewClass(holding.sector_name) === "Gold"
            ? sum + parseAmount(holding.current_value)
            : sum,
        0
      );
      const internationalGoldInr =
        usdInrRate === null
          ? 0
          : internationalHoldings.reduce(
              (sum, holding) =>
                internationalOverviewClass(holding.sector_name) === "Gold"
                  ? sum + parseAmount(holding.current_value) * usdInrRate
                  : sum,
              0
            );
      const goldTotalInr = mutualFundGoldInr + stockGoldInr + internationalGoldInr;

      const mutualFundTotalInr = mutualFundHoldings.reduce(
        (sum, holding) =>
          mutualFundOverviewClass(holding.category_name) === "Mutual Funds"
            ? sum + parseAmount(holding.current_value)
            : sum,
        0
      );
      const stockTotalInr = stockHoldings.reduce(
        (sum, holding) =>
          stockOverviewClass(holding.sector_name) === "Stocks"
            ? sum + parseAmount(holding.current_value)
            : sum,
        0
      );
      const mutualFundInternationalInr = mutualFundHoldings.reduce(
        (sum, holding) =>
          mutualFundOverviewClass(holding.category_name) === "International Investment"
            ? sum + parseAmount(holding.current_value)
            : sum,
        0
      );
      const stockInternationalInr = stockHoldings.reduce(
        (sum, holding) =>
          stockOverviewClass(holding.sector_name) === "International Investment"
            ? sum + parseAmount(holding.current_value)
            : sum,
        0
      );
      const internationalNativeInr = Math.max(0, internationalCurrentInr - internationalGoldInr);
      const internationalTotalInr =
        internationalNativeInr + mutualFundInternationalInr + stockInternationalInr;

      const transactionValueByAssetClass = Object.fromEntries(
        TRANSACTION_ASSET_CLASSES.map((label) => [label, 0])
      ) as Record<TransactionAssetClass, number>;
      for (const transaction of transactions) {
        if (transaction.transaction_type !== "INVESTMENT" || !transaction.category_id) {
          continue;
        }
        const categoryName = investmentCategoryById[transaction.category_id];
        if (categoryName && isTransactionAssetClass(categoryName)) {
          transactionValueByAssetClass[categoryName] += parseAmount(transaction.amount);
        }
      }

      const allocationItems = ASSET_CLASS_LABELS.map((label) => {
        let value = 0;
        if (label === "Mutual Funds") {
          value = mutualFundTotalInr;
        } else if (label === "Stocks") {
          value = stockTotalInr;
        } else if (label === "International Investment") {
          value = internationalTotalInr;
        } else if (label === "Gold") {
          value = goldTotalInr;
        } else if (label === "Crypto") {
          value = cryptoCurrentInr;
        } else if (isTransactionAssetClass(label)) {
          value = transactionValueByAssetClass[label];
        }
        return { label, value, color: INVESTMENT_ALLOCATION_COLORS[label] };
      });
      const allocationTotal = allocationItems.reduce((sum, item) => sum + item.value, 0);
      const focusedAllocation = allocationItems.find((item) => item.label === allocationFocus) ?? null;
      const allocationCenterValue = focusedAllocation?.value ?? allocationTotal;
      const allocationCenterLabel = focusedAllocation
        ? `${focusedAllocation.label} · ${allocationTotal > 0 ? ((focusedAllocation.value / allocationTotal) * 100).toFixed(1) : "0.0"}%`
        : "Total value";

      type GoalAllocation = {
        goalId: string;
        goalName: string;
        byClass: Record<AssetClassLabel, number>;
      };

      const emptyClassTotals = (): Record<AssetClassLabel, number> =>
        Object.fromEntries(ASSET_CLASS_LABELS.map((label) => [label, 0])) as Record<AssetClassLabel, number>;

      const goalAllocationMap = new Map<string, GoalAllocation>();
      for (const goal of goals) {
        goalAllocationMap.set(goal.id, {
          goalId: goal.id,
          goalName: goal.name,
          byClass: emptyClassTotals()
        });
      }

      const unassignedGoalKey = "__no_goal__";
      const ensureUnassignedBucket = () => {
        if (goalAllocationMap.has(unassignedGoalKey)) {
          return;
        }
        goalAllocationMap.set(unassignedGoalKey, {
          goalId: unassignedGoalKey,
          goalName: "No goal",
          byClass: emptyClassTotals()
        });
      };

      const addToGoalClass = (goalId: string | null | undefined, assetClass: AssetClassLabel, value: number) => {
        if (value <= 0) {
          return;
        }
        const key = goalId ?? unassignedGoalKey;
        if (!goalId) {
          ensureUnassignedBucket();
        }
        const bucket = goalAllocationMap.get(key);
        if (!bucket) {
          return;
        }
        bucket.byClass[assetClass] += value;
      };

      for (const holding of mutualFundHoldings) {
        addToGoalClass(
          holding.goal_id,
          mutualFundOverviewClass(holding.category_name),
          parseAmount(holding.current_value)
        );
      }
      for (const holding of stockHoldings) {
        addToGoalClass(
          holding.goal_id,
          stockOverviewClass(holding.sector_name),
          parseAmount(holding.current_value)
        );
      }
      for (const holding of internationalHoldings) {
        if (usdInrRate === null) {
          continue;
        }
        addToGoalClass(
          holding.goal_id,
          internationalOverviewClass(holding.sector_name),
          parseAmount(holding.current_value) * usdInrRate
        );
      }
      for (const holding of cryptoHoldings) {
        if (usdInrRate === null) {
          continue;
        }
        addToGoalClass(holding.goal_id, "Crypto", parseAmount(holding.current_value) * usdInrRate);
      }
      for (const transaction of transactions) {
        if (transaction.transaction_type !== "INVESTMENT" || !transaction.category_id) {
          continue;
        }
        const categoryName = investmentCategoryById[transaction.category_id];
        if (!categoryName || !isTransactionAssetClass(categoryName)) {
          continue;
        }
        addToGoalClass(
          transaction.goal_id != null ? String(transaction.goal_id) : null,
          categoryName,
          parseAmount(transaction.amount)
        );
      }

      const goalProgressById = new Map(
        goals.map((goal) => [
          goal.id,
          goalCompletionPercent(goal, goalCurrentAmountById.get(goal.id))
        ])
      );
      const goalAllocations = Array.from(goalAllocationMap.values())
        .map((entry) => {
          const total = ASSET_CLASS_LABELS.reduce((sum, label) => sum + entry.byClass[label], 0);
          return { ...entry, total };
        })
        .filter((entry) => entry.total > 0)
        .sort((left, right) => {
          const completionDelta =
            (goalProgressById.get(right.goalId) ?? 0) - (goalProgressById.get(left.goalId) ?? 0);
          if (completionDelta !== 0) {
            return completionDelta;
          }
          return left.goalName.localeCompare(right.goalName);
        });

      type GoalLinkedHolding = {
        id: string;
        name: string;
        assetClass: AssetClassLabel;
        valueInr: number;
      };

      const matchesGoalId = (holdingGoalId: string | null | undefined, goalId: string) =>
        goalId === unassignedGoalKey ? holdingGoalId == null : holdingGoalId === goalId;

      const linkedHoldingsForGoal = (goalId: string, assetClassFilter: string | null): GoalLinkedHolding[] => {
        const rows: GoalLinkedHolding[] = [];

        for (const holding of mutualFundHoldings) {
          if (!matchesGoalId(holding.goal_id, goalId)) {
            continue;
          }
          const assetClass = mutualFundOverviewClass(holding.category_name);
          if (assetClassFilter && assetClass !== assetClassFilter) {
            continue;
          }
          rows.push({
            id: `mf-${holding.id}`,
            name: holding.scheme_name,
            assetClass,
            valueInr: parseAmount(holding.current_value)
          });
        }

        for (const holding of stockHoldings) {
          if (!matchesGoalId(holding.goal_id, goalId)) {
            continue;
          }
          const assetClass = stockOverviewClass(holding.sector_name);
          if (assetClassFilter && assetClass !== assetClassFilter) {
            continue;
          }
          rows.push({
            id: `stock-${holding.id}`,
            name: holding.company_name?.trim() || holding.symbol,
            assetClass,
            valueInr: parseAmount(holding.current_value)
          });
        }

        for (const holding of internationalHoldings) {
          if (!matchesGoalId(holding.goal_id, goalId) || usdInrRate === null) {
            continue;
          }
          const assetClass = internationalOverviewClass(holding.sector_name);
          if (assetClassFilter && assetClass !== assetClassFilter) {
            continue;
          }
          rows.push({
            id: `intl-${holding.id}`,
            name: holding.security_name?.trim() || holding.symbol,
            assetClass,
            valueInr: parseAmount(holding.current_value) * usdInrRate
          });
        }

        for (const holding of cryptoHoldings) {
          if (!matchesGoalId(holding.goal_id, goalId) || usdInrRate === null) {
            continue;
          }
          if (assetClassFilter && assetClassFilter !== "Crypto") {
            continue;
          }
          rows.push({
            id: `crypto-${holding.id}`,
            name: holding.asset_name?.trim() || holding.symbol,
            assetClass: "Crypto",
            valueInr: parseAmount(holding.current_value) * usdInrRate
          });
        }

        for (const transaction of transactions) {
          if (transaction.transaction_type !== "INVESTMENT" || !transaction.category_id) {
            continue;
          }
          const categoryName = investmentCategoryById[transaction.category_id];
          if (!categoryName || !isTransactionAssetClass(categoryName)) {
            continue;
          }
          const transactionGoalId =
            transaction.goal_id != null ? String(transaction.goal_id) : null;
          if (!matchesGoalId(transactionGoalId, goalId)) {
            continue;
          }
          if (assetClassFilter && categoryName !== assetClassFilter) {
            continue;
          }
          rows.push({
            id: `txn-${transaction.id}`,
            name: transaction.merchant?.trim() || categoryName,
            assetClass: categoryName,
            valueInr: parseAmount(transaction.amount)
          });
        }

        return rows.sort((left, right) => {
          const classDelta =
            ASSET_CLASS_LABELS.indexOf(left.assetClass) - ASSET_CLASS_LABELS.indexOf(right.assetClass);
          if (classDelta !== 0) {
            return classDelta;
          }
          return right.valueInr - left.valueInr;
        });
      };

      const selectedGoalHoldings = goalAllocationFocus
        ? linkedHoldingsForGoal(goalAllocationFocus.goalId, goalAllocationFocus.label)
        : [];
      const selectedGoalName =
        goalAllocations.find((entry) => entry.goalId === goalAllocationFocus?.goalId)?.goalName ??
        null;

      const mfInvested = parseAmount(mutualFundPortfolio?.total_invested_amount ?? "0");
      const mfCurrent = parseAmount(mutualFundPortfolio?.total_current_value ?? "0");
      const stockInvested = parseAmount(stockPortfolio?.total_invested_amount ?? "0");
      const stockCurrent = parseAmount(stockPortfolio?.total_current_value ?? "0");
      const internationalInvestedUsd = parseAmount(internationalPortfolio?.total_invested_amount ?? "0");
      const internationalInvestedInr =
        usdInrRate !== null ? internationalInvestedUsd * usdInrRate : 0;
      const cryptoInvestedUsd = parseAmount(cryptoPortfolio?.total_invested_amount ?? "0");
      const cryptoInvestedInr = usdInrRate !== null ? cryptoInvestedUsd * usdInrRate : 0;
      const transactionOnlyTotal = TRANSACTION_ASSET_CLASSES.reduce(
        (sum, label) => sum + transactionValueByAssetClass[label],
        0
      );
      const overallInvested =
        mfInvested + stockInvested + internationalInvestedInr + cryptoInvestedInr + transactionOnlyTotal;
      const overallCurrent =
        mfCurrent + stockCurrent + internationalCurrentInr + cryptoCurrentInr + transactionOnlyTotal;
      const overallPnl = overallCurrent - overallInvested;
      const overallPnlPercent = overallInvested > 0 ? (overallPnl / overallInvested) * 100 : 0;
      const overallTone = pnlTone(overallPnl);

      return (
        <div className="investment-section-shell">
          {categoryPills}
          <section className="workspace-panel">
            <div>
              <p className="eyebrow">Investment</p>
              <h2>Overview</h2>
            </div>
            <section className="dashboard-grid investment-summary-grid" aria-label="Overall investment summary">
              <article>
                <p>Total invested</p>
                <strong>{formatCurrency(overallInvested)}</strong>
              </article>
              <article>
                <p>Current value</p>
                <strong>{formatCurrency(overallCurrent)}</strong>
              </article>
              <article className={`pnl-summary pnl-summary--${overallTone}`}>
                <p>Total P/L</p>
                <strong className={pnlAmountClass(overallTone)}>
                  {formatSignedCurrency(overallPnl)} ({formatPnlPercent(overallPnlPercent)})
                </strong>
              </article>
            </section>
            {usdInrRate === null && internationalCurrentUsd > 0 && (
              <p className="form-hint">USD/INR rate unavailable. International totals are temporarily excluded.</p>
            )}
            <section className="investment-overview-grid" aria-label="Investment asset allocation">
              <article className="investment-allocation-card">
                <p className="investment-allocation-title">Portfolio asset allocation (INR)</p>
                <div className="investment-allocation-visual">
                  <AllocationBarChart
                    items={allocationItems}
                    activeLabel={allocationFocus}
                    onSelect={(label) => {
                      setGoalAllocationFocus(null);
                      setAllocationFocus((current) => (current === label ? null : label));
                    }}
                    height={220}
                    centerValue={formatCurrency(allocationCenterValue)}
                    centerLabel={allocationCenterLabel}
                    ariaLabel="Portfolio asset allocation"
                  />
                </div>
                <div className="investment-allocation-legend">
                  {(allocationTotal > 0 ? allocationItems.filter((item) => item.value > 0) : allocationItems).map(
                    (item) => {
                      const share = allocationTotal > 0 ? (item.value / allocationTotal) * 100 : 0;
                      const isActive = allocationFocus === item.label;
                      return (
                        <button
                          key={item.label}
                          type="button"
                          data-allocation-interactive="true"
                          className={`investment-allocation-row interactive-chart-row${isActive ? " active" : ""}${allocationFocus && !isActive ? " dimmed" : ""}`}
                          onClick={() => {
                            setGoalAllocationFocus(null);
                            setAllocationFocus((current) => (current === item.label ? null : item.label));
                          }}
                        >
                          <div className="investment-allocation-label">
                            <span className="investment-allocation-dot" style={{ backgroundColor: item.color }} />
                            <strong>{item.label}</strong>
                          </div>
                          <div className="investment-allocation-values">
                            <span>{formatCurrency(item.value)}</span>
                            <span>{share.toFixed(1)}%</span>
                          </div>
                        </button>
                      );
                    }
                  )}
                </div>
                {usdInrRate === null && internationalCurrentUsd > 0 && (
                  <p className="form-hint">USD/INR rate unavailable. International slice is temporarily excluded.</p>
                )}
              </article>

              <div className="investment-goal-allocation-section">
                <p className="investment-allocation-title">Asset allocation by goal (INR)</p>
                {goalAllocations.length === 0 ? (
                  <p className="form-hint">No goal-linked investments yet.</p>
                ) : (
                  <>
                    <div className="investment-goal-card-grid">
                      {goalAllocations.map((goalAllocation) => {
                        const goalItems = ASSET_CLASS_LABELS.map((label) => ({
                          label,
                          value: goalAllocation.byClass[label],
                          color: INVESTMENT_ALLOCATION_COLORS[label]
                        })).filter((item) => item.value > 0);
                        const isGoalSelected = goalAllocationFocus?.goalId === goalAllocation.goalId;
                        const activeGoalLabel = isGoalSelected ? goalAllocationFocus?.label ?? null : null;
                        const focusedGoalItem = activeGoalLabel
                          ? goalItems.find((item) => item.label === activeGoalLabel) ?? null
                          : null;
                        return (
                          <article
                            key={goalAllocation.goalId}
                            className={`investment-goal-card${isGoalSelected ? " selected" : ""}`}
                            data-allocation-interactive="true"
                            role="button"
                            tabIndex={0}
                            aria-pressed={isGoalSelected}
                            aria-label={`Show investments linked to ${goalAllocation.goalName}`}
                            onClick={() => {
                              setAllocationFocus(null);
                              setGoalAllocationFocus((current) =>
                                current?.goalId === goalAllocation.goalId && current.label === null
                                  ? null
                                  : { goalId: goalAllocation.goalId, label: null }
                              );
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") {
                                return;
                              }
                              event.preventDefault();
                              setAllocationFocus(null);
                              setGoalAllocationFocus((current) =>
                                current?.goalId === goalAllocation.goalId && current.label === null
                                  ? null
                                  : { goalId: goalAllocation.goalId, label: null }
                              );
                            }}
                          >
                            <div className="investment-goal-card-header">
                              <strong>{goalAllocation.goalName}</strong>
                              <span>
                                {focusedGoalItem
                                  ? formatCurrency(focusedGoalItem.value)
                                  : formatCurrency(goalAllocation.total)}
                              </span>
                            </div>
                            <div
                              className="investment-goal-card-body"
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              <AllocationDonutChart
                                items={goalItems}
                                activeLabel={activeGoalLabel}
                                onSelect={(label) => {
                                  setAllocationFocus(null);
                                  setGoalAllocationFocus((current) =>
                                    current?.goalId === goalAllocation.goalId && current.label === label
                                      ? null
                                      : { goalId: goalAllocation.goalId, label }
                                  );
                                }}
                                size={148}
                                explodeDistance={10}
                                ariaLabel={`${goalAllocation.goalName} asset allocation`}
                              />
                              <div className="investment-goal-card-legend">
                                {goalItems.map((item) => {
                                  const share =
                                    goalAllocation.total > 0
                                      ? (item.value / goalAllocation.total) * 100
                                      : 0;
                                  const isActive = activeGoalLabel === item.label;
                                  return (
                                    <button
                                      key={item.label}
                                      type="button"
                                      data-allocation-interactive="true"
                                      className={`investment-goal-card-legend-row interactive-chart-row${isActive ? " active" : ""}${activeGoalLabel && !isActive ? " dimmed" : ""}`}
                                      onClick={() => {
                                        setAllocationFocus(null);
                                        setGoalAllocationFocus((current) =>
                                          current?.goalId === goalAllocation.goalId &&
                                          current.label === item.label
                                            ? null
                                            : { goalId: goalAllocation.goalId, label: item.label }
                                        );
                                      }}
                                    >
                                      <div className="investment-allocation-label">
                                        <span
                                          className="investment-allocation-dot"
                                          style={{ backgroundColor: item.color }}
                                        />
                                        <span>{item.label}</span>
                                      </div>
                                      <strong>{share.toFixed(1)}%</strong>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    {goalAllocationFocus && selectedGoalName ? (
                      <div
                        className="modal-backdrop"
                        role="presentation"
                        data-allocation-interactive="true"
                        onClick={() => setGoalAllocationFocus(null)}
                      >
                        <div
                          className="transaction-modal investment-goal-holdings-modal"
                          role="dialog"
                          aria-modal="true"
                          aria-label={`Investments linked to ${selectedGoalName}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="modal-header">
                            <div>
                              <h2>{selectedGoalName}</h2>
                              <p className="investment-goal-holdings-subtitle">
                                {goalAllocationFocus.label
                                  ? `${goalAllocationFocus.label} linked to this goal`
                                  : "Investments linked to this goal"}
                              </p>
                            </div>
                            <button
                              className="subtle-action icon-action"
                              type="button"
                              aria-label="Close goal investments"
                              onClick={() => setGoalAllocationFocus(null)}
                            >
                              <X size={14} />
                            </button>
                          </div>
                          {selectedGoalHoldings.length === 0 ? (
                            <p className="form-hint">No named holdings for this selection.</p>
                          ) : (
                            <div className="investment-goal-holdings-groups">
                              {ASSET_CLASS_LABELS.map((assetClass) => {
                                const holdings = selectedGoalHoldings.filter(
                                  (holding) => holding.assetClass === assetClass
                                );
                                if (holdings.length === 0) {
                                  return null;
                                }
                                return (
                                  <div key={assetClass} className="investment-goal-holdings-group">
                                    <p className="investment-goal-holdings-group-title">
                                      <span
                                        className="investment-allocation-dot"
                                        style={{
                                          backgroundColor: INVESTMENT_ALLOCATION_COLORS[assetClass]
                                        }}
                                      />
                                      {assetClass}
                                    </p>
                                    <ul className="investment-goal-holdings-list">
                                      {holdings.map((holding) => (
                                        <li key={holding.id}>
                                          <span title={holding.name}>{holding.name}</span>
                                          <strong>{formatCurrency(holding.valueInr)}</strong>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          </section>
        </div>
      );
    }

    if (isCryptoTab) {
      const totalInvestedUsd = parseAmount(cryptoPortfolio?.total_invested_amount ?? "0");
      const totalCurrentUsd = parseAmount(cryptoPortfolio?.total_current_value ?? "0");
      const totalPnlUsd = parseAmount(cryptoPortfolio?.total_pnl ?? "0");
      const totalPnlPercent = parseAmount(cryptoPortfolio?.total_pnl_percent ?? "0");
      const totalInvestedInr = usdInrRate !== null ? totalInvestedUsd * usdInrRate : null;
      const totalCurrentInr = usdInrRate !== null ? totalCurrentUsd * usdInrRate : null;
      const totalPnlInr = usdInrRate !== null ? totalPnlUsd * usdInrRate : null;
      const totalTone = pnlTone(totalPnlUsd);
      const selectedCryptoSipSiblingCount = cryptoForm.symbol.trim()
        ? symbolGoalSiblings(cryptoPortfolio?.holdings ?? [], cryptoForm.symbol).length
        : 0;
      const multiGoalSipHint =
        "This holding is already split across goals. Leave goals empty and the new SIP units will use the same split.";

      return (
        <div className="investment-section-shell">
          {categoryPills}
          <section className="workspace-panel">
            <div>
              <p className="eyebrow">Investment</p>
              <h2>Crypto portfolio</h2>
            </div>

            <div className="portfolio-compose">
              <div className="portfolio-compose-primary">
                <form className="portfolio-compose-block portfolio-entry-form" onSubmit={submitCryptoInvestment}>
                  <p className="portfolio-compose-label">Add holding</p>
                  <div className="portfolio-entry-fields portfolio-entry-fields--3">
                    <label>
                      Symbol
                      <input
                        required
                        placeholder="BTC, ETH"
                        value={cryptoForm.symbol}
                        onChange={(event) => setCryptoForm({ ...cryptoForm, symbol: event.target.value })}
                      />
                    </label>
                    <label>
                      Asset name
                      <input
                        value={cryptoForm.assetName}
                        onChange={(event) => setCryptoForm({ ...cryptoForm, assetName: event.target.value })}
                      />
                    </label>
                    <label>
                      Sector
                      <select
                        value={cryptoForm.sectorOptionId}
                        onChange={(event) => setCryptoForm({ ...cryptoForm, sectorOptionId: event.target.value })}
                      >
                        <option value="">No sector</option>
                        {investmentOptions.crypto_sectors.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.display_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="portfolio-entry-fields portfolio-entry-fields--4">
                    <label>
                      Quantity
                      <input
                        required
                        min="0.000001"
                        step="0.000001"
                        type="number"
                        value={cryptoForm.quantity}
                        onChange={(event) => setCryptoForm({ ...cryptoForm, quantity: event.target.value })}
                      />
                    </label>
                    <label>
                      Avg buy price (USD)
                      <input
                        required
                        min="0.000001"
                        step="0.000001"
                        type="number"
                        value={cryptoForm.avgPrice}
                        onChange={(event) => setCryptoForm({ ...cryptoForm, avgPrice: event.target.value })}
                      />
                    </label>
                    <label>
                      Current price (USD)
                      <div className="inline-actions">
                        <input
                          required
                          min="0.000001"
                          step="0.000001"
                          type="number"
                          value={cryptoForm.currentPrice}
                          onChange={(event) => setCryptoForm({ ...cryptoForm, currentPrice: event.target.value })}
                        />
                        <button
                          className="subtle-action small-action"
                          type="button"
                          disabled={loadingCryptoPrice}
                          onClick={() => void fetchCryptoCurrentPrice()}
                        >
                          {loadingCryptoPrice && <Loader2 className="spin" size={14} />}
                          {loadingCryptoPrice ? "Fetching" : "Auto"}
                        </button>
                      </div>
                    </label>
                  </div>
                  <button className="primary-action portfolio-entry-submit" disabled={savingCryptoInvestment} type="submit">
                    {savingCryptoInvestment && <Loader2 className="spin" size={16} />}
                    {savingCryptoInvestment ? "Saving" : "Add crypto"}
                  </button>
                </form>
                <p className="form-hint">
                  Note: Crypto is tracked in USD. INR figures use the latest USD/INR rate and show as N/A when the rate
                  is unavailable.
                </p>
              </div>

              <aside className="portfolio-compose-aside">
                <GoalAllocationPicker
                  goals={goalsByCompletion}
                  allocations={cryptoForm.goalAllocations}
                  onChange={(goalAllocations) => setCryptoForm({ ...cryptoForm, goalAllocations })}
                  sipHint={
                    selectedCryptoSipSiblingCount > 1 && cryptoForm.goalAllocations.length === 0
                      ? multiGoalSipHint
                      : null
                  }
                />
              </aside>
            </div>

            <section className="dashboard-grid investment-summary-grid portfolio-summary-row" aria-label="Investment summary">
              <article>
                <p>Total invested (USD)</p>
                <strong>{formatUsdCurrency(totalInvestedUsd)}</strong>
              </article>
              <article>
                <p>Current value (USD)</p>
                <strong>{formatUsdCurrency(totalCurrentUsd)}</strong>
              </article>
              <article className={`pnl-summary pnl-summary--${totalTone}`}>
                <p>Total P/L (USD)</p>
                <strong className={pnlAmountClass(totalTone)}>
                  {formatSignedUsdCurrency(totalPnlUsd)} ({formatPnlPercent(totalPnlPercent)})
                </strong>
              </article>
              <article>
                <p>Total invested (INR)</p>
                <strong>{totalInvestedInr === null ? "N/A" : formatCurrency(totalInvestedInr)}</strong>
              </article>
              <article>
                <p>Current value (INR)</p>
                <strong>{totalCurrentInr === null ? "N/A" : formatCurrency(totalCurrentInr)}</strong>
              </article>
              <article className={`pnl-summary pnl-summary--${totalTone}`}>
                <p>Total P/L (INR)</p>
                <strong className={pnlAmountClass(totalTone)}>
                  {totalPnlInr === null
                    ? "N/A"
                    : `${formatSignedCurrency(totalPnlInr)} (${formatPnlPercent(totalPnlPercent)})`}
                </strong>
              </article>
            </section>

            <div className="table-wrapper">
              {!cryptoPortfolio || cryptoPortfolio.holdings.length === 0 ? (
                <p>No crypto holdings yet.</p>
              ) : (
                <table className="portfolio-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
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
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cryptoPortfolio.holdings.map((holding) => {
                      const pnlValue = parseAmount(holding.pnl);
                      const pnlPercent = parseAmount(holding.pnl_percent);
                      const tone = pnlTone(pnlValue);
                      const isEditing = editingHoldingId === holding.id;
                      const linkedShares = linkedGoalShares(
                        cryptoPortfolio.holdings
                          .filter(
                            (entry) =>
                              entry.symbol.trim().toUpperCase() === holding.symbol.trim().toUpperCase() &&
                              entry.goal_id != null
                          )
                          .map((entry) => ({
                            goal_id: entry.goal_id,
                            goal_name: entry.goal_name,
                            quantity: parseAmount(entry.quantity)
                          }))
                      );
                      const isMultiGoalLinked = linkedShares.length > 1;
                      const isMultiGoalEdit = isEditing && isMultiGoalLinked;
                      return (
                        <Fragment key={holding.id}>
                          <tr
                            className={`holding-row holding-row--${tone}${isMultiGoalEdit ? " holding-row--editing-linked" : ""}`}
                          >
                            <td>{holding.symbol}</td>
                            <td>
                              {isEditing ? (
                                <label className="table-edit-field">
                                  {isMultiGoalEdit ? <span className="table-edit-field-label">Total qty</span> : null}
                                  <input
                                    className="table-edit-input"
                                    min="0.000001"
                                    step="0.000001"
                                    type="number"
                                    value={holdingEditForm.unitsOrQuantity}
                                    onChange={(event) =>
                                      setHoldingEditForm({ ...holdingEditForm, unitsOrQuantity: event.target.value })
                                    }
                                  />
                                </label>
                              ) : (
                                holding.quantity
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  className="table-edit-input"
                                  min="0.000001"
                                  step="0.000001"
                                  type="number"
                                  value={holdingEditForm.avgPrice}
                                  onChange={(event) => setHoldingEditForm({ ...holdingEditForm, avgPrice: event.target.value })}
                                />
                              ) : (
                                formatUsdCurrency(parseAmount(holding.avg_price))
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <select
                                  className="table-edit-input"
                                  value={holdingEditForm.optionId}
                                  onChange={(event) => setHoldingEditForm({ ...holdingEditForm, optionId: event.target.value })}
                                >
                                  <option value="">No sector</option>
                                  {investmentOptions.crypto_sectors.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.display_name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                holding.sector_name ?? "-"
                              )}
                            </td>
                            <td title={holding.asset_name ?? holding.symbol} className="table-text-ellipsis">
                              {holding.asset_name ?? holding.symbol}
                            </td>
                            <td>{formatUsdCurrency(parseAmount(holding.current_price))}</td>
                            <td>{formatUsdCurrency(parseAmount(holding.invested_amount))}</td>
                            <td>{formatUsdCurrency(parseAmount(holding.current_value))}</td>
                            <td>
                              <span className={`pnl-chip pnl-chip--${tone}`}>{formatSignedUsdCurrency(pnlValue)}</span>
                            </td>
                            <td>
                              <span className={`pnl-chip pnl-chip--${tone}`}>{formatPnlPercent(pnlPercent)}</span>
                            </td>
                            <td>
                              {isMultiGoalEdit ? (
                                <LinkedGoalsCell shares={linkedShares} />
                              ) : isEditing ? (
                                <select
                                  className="table-edit-input"
                                  value={holdingEditForm.goalId}
                                  onChange={(event) => setHoldingEditForm({ ...holdingEditForm, goalId: event.target.value })}
                                >
                                  <option value="">No goal</option>
                                  {goalsByCompletion.map((goal) => (
                                    <option key={goal.id} value={goal.id}>
                                      {goal.name}
                                    </option>
                                  ))}
                                </select>
                              ) : isMultiGoalLinked ? (
                                <span className="goal-shared-label" title={linkedShares.map((share) => share.goalName).join(", ")}>
                                  {holding.goal_name ?? "Goal"}
                                  <span className="goal-shared-badge">shared</span>
                                </span>
                              ) : (
                                holding.goal_name ?? "-"
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <form className="holding-edit-actions" onSubmit={submitHoldingEdit}>
                                  <div className="inline-actions">
                                    <button className="subtle-action small-action" type="submit" disabled={savingHoldingEdit}>
                                      {savingHoldingEdit ? "Saving" : "Save"}
                                    </button>
                                    <button className="subtle-action small-action" type="button" onClick={() => setEditingHoldingId(null)}>
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <div className="inline-actions holding-row-actions">
                                  <button
                                    className="subtle-action small-action icon-action"
                                    type="button"
                                    aria-label={`Edit ${holding.asset_name ?? holding.symbol}`}
                                    title="Edit"
                                    onClick={() =>
                                      startEditHolding(
                                        holding.id,
                                        holding.quantity,
                                        holding.avg_price,
                                        holding.sector_option_id,
                                        holding.goal_id
                                      )
                                    }
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    className="subtle-action small-action icon-action danger-action"
                                    type="button"
                                    aria-label={`Delete ${holding.asset_name ?? holding.symbol}`}
                                    title="Delete"
                                    onClick={() =>
                                      requestDeleteHolding(
                                        holding.id,
                                        holding.asset_name ?? holding.symbol,
                                        "crypto"
                                      )
                                    }
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                          {isMultiGoalEdit ? (
                            <tr className="holding-edit-banner-row">
                              <td colSpan={12}>
                                Editing total quantity for this holding. On save, quantity is split across{" "}
                                {linkedShares.map((share) => share.goalName).join(", ")} using the current percentages.
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      );
    }

    if (!isMutualFundsTab && !isStocksTab && !isInternationalTab && !isCryptoTab) {
      const tabTotalAmount = investmentTransactions.reduce(
        (sum, transaction) => sum + Math.abs(parseAmount(transaction.amount)),
        0
      );
      return (
        <div className="investment-section-shell">
          {categoryPills}
          <section className="workspace-panel">
            <div>
              <p className="eyebrow">Investment</p>
              <h2>{activeInvestmentTab}</h2>
            </div>
            <div className="portfolio-compose">
              <div className="portfolio-compose-primary">
                <form
                  className="portfolio-compose-block portfolio-entry-form"
                  onSubmit={submitTransactionAssetInvestment}
                >
                  <p className="portfolio-compose-label">Add holding</p>
                  <div className="portfolio-entry-fields portfolio-entry-fields--4">
                    <label>
                      Name
                      <input
                        required
                        placeholder={
                          activeInvestmentTab === "EPF/PPF/NPS" ? "EPF, PPF, or NPS" : activeInvestmentTab
                        }
                        value={transactionAssetForm.name}
                        onChange={(event) =>
                          setTransactionAssetForm({ ...transactionAssetForm, name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Amount
                      <input
                        required
                        min="0.01"
                        step="0.01"
                        type="number"
                        value={transactionAssetForm.amount}
                        onChange={(event) =>
                          setTransactionAssetForm({ ...transactionAssetForm, amount: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <button className="primary-action portfolio-entry-submit" disabled={savingTransactionAsset} type="submit">
                    {savingTransactionAsset && <Loader2 className="spin" size={16} />}
                    {savingTransactionAsset ? "Saving" : "Add investment"}
                  </button>
                </form>
              </div>

              <aside className="portfolio-compose-aside">
                <GoalAllocationPicker
                  goals={goalsByCompletion}
                  allocations={transactionAssetForm.goalAllocations}
                  onChange={(goalAllocations) => setTransactionAssetForm({ ...transactionAssetForm, goalAllocations })}
                />
              </aside>
            </div>
            <section className="dashboard-grid investment-summary-grid portfolio-summary-row" aria-label="Investment summary">
              <article>
                <p>Total invested</p>
                <strong>{formatCurrency(tabTotalAmount)}</strong>
              </article>
              <article>
                <p>Current value</p>
                <strong>{formatCurrency(tabTotalAmount)}</strong>
              </article>
              <article className="pnl-summary pnl-summary--flat">
                <p>Holdings</p>
                <strong>{investmentTransactions.length}</strong>
              </article>
            </section>
            <div className="table-wrapper">
              {investmentTransactions.length === 0 ? (
                <p>No {activeInvestmentTab} holdings yet.</p>
              ) : (
                <table className="portfolio-table portfolio-table--compact">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Amount</th>
                      <th>Goal</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investmentTransactions.map((transaction) => {
                      const transactionId = String(transaction.id);
                      const isEditing = editingTransactionAssetId === transactionId;
                      const amountValue = Math.abs(parseAmount(transaction.amount));
                      const goalId = transaction.goal_id != null ? String(transaction.goal_id) : "";
                      const goalName = goalId ? goalNameById[goalId] : null;
                      const holdingName = transaction.merchant || activeInvestmentTab;
                      return (
                        <tr key={transactionId} className="holding-row holding-row--flat">
                          <td title={holdingName} className="table-text-ellipsis">
                            {isEditing ? (
                              <input
                                className="table-edit-input"
                                required
                                value={transactionAssetEditForm.name}
                                onChange={(event) =>
                                  setTransactionAssetEditForm({
                                    ...transactionAssetEditForm,
                                    name: event.target.value
                                  })
                                }
                              />
                            ) : (
                              holdingName
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                className="table-edit-input"
                                required
                                min="0.01"
                                step="0.01"
                                type="number"
                                value={transactionAssetEditForm.amount}
                                onChange={(event) =>
                                  setTransactionAssetEditForm({
                                    ...transactionAssetEditForm,
                                    amount: event.target.value
                                  })
                                }
                              />
                            ) : (
                              formatCurrency(amountValue)
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <select
                                className="table-edit-input"
                                value={transactionAssetEditForm.goalId}
                                onChange={(event) =>
                                  setTransactionAssetEditForm({
                                    ...transactionAssetEditForm,
                                    goalId: event.target.value
                                  })
                                }
                              >
                                <option value="">No goal</option>
                                {goalsByCompletion.map((goal) => (
                                  <option key={goal.id} value={goal.id}>
                                    {goal.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              goalName ?? "-"
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <form className="holding-edit-actions" onSubmit={submitTransactionAssetEdit}>
                                <div className="inline-actions">
                                  <button
                                    className="subtle-action small-action"
                                    type="submit"
                                    disabled={savingTransactionAssetEdit}
                                  >
                                    {savingTransactionAssetEdit ? "Saving" : "Save"}
                                  </button>
                                  <button
                                    className="subtle-action small-action"
                                    type="button"
                                    disabled={savingTransactionAssetEdit}
                                    onClick={() => setEditingTransactionAssetId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <div className="inline-actions holding-row-actions">
                                <button
                                  className="subtle-action small-action icon-action"
                                  type="button"
                                  aria-label={`Edit ${holdingName}`}
                                  title="Edit"
                                  onClick={() => startEditTransactionAsset(transaction)}
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  className="subtle-action small-action icon-action danger-action"
                                  type="button"
                                  aria-label={`Delete ${holdingName}`}
                                  title="Delete"
                                  onClick={() =>
                                    requestDeleteHolding(transactionId, holdingName, "transaction_asset")
                                  }
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
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
    const totalInvestedInInr = isInternationalTab && usdInrRate !== null ? totalInvested * usdInrRate : null;
    const totalCurrentInInr = isInternationalTab && usdInrRate !== null ? totalCurrent * usdInrRate : null;
    const totalPnlInInr = isInternationalTab && usdInrRate !== null ? totalPnl * usdInrRate : null;
    const totalTone = pnlTone(totalPnl);
    const latestMutualFundNavDate = isMutualFundsTab ? latestNavDateFromSource : null;
    const todayIsoDate = new Date().toISOString().slice(0, 10);
    const isLatestNavFromToday = latestMutualFundNavDate === todayIsoDate;
    const latestNavStatusLabel = !latestMutualFundNavDate
      ? "NAV date unavailable."
      : isLatestNavFromToday
        ? "Updated today."
        : "Not updated today yet.";
    const selectedMfSipSiblingCount = selectedMutualFund
      ? mutualFundGoalSiblings(mutualFundPortfolio?.holdings ?? [], selectedMutualFund.scheme_code).length
      : 0;
    const selectedStockSipSiblingCount = stockForm.symbol.trim()
      ? symbolGoalSiblings(stockPortfolio?.holdings ?? [], stockForm.symbol).length
      : 0;
    const selectedInternationalSipSiblingCount = internationalForm.symbol.trim()
      ? symbolGoalSiblings(internationalPortfolio?.holdings ?? [], internationalForm.symbol).length
      : 0;
    const multiGoalSipHint =
      "This holding is already split across goals. Leave goals empty and the new SIP units will use the same split.";

    return (
      <div className="investment-section-shell">
        {categoryPills}
        <section className="workspace-panel">
        <div>
          <p className="eyebrow">Investment</p>
          <h2>{isMutualFundsTab ? "Mutual fund portfolio" : isStocksTab ? "Stock portfolio" : "International portfolio"}</h2>
          {isMutualFundsTab && (
            <p className="form-hint">
              Latest NAV available from AMFI source: {formatOptionalDate(latestMutualFundNavDate)}. {latestNavStatusLabel}
            </p>
          )}
        </div>

        {isMutualFundsTab && (
          <>
            <div className="portfolio-compose">
              <div className="portfolio-compose-primary">
                <div className="portfolio-compose-block">
                  <p className="portfolio-compose-label">Find a fund</p>
                  <form className="portfolio-search-form" onSubmit={searchMutualFunds}>
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

                  {mutualFundSearchResults.length > 0 && (
                    <div className="data-list investment-search-results">
                      {mutualFundSearchResults.slice(0, 8).map((result) => (
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
                      ))}
                    </div>
                  )}
                </div>

                <form className="portfolio-compose-block portfolio-entry-form" onSubmit={submitMutualFundInvestment}>
                  <p className="portfolio-compose-label">Add holding</p>
                  {selectedMutualFund ? (
                    <div className="selected-mf-block">
                      <strong>{selectedMutualFund.scheme_name}</strong>
                      <p>
                        Code: {selectedMutualFund.scheme_code}
                        {selectedMutualFund.fund_house ? ` | ${selectedMutualFund.fund_house}` : ""}
                      </p>
                      <p>
                        Latest NAV:{" "}
                        {selectedMutualFund.nav !== null ? formatCurrency(parseAmount(selectedMutualFund.nav)) : "N/A"}
                        {" | "}
                        Date: {formatOptionalDate(selectedMutualFund.date)}
                      </p>
                    </div>
                  ) : (
                    <p className="form-hint">Search and select a fund to enable this form.</p>
                  )}
                  <div className="portfolio-entry-fields">
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
                  </div>
                  <button
                    className="primary-action portfolio-entry-submit"
                    disabled={savingMutualFundInvestment || !selectedMutualFund}
                    type="submit"
                  >
                    {savingMutualFundInvestment && <Loader2 className="spin" size={16} />}
                    {savingMutualFundInvestment ? "Saving" : "Add investment"}
                  </button>
                </form>
              </div>

              <aside className="portfolio-compose-aside">
                <GoalAllocationPicker
                  goals={goalsByCompletion}
                  allocations={mutualFundForm.goalAllocations}
                  onChange={(goalAllocations) => setMutualFundForm({ ...mutualFundForm, goalAllocations })}
                  sipHint={
                    selectedMfSipSiblingCount > 1 && mutualFundForm.goalAllocations.length === 0
                      ? multiGoalSipHint
                      : null
                  }
                />
              </aside>
            </div>

            <section className="dashboard-grid investment-summary-grid portfolio-summary-row" aria-label="Investment summary">
              <article>
                <p>Total invested</p>
                <strong>{formatCurrency(totalInvested)}</strong>
              </article>
              <article>
                <p>Current value</p>
                <strong>{formatCurrency(totalCurrent)}</strong>
              </article>
              <article className={`pnl-summary pnl-summary--${totalTone}`}>
                <p>Total P/L</p>
                <strong className={pnlAmountClass(totalTone)}>
                  {formatSignedCurrency(totalPnl)} ({formatPnlPercent(totalPnlPercent)})
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
                      <th>Category</th>
                      <th>Scheme Name</th>
                      <th>NAV</th>
                      <th>NAV Date</th>
                      <th>Invested</th>
                      <th>Current</th>
                      <th>Abs. P&amp;L</th>
                      <th>Abs. P&amp;L %</th>
                      <th>Goal</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mutualFundPortfolio.holdings.map((holding) => {
                      const pnlValue = parseAmount(holding.pnl);
                      const pnlPercent = parseAmount(holding.pnl_percent);
                      const tone = pnlTone(pnlValue);
                      const isEditing = editingHoldingId === holding.id;
                      const linkedShares = linkedGoalShares(
                        mutualFundPortfolio.holdings
                          .filter(
                            (entry) => entry.scheme_code === holding.scheme_code && entry.goal_id != null
                          )
                          .map((entry) => ({
                            goal_id: entry.goal_id,
                            goal_name: entry.goal_name,
                            quantity: parseAmount(entry.units)
                          }))
                      );
                      const isMultiGoalLinked = linkedShares.length > 1;
                      const isMultiGoalEdit = isEditing && isMultiGoalLinked;
                      return (
                        <Fragment key={holding.id}>
                          <tr
                            className={`holding-row holding-row--${tone}${isMultiGoalEdit ? " holding-row--editing-linked" : ""}`}
                          >
                            <td>{holding.scheme_code}</td>
                            <td>
                              {isEditing ? (
                                <label className="table-edit-field">
                                  {isMultiGoalEdit ? <span className="table-edit-field-label">Total units</span> : null}
                                  <input
                                    className="table-edit-input"
                                    min="0.001"
                                    step="0.001"
                                    type="number"
                                    value={holdingEditForm.unitsOrQuantity}
                                    onChange={(event) =>
                                      setHoldingEditForm({ ...holdingEditForm, unitsOrQuantity: event.target.value })
                                    }
                                  />
                                </label>
                              ) : (
                                holding.units
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  className="table-edit-input"
                                  min="0.001"
                                  step="0.001"
                                  type="number"
                                  value={holdingEditForm.avgPrice}
                                  onChange={(event) => setHoldingEditForm({ ...holdingEditForm, avgPrice: event.target.value })}
                                />
                              ) : (
                                holding.avg_price
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <select
                                  className="table-edit-input"
                                  value={holdingEditForm.optionId}
                                  onChange={(event) => setHoldingEditForm({ ...holdingEditForm, optionId: event.target.value })}
                                >
                                  <option value="">No category</option>
                                  {investmentOptions.mutual_fund_categories.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.display_name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                holding.category_name ?? "-"
                              )}
                            </td>
                            <td title={holding.scheme_name} className="table-text-ellipsis">{holding.scheme_name}</td>
                            <td>{holding.nav ?? "-"}</td>
                            <td>{formatOptionalDate(holding.nav_date)}</td>
                            <td>{formatCurrency(parseAmount(holding.invested_amount))}</td>
                            <td>{formatCurrency(parseAmount(holding.current_value))}</td>
                            <td>
                              <span className={`pnl-chip pnl-chip--${tone}`}>{formatSignedCurrency(pnlValue)}</span>
                            </td>
                            <td>
                              <span className={`pnl-chip pnl-chip--${tone}`}>{formatPnlPercent(pnlPercent)}</span>
                            </td>
                            <td>
                              {isMultiGoalEdit ? (
                                <LinkedGoalsCell shares={linkedShares} />
                              ) : isEditing ? (
                                <select
                                  className="table-edit-input"
                                  value={holdingEditForm.goalId}
                                  onChange={(event) => setHoldingEditForm({ ...holdingEditForm, goalId: event.target.value })}
                                >
                                  <option value="">No goal</option>
                                  {goalsByCompletion.map((goal) => (
                                    <option key={goal.id} value={goal.id}>
                                      {goal.name}
                                    </option>
                                  ))}
                                </select>
                              ) : isMultiGoalLinked ? (
                                <span className="goal-shared-label" title={linkedShares.map((share) => share.goalName).join(", ")}>
                                  {holding.goal_name ?? "Goal"}
                                  <span className="goal-shared-badge">shared</span>
                                </span>
                              ) : (
                                holding.goal_name ?? "-"
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <form className="holding-edit-actions" onSubmit={submitHoldingEdit}>
                                  <div className="inline-actions">
                                    <button className="subtle-action small-action" type="submit" disabled={savingHoldingEdit}>
                                      {savingHoldingEdit ? "Saving" : "Save"}
                                    </button>
                                    <button className="subtle-action small-action" type="button" onClick={() => setEditingHoldingId(null)}>
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <div className="inline-actions holding-row-actions">
                                  <button
                                    className="subtle-action small-action icon-action"
                                    type="button"
                                    aria-label={`Edit ${holding.scheme_name}`}
                                    title="Edit"
                                    onClick={() =>
                                      startEditHolding(
                                        holding.id,
                                        holding.units,
                                        holding.avg_price,
                                        holding.category_option_id,
                                        holding.goal_id
                                      )
                                    }
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    className="subtle-action small-action icon-action danger-action"
                                    type="button"
                                    aria-label={`Delete ${holding.scheme_name}`}
                                    title="Delete"
                                    onClick={() =>
                                      requestDeleteHolding(holding.id, holding.scheme_name, "mutual_funds")
                                    }
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                          {isMultiGoalEdit ? (
                            <tr className="holding-edit-banner-row">
                              <td colSpan={13}>
                                Editing total units for this fund. On save, units are split across{" "}
                                {linkedShares.map((share) => share.goalName).join(", ")} using the current percentages.
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
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
            <div className="portfolio-compose">
              <div className="portfolio-compose-primary">
                <form className="portfolio-compose-block portfolio-entry-form" onSubmit={submitStockInvestment}>
                  <p className="portfolio-compose-label">Add holding</p>
                  <div className="portfolio-entry-fields portfolio-entry-fields--3">
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
                  </div>
                  <div className="portfolio-entry-fields portfolio-entry-fields--4">
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
                  </div>
                  <button className="primary-action portfolio-entry-submit" disabled={savingStockInvestment} type="submit">
                    {savingStockInvestment && <Loader2 className="spin" size={16} />}
                    {savingStockInvestment ? "Saving" : "Add stock"}
                  </button>
                </form>
              </div>

              <aside className="portfolio-compose-aside">
                <GoalAllocationPicker
                  goals={goalsByCompletion}
                  allocations={stockForm.goalAllocations}
                  onChange={(goalAllocations) => setStockForm({ ...stockForm, goalAllocations })}
                  sipHint={
                    selectedStockSipSiblingCount > 1 && stockForm.goalAllocations.length === 0
                      ? multiGoalSipHint
                      : null
                  }
                />
              </aside>
            </div>

            <section className="dashboard-grid investment-summary-grid portfolio-summary-row" aria-label="Investment summary">
              <article>
                <p>Total invested</p>
                <strong>{formatCurrency(totalInvested)}</strong>
              </article>
              <article>
                <p>Current value</p>
                <strong>{formatCurrency(totalCurrent)}</strong>
              </article>
              <article className={`pnl-summary pnl-summary--${totalTone}`}>
                <p>Total P/L</p>
                <strong className={pnlAmountClass(totalTone)}>
                  {formatSignedCurrency(totalPnl)} ({formatPnlPercent(totalPnlPercent)})
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
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockPortfolio.holdings.map((holding) => {
                      const pnlValue = parseAmount(holding.pnl);
                      const pnlPercent = parseAmount(holding.pnl_percent);
                      const tone = pnlTone(pnlValue);
                      const isEditing = editingHoldingId === holding.id;
                      const linkedShares = linkedGoalShares(
                        stockPortfolio.holdings
                          .filter(
                            (entry) =>
                              entry.symbol.trim().toUpperCase() === holding.symbol.trim().toUpperCase() &&
                              entry.goal_id != null
                          )
                          .map((entry) => ({
                            goal_id: entry.goal_id,
                            goal_name: entry.goal_name,
                            quantity: parseAmount(entry.quantity)
                          }))
                      );
                      const isMultiGoalLinked = linkedShares.length > 1;
                      const isMultiGoalEdit = isEditing && isMultiGoalLinked;
                      return (
                        <Fragment key={holding.id}>
                          <tr
                            className={`holding-row holding-row--${tone}${isMultiGoalEdit ? " holding-row--editing-linked" : ""}`}
                          >
                            <td>{holding.symbol}</td>
                            <td>
                              {isEditing ? (
                                <label className="table-edit-field">
                                  {isMultiGoalEdit ? <span className="table-edit-field-label">Total qty</span> : null}
                                  <input
                                    className="table-edit-input"
                                    min="0.001"
                                    step="0.001"
                                    type="number"
                                    value={holdingEditForm.unitsOrQuantity}
                                    onChange={(event) =>
                                      setHoldingEditForm({ ...holdingEditForm, unitsOrQuantity: event.target.value })
                                    }
                                  />
                                </label>
                              ) : (
                                holding.quantity
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  className="table-edit-input"
                                  min="0.001"
                                  step="0.001"
                                  type="number"
                                  value={holdingEditForm.avgPrice}
                                  onChange={(event) => setHoldingEditForm({ ...holdingEditForm, avgPrice: event.target.value })}
                                />
                              ) : (
                                holding.avg_price
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <select
                                  className="table-edit-input"
                                  value={holdingEditForm.optionId}
                                  onChange={(event) => setHoldingEditForm({ ...holdingEditForm, optionId: event.target.value })}
                                >
                                  <option value="">No sector</option>
                                  {investmentOptions.stock_sectors.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.display_name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                holding.sector_name ?? "-"
                              )}
                            </td>
                            <td title={holding.company_name ?? "Stock"} className="table-text-ellipsis">
                              {holding.company_name ?? "Stock"}
                            </td>
                            <td>{holding.current_price}</td>
                            <td>{formatCurrency(parseAmount(holding.invested_amount))}</td>
                            <td>{formatCurrency(parseAmount(holding.current_value))}</td>
                            <td>
                              <span className={`pnl-chip pnl-chip--${tone}`}>{formatSignedCurrency(pnlValue)}</span>
                            </td>
                            <td>
                              <span className={`pnl-chip pnl-chip--${tone}`}>{formatPnlPercent(pnlPercent)}</span>
                            </td>
                            <td>
                              {isMultiGoalEdit ? (
                                <LinkedGoalsCell shares={linkedShares} />
                              ) : isEditing ? (
                                <select
                                  className="table-edit-input"
                                  value={holdingEditForm.goalId}
                                  onChange={(event) => setHoldingEditForm({ ...holdingEditForm, goalId: event.target.value })}
                                >
                                  <option value="">No goal</option>
                                  {goalsByCompletion.map((goal) => (
                                    <option key={goal.id} value={goal.id}>
                                      {goal.name}
                                    </option>
                                  ))}
                                </select>
                              ) : isMultiGoalLinked ? (
                                <span className="goal-shared-label" title={linkedShares.map((share) => share.goalName).join(", ")}>
                                  {holding.goal_name ?? "Goal"}
                                  <span className="goal-shared-badge">shared</span>
                                </span>
                              ) : (
                                holding.goal_name ?? "-"
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <form className="holding-edit-actions" onSubmit={submitHoldingEdit}>
                                  <div className="inline-actions">
                                    <button className="subtle-action small-action" type="submit" disabled={savingHoldingEdit}>
                                      {savingHoldingEdit ? "Saving" : "Save"}
                                    </button>
                                    <button className="subtle-action small-action" type="button" onClick={() => setEditingHoldingId(null)}>
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <div className="inline-actions holding-row-actions">
                                  <button
                                    className="subtle-action small-action icon-action"
                                    type="button"
                                    aria-label={`Edit ${holding.company_name ?? holding.symbol}`}
                                    title="Edit"
                                    onClick={() =>
                                      startEditHolding(
                                        holding.id,
                                        holding.quantity,
                                        holding.avg_price,
                                        holding.sector_option_id,
                                        holding.goal_id
                                      )
                                    }
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    className="subtle-action small-action icon-action danger-action"
                                    type="button"
                                    aria-label={`Delete ${holding.company_name ?? holding.symbol}`}
                                    title="Delete"
                                    onClick={() =>
                                      requestDeleteHolding(
                                        holding.id,
                                        holding.company_name ?? holding.symbol,
                                        "stocks"
                                      )
                                    }
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                          {isMultiGoalEdit ? (
                            <tr className="holding-edit-banner-row">
                              <td colSpan={12}>
                                Editing total quantity for this stock. On save, quantity is split across{" "}
                                {linkedShares.map((share) => share.goalName).join(", ")} using the current percentages.
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
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
            <div className="portfolio-compose">
              <div className="portfolio-compose-primary">
                <form className="portfolio-compose-block portfolio-entry-form" onSubmit={submitInternationalInvestment}>
                  <p className="portfolio-compose-label">Add holding</p>
                  <div className="portfolio-entry-fields portfolio-entry-fields--3">
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
                  </div>
                  <div className="portfolio-entry-fields portfolio-entry-fields--4">
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
                        min="0.000001"
                        step="0.000001"
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
                  </div>
                  <button className="primary-action portfolio-entry-submit" disabled={savingInternationalInvestment} type="submit">
                    {savingInternationalInvestment && <Loader2 className="spin" size={16} />}
                    {savingInternationalInvestment ? "Saving" : "Add international"}
                  </button>
                </form>
                <p className="form-hint">
                  Note: International return % is an approximation. If you invest in INR, changing USD/INR exchange rates can
                  impact returns, so the percentage may not be fully accurate.
                </p>
              </div>

              <aside className="portfolio-compose-aside">
                <GoalAllocationPicker
                  goals={goalsByCompletion}
                  allocations={internationalForm.goalAllocations}
                  onChange={(goalAllocations) => setInternationalForm({ ...internationalForm, goalAllocations })}
                  sipHint={
                    selectedInternationalSipSiblingCount > 1 && internationalForm.goalAllocations.length === 0
                      ? multiGoalSipHint
                      : null
                  }
                />
              </aside>
            </div>

            <section className="dashboard-grid investment-summary-grid portfolio-summary-row" aria-label="Investment summary">
              <article>
                <p>Total invested (USD)</p>
                <strong>{formatUsdCurrency(totalInvested)}</strong>
              </article>
              <article>
                <p>Current value (USD)</p>
                <strong>{formatUsdCurrency(totalCurrent)}</strong>
              </article>
              <article className={`pnl-summary pnl-summary--${totalTone}`}>
                <p>Total P/L (USD)</p>
                <strong className={pnlAmountClass(totalTone)}>
                  {formatSignedUsdCurrency(totalPnl)} ({formatPnlPercent(totalPnlPercent)})
                </strong>
              </article>
              <article>
                <p>Total invested (INR)</p>
                <strong>{totalInvestedInInr === null ? "N/A" : formatCurrency(totalInvestedInInr)}</strong>
              </article>
              <article>
                <p>Current value (INR)</p>
                <strong>{totalCurrentInInr === null ? "N/A" : formatCurrency(totalCurrentInInr)}</strong>
              </article>
              <article className={`pnl-summary pnl-summary--${totalTone}`}>
                <p>Total P/L (INR)</p>
                <strong className={pnlAmountClass(totalTone)}>
                  {totalPnlInInr === null
                    ? "N/A"
                    : `${formatSignedCurrency(totalPnlInInr)} (${formatPnlPercent(totalPnlPercent)})`}
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
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {internationalPortfolio.holdings.map((holding) => {
                      const pnlValue = parseAmount(holding.pnl);
                      const pnlPercent = parseAmount(holding.pnl_percent);
                      const tone = pnlTone(pnlValue);
                      const isEditing = editingHoldingId === holding.id;
                      const linkedShares = linkedGoalShares(
                        internationalPortfolio.holdings
                          .filter(
                            (entry) =>
                              entry.symbol.trim().toUpperCase() === holding.symbol.trim().toUpperCase() &&
                              entry.goal_id != null
                          )
                          .map((entry) => ({
                            goal_id: entry.goal_id,
                            goal_name: entry.goal_name,
                            quantity: parseAmount(entry.quantity)
                          }))
                      );
                      const isMultiGoalLinked = linkedShares.length > 1;
                      const isMultiGoalEdit = isEditing && isMultiGoalLinked;
                      return (
                        <Fragment key={holding.id}>
                          <tr
                            className={`holding-row holding-row--${tone}${isMultiGoalEdit ? " holding-row--editing-linked" : ""}`}
                          >
                            <td>{holding.symbol}</td>
                            <td>
                              {isEditing ? (
                                <label className="table-edit-field">
                                  {isMultiGoalEdit ? <span className="table-edit-field-label">Total qty</span> : null}
                                  <input
                                    className="table-edit-input"
                                    min="0.000001"
                                    step="0.000001"
                                    type="number"
                                    value={holdingEditForm.unitsOrQuantity}
                                    onChange={(event) =>
                                      setHoldingEditForm({ ...holdingEditForm, unitsOrQuantity: event.target.value })
                                    }
                                  />
                                </label>
                              ) : (
                                holding.quantity
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  className="table-edit-input"
                                  min="0.001"
                                  step="0.001"
                                  type="number"
                                  value={holdingEditForm.avgPrice}
                                  onChange={(event) => setHoldingEditForm({ ...holdingEditForm, avgPrice: event.target.value })}
                                />
                              ) : (
                                formatUsdCurrency(parseAmount(holding.avg_price))
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <select
                                  className="table-edit-input"
                                  value={holdingEditForm.optionId}
                                  onChange={(event) => setHoldingEditForm({ ...holdingEditForm, optionId: event.target.value })}
                                >
                                  <option value="">No sector</option>
                                  {investmentOptions.international_sectors.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.display_name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                holding.sector_name ?? "-"
                              )}
                            </td>
                            <td title={holding.security_name ?? holding.symbol} className="table-text-ellipsis">
                              {holding.security_name ?? holding.symbol}
                            </td>
                            <td>{formatUsdCurrency(parseAmount(holding.current_price))}</td>
                            <td>{formatUsdCurrency(parseAmount(holding.invested_amount))}</td>
                            <td>{formatUsdCurrency(parseAmount(holding.current_value))}</td>
                            <td>
                              <span className={`pnl-chip pnl-chip--${tone}`}>{formatSignedUsdCurrency(pnlValue)}</span>
                            </td>
                            <td>
                              <span className={`pnl-chip pnl-chip--${tone}`}>{formatPnlPercent(pnlPercent)}</span>
                            </td>
                            <td>
                              {isMultiGoalEdit ? (
                                <LinkedGoalsCell shares={linkedShares} />
                              ) : isEditing ? (
                                <select
                                  className="table-edit-input"
                                  value={holdingEditForm.goalId}
                                  onChange={(event) => setHoldingEditForm({ ...holdingEditForm, goalId: event.target.value })}
                                >
                                  <option value="">No goal</option>
                                  {goalsByCompletion.map((goal) => (
                                    <option key={goal.id} value={goal.id}>
                                      {goal.name}
                                    </option>
                                  ))}
                                </select>
                              ) : isMultiGoalLinked ? (
                                <span className="goal-shared-label" title={linkedShares.map((share) => share.goalName).join(", ")}>
                                  {holding.goal_name ?? "Goal"}
                                  <span className="goal-shared-badge">shared</span>
                                </span>
                              ) : (
                                holding.goal_name ?? "-"
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <form className="holding-edit-actions" onSubmit={submitHoldingEdit}>
                                  <div className="inline-actions">
                                    <button className="subtle-action small-action" type="submit" disabled={savingHoldingEdit}>
                                      {savingHoldingEdit ? "Saving" : "Save"}
                                    </button>
                                    <button className="subtle-action small-action" type="button" onClick={() => setEditingHoldingId(null)}>
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <div className="inline-actions holding-row-actions">
                                  <button
                                    className="subtle-action small-action icon-action"
                                    type="button"
                                    aria-label={`Edit ${holding.security_name ?? holding.symbol}`}
                                    title="Edit"
                                    onClick={() =>
                                      startEditHolding(
                                        holding.id,
                                        holding.quantity,
                                        holding.avg_price,
                                        holding.sector_option_id,
                                        holding.goal_id
                                      )
                                    }
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    className="subtle-action small-action icon-action danger-action"
                                    type="button"
                                    aria-label={`Delete ${holding.security_name ?? holding.symbol}`}
                                    title="Delete"
                                    onClick={() =>
                                      requestDeleteHolding(
                                        holding.id,
                                        holding.security_name ?? holding.symbol,
                                        "international"
                                      )
                                    }
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                          {isMultiGoalEdit ? (
                            <tr className="holding-edit-banner-row">
                              <td colSpan={12}>
                                Editing total quantity for this holding. On save, quantity is split across{" "}
                                {linkedShares.map((share) => share.goalName).join(", ")} using the current percentages.
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </section>
    </div>
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
            <strong>{ledgerTransactionCount}</strong>
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
  const showRightRail = activeSection === "Dashboard";

  return (
    <main
      className={`dashboard-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${showRightRail ? "" : "no-right-rail"}`}
    >
      <aside
        className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}
        aria-label="Sidebar"
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        <div className="sidebar-brand">
          <div className="sidebar-mark" aria-hidden="true">
            <WalletCards size={16} />
          </div>
          <div className="sidebar-brand-copy">
            <strong>Ledgr</strong>
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
            <button className="subtle-action icon-action" type="button" aria-label="Refresh data" title="Refresh data" onClick={() => void loadWorkspace()}>
              <RefreshCw size={16} />
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
        {holdingPendingDelete !== null && (
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => {
              if (!deletingHolding) {
                setHoldingPendingDelete(null);
              }
            }}
          >
            <div
              className="transaction-modal confirm-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Confirm delete holding"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2>Delete holding</h2>
                <button
                  className="subtle-action icon-action"
                  type="button"
                  aria-label="Close delete confirmation"
                  disabled={deletingHolding}
                  onClick={() => setHoldingPendingDelete(null)}
                >
                  <X size={14} />
                </button>
              </div>
              <p className="confirm-modal-copy">
                Delete <strong>{holdingPendingDelete.label}</strong>? This cannot be undone.
              </p>
              <div className="inline-actions confirm-modal-actions">
                <button
                  className="subtle-action"
                  type="button"
                  disabled={deletingHolding}
                  onClick={() => setHoldingPendingDelete(null)}
                >
                  Cancel
                </button>
                <button
                  className="primary-action danger-primary-action"
                  type="button"
                  disabled={deletingHolding}
                  onClick={() => void confirmDeleteHolding()}
                >
                  {deletingHolding && <Loader2 className="spin" size={16} />}
                  {deletingHolding ? "Deleting" : "Delete"}
                </button>
              </div>
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
      {showRightRail && (
        <aside className="right-rail" aria-label="Account overview">
          <div className="rail-header">
            <time className="rail-clock" dateTime={new Date().toISOString()}>
              {clockLabel}
            </time>
            <button className="rail-icon-btn" type="button" aria-label="Notifications">
              <Bell size={18} />
              <span className="notif-dot" />
            </button>
            <button className="avatar-btn" type="button" aria-label="Open profile" onClick={() => onSelectSection("Profile")}>
              {initials}
            </button>
          </div>

          <div className="rail-stack-card">
            <section className="rail-section">
              <div className="rail-section-header">
                <h3>Accounts</h3>
                <button className="rail-link" type="button" onClick={() => onSelectSection("Accounts")}>
                  see all
                </button>
              </div>
              <div className="account-balance-list">
                {accounts.length === 0 ? (
                  <div className="panel-empty compact">
                    <strong>No accounts yet</strong>
                    <p>Add a wallet or bank account to get started.</p>
                  </div>
                ) : (
                  accounts.slice(0, 3).map((account) => (
                    <button
                      key={account.id}
                      className="account-balance-row"
                      type="button"
                      onClick={() => onSelectSection("Accounts")}
                    >
                      <div>
                        <strong>{account.name}</strong>
                        <p>{account.account_type}</p>
                      </div>
                      <span>{formatCurrency(parseAmount(account.current_balance))}</span>
                    </button>
                  ))
                )}
                <button className="account-balance-row add" type="button" onClick={() => onSelectSection("Accounts")}>
                  <span>Add account</span>
                  <Plus size={16} />
                </button>
              </div>
            </section>

            <section className="rail-section">
              <div className="rail-section-header">
                <h3>Goal Overview</h3>
                <button className="rail-link" type="button" onClick={() => onSelectSection("Goal")}>
                  see all
                </button>
              </div>
              <div className="budget-overview-list">
                {goalsByCompletion.length === 0 ? (
                  <div className="panel-empty compact">
                    <strong>No goals yet</strong>
                    <p>Set a goal to track progress.</p>
                  </div>
                ) : (
                  goalsByCompletion.slice(0, 4).map((goal) => {
                    const target = parseAmount(goal.target_amount);
                    const current = goalCurrentAmountById.get(goal.id) ?? parseAmount(goal.current_amount);
                    const progress = Math.round(goalCompletionPercent(goal, current));
                    return (
                      <button
                        key={goal.id}
                        className="budget-overview-row"
                        type="button"
                        onClick={() => onSelectSection("Goal")}
                      >
                        <div className="budget-overview-copy">
                          <strong>{goal.name}</strong>
                          <p>
                            {formatCurrency(current)} of {formatCurrency(target)}
                          </p>
                        </div>
                        <div
                          className="budget-overview-track"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={progress}
                          aria-label={`${goal.name} ${progress}% complete`}
                        >
                          <span className="budget-overview-fill" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="budget-overview-percent">{progress}%</span>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </aside>
      )}
    </main>
  );
}

export default App;
