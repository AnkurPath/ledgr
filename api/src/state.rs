use crate::models::expense::Expense;
use sqlx::PgPool;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    expenses: Arc<Mutex<HashMap<u64, Expense>>>,
    next_id: Arc<AtomicU64>,
}

impl AppState {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            expenses: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(AtomicU64::new(1)),
        }
    }

    pub fn next_expense_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }

    pub fn expenses_lock(&self) -> std::sync::MutexGuard<'_, HashMap<u64, Expense>> {
        self.expenses.lock().expect("expenses mutex poisoned")
    }
}
