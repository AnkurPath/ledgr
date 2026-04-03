use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use ledgr::{config::Config, routes, state::AppState};
use sqlx::postgres::PgPoolOptions;
use std::env;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    // Load env vars from `.env` for local development.
    //
    // `cargo run -p ledgr` typically runs with the repo root as the CWD,
    // while the API crate lives in `api/`. This loads from either location.
    dotenvy::dotenv().ok();
    let repo_root_env =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.env");
    dotenvy::from_filename(repo_root_env).ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            // Keep the default noise low; override with RUST_LOG=debug,info,...
            "ledgr=info,tower_http=debug".into()
        }))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env().unwrap_or_else(|err| panic!("config error: {err}"));

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await
        .unwrap_or_else(|e| panic!("database connection failed: {e}"));

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .unwrap_or_else(|e| panic!("database migrations failed: {e}"));

    tracing::info!("connected to Postgres and migrations applied");

    let state = AppState::new(pool);

    let app = Router::new()
        .route("/health", get(health))
        .merge(routes::expenses::router())
        .with_state(state)
        .layer(TraceLayer::new_for_http());

    let bind_addr = env::var("LEDGR_API_BIND").unwrap_or_else(|_| "127.0.0.1:3001".to_string());    
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .unwrap_or_else(|_| panic!("bind {bind_addr}"));
    tracing::info!("API listening on {}", listener.local_addr().unwrap());

    axum::serve(listener, app).await.expect("server failed");
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    match sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await
    {
        Ok(_) => StatusCode::OK.into_response(),
        Err(e) => {
            tracing::error!(error = %e, "health check: database ping failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

