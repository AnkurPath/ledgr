use crate::{
    models::expense::{AddExpenseRequest, Expense, UpdateExpenseRequest},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
        // Collection
        .route("/expenses", post(create_expense).get(list_expenses))
        // Item
        .route(
            "/expenses/{id}",
            get(get_expense).patch(patch_expense).put(put_expense).delete(delete_expense),
        )
}

async fn create_expense(
    State(state): State<AppState>,
    Json(req): Json<AddExpenseRequest>,
) -> impl IntoResponse {
    if !req.amount.is_finite() {
        return (StatusCode::BAD_REQUEST, "amount must be a finite number").into_response();
    }

    let id = state.next_expense_id();
    let expense = Expense {
        id,
        description: req.description,
        amount: req.amount,
    };

    let mut map = state.expenses_lock();
    map.insert(id, expense.clone());

    (StatusCode::CREATED, Json(expense)).into_response()
}

async fn list_expenses(State(state): State<AppState>) -> impl IntoResponse {
    let map = state.expenses_lock();
    let mut expenses: Vec<Expense> = map.values().cloned().collect();
    expenses.sort_by_key(|e| e.id);
    Json(expenses)
}

async fn get_expense(
    State(state): State<AppState>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    let map = state.expenses_lock();
    match map.get(&id).cloned() {
        Some(expense) => (StatusCode::OK, Json(expense)).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn delete_expense(
    State(state): State<AppState>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    let mut map = state.expenses_lock();
    match map.remove(&id) {
        Some(_) => StatusCode::NO_CONTENT.into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn patch_expense(
    State(state): State<AppState>,
    Path(id): Path<u64>,
    Json(req): Json<UpdateExpenseRequest>,
) -> impl IntoResponse {
    if matches!(req.amount, Some(a) if !a.is_finite()) {
        return (StatusCode::BAD_REQUEST, "amount must be a finite number").into_response();
    }

    let mut map = state.expenses_lock();
    let Some(existing) = map.get_mut(&id) else {
        return StatusCode::NOT_FOUND.into_response();
    };

    if let Some(description) = req.description {
        existing.description = description;
    }
    if let Some(amount) = req.amount {
        existing.amount = amount;
    }

    (StatusCode::OK, Json(existing.clone())).into_response()
}

async fn put_expense(
    State(state): State<AppState>,
    Path(id): Path<u64>,
    Json(req): Json<AddExpenseRequest>,
) -> impl IntoResponse {
    if !req.amount.is_finite() {
        return (StatusCode::BAD_REQUEST, "amount must be a finite number").into_response();
    }

    let mut map = state.expenses_lock();
    let Some(existing) = map.get_mut(&id) else {
        return StatusCode::NOT_FOUND.into_response();
    };

    existing.description = req.description;
    existing.amount = req.amount;

    (StatusCode::OK, Json(existing.clone())).into_response()
}

