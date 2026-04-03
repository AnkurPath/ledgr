use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Expense {
    pub id: u64,
    pub description: String,
    pub amount: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AddExpenseRequest {
    pub description: String,
    pub amount: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateExpenseRequest {
    pub description: Option<String>,
    pub amount: Option<f64>,
}

