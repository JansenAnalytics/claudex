//! Localhost-only HTTP API the Python bridge drives. Endpoints and JSON shapes
//! match scripts/matrix-bridge.py and the contract in ../README.md.
//!
//!   GET  /health   (no auth)  → {ready,synced,crossSigningReady,deviceId}
//!   GET  /events   (bearer)   → SSE; one `data:` InboundMsg per decrypted message
//!   POST /send     (bearer)   → {room_id,body,formatted_body} → {event_id}
//!
//! `/events` and `/send` carry decrypted plaintext, so they require the bearer
//! token (MATRIX_SIDECAR_TOKEN). The server binds 127.0.0.1 only (see matrix.rs).

use std::convert::Infallible;
use std::time::Duration;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::sse::{Event, KeepAlive, Sse},
    routing::{get, post},
    Json, Router,
};
use futures_util::stream::Stream;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio_stream::{wrappers::BroadcastStream, StreamExt};

use crate::matrix::{send_text, AppState};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/events", get(events))
        .route("/send", post(send))
        .with_state(state)
}

/// Compare the Authorization header to the configured bearer token.
fn authorized(headers: &HeaderMap, token: &str) -> bool {
    let got = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    bearer_matches(got, token)
}

/// Whether an `Authorization` header value is exactly `Bearer <token>`.
/// Uses a constant-time content comparison so the localhost token cannot be
/// recovered via a timing oracle.
fn bearer_matches(header_value: Option<&str>, token: &str) -> bool {
    match header_value {
        Some(v) => ct_eq(v.as_bytes(), format!("Bearer {token}").as_bytes()),
        None => false,
    }
}

/// Constant-time byte comparison. Returns early only on length (not secret
/// here); never short-circuits on content, avoiding a timing leak on the token.
fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

async fn health(State(st): State<AppState>) -> Json<Value> {
    let device_id = st
        .client
        .device_id()
        .map(|d| d.to_string())
        .unwrap_or_default();
    let synced = st.client.is_active(); // logged in and not soft-logged-out
    let cross = match st.client.encryption().cross_signing_status().await {
        Some(s) => s.is_complete(),
        None => false,
    };
    Json(json!({
        "ready": synced && cross,
        "synced": synced,
        "crossSigningReady": cross,
        "deviceId": device_id,
    }))
}

async fn events(
    State(st): State<AppState>,
    headers: HeaderMap,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, StatusCode> {
    if !authorized(&headers, &st.token) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let rx = st.tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|res| match res {
        Ok(msg) => Some(Ok(Event::default().data(serde_json::to_string(&msg).ok()?))),
        Err(_) => None, // receiver lagged → skip dropped items
    });
    Ok(Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(20))))
}

#[derive(Deserialize)]
struct SendReq {
    room_id: String,
    body: String,
    #[serde(default)]
    #[allow(dead_code)] // reserved: HTML formatting is a v2 enhancement
    formatted_body: Option<String>,
}

async fn send(
    State(st): State<AppState>,
    headers: HeaderMap,
    payload: Result<Json<SendReq>, axum::extract::rejection::JsonRejection>,
) -> (StatusCode, Json<Value>) {
    if !authorized(&headers, &st.token) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "unauthorized"})),
        );
    }
    let req = match payload {
        Ok(Json(r)) => r,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({"error": "bad json"}))),
    };
    match send_text(&st.client, &st.trusted_user_keys, &req.room_id, &req.body).await {
        Ok(event_id) => (StatusCode::OK, Json(json!({ "event_id": event_id }))),
        // Permanent (e.g. non-encrypted room) and transient failures both surface
        // as non-2xx; the bridge leaves an inbox backlog so the watchdog notices.
        // Use the alternate formatter so the FULL anyhow cause chain is reported
        // (e.g. "room.send: ... CrossSigningNotSetup") instead of just the top context.
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("{e:#}") })),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bearer_matches_exact_token_only() {
        assert!(bearer_matches(Some("Bearer s3cret"), "s3cret"));
        assert!(!bearer_matches(Some("Bearer s3cre"), "s3cret")); // wrong token
        assert!(!bearer_matches(Some("Bearer s3cretx"), "s3cret")); // extra char
        assert!(!bearer_matches(Some("bearer s3cret"), "s3cret")); // scheme is case-sensitive
        assert!(!bearer_matches(Some("s3cret"), "s3cret")); // missing scheme
        assert!(!bearer_matches(None, "s3cret")); // no header
    }

    #[test]
    fn ct_eq_basics() {
        assert!(ct_eq(b"abc", b"abc"));
        assert!(ct_eq(b"", b""));
        assert!(!ct_eq(b"abc", b"abd"));
        assert!(!ct_eq(b"abc", b"ab")); // length mismatch
    }

    #[test]
    fn send_req_deserializes_with_optional_formatted_body() {
        let r: SendReq =
            serde_json::from_str(r#"{"room_id":"!r:s","body":"hi","formatted_body":null}"#)
                .unwrap();
        assert_eq!(r.room_id, "!r:s");
        assert_eq!(r.body, "hi");
        // The bridge may omit formatted_body entirely — must still parse.
        let r2: SendReq = serde_json::from_str(r#"{"room_id":"!r:s","body":"hi"}"#).unwrap();
        assert_eq!(r2.body, "hi");
    }
}
