from __future__ import annotations

import os
import sqlite3
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, session, send_from_directory
import joblib
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "users.db"
MODEL_PATH = BASE_DIR / "models" / "model.joblib"

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY", "change-this-secret-in-production")

_MODEL = None


def get_model():
    global _MODEL
    if _MODEL is not None:
        return _MODEL
    if not MODEL_PATH.exists():
        return None
    _MODEL = joblib.load(MODEL_PATH)
    return _MODEL


def keyword_subcategory(text: str) -> str:
    lower_text = text.lower()
    rescue_keywords = [
        "trapped",
        "rescue",
        "help",
        "stuck",
        "stranded",
        "need help",
        "emergency",
        "urgent",
        "dying",
        "drowning",
        "flood",
    ]
    damage_keywords = [
        "damage",
        "destroyed",
        "collapsed",
        "broken",
        "infrastructure",
        "building",
        "bridge",
        "road",
    ]
    safety_keywords = [
        "evacuation",
        "shelter",
        "relief",
        "camp",
        "safety",
        "safe zone",
        "emergency services",
        "hospital",
    ]

    rescue = sum(1 for k in rescue_keywords if k in lower_text)
    damage = sum(1 for k in damage_keywords if k in lower_text)
    safety = sum(1 for k in safety_keywords if k in lower_text)

    if rescue >= damage and rescue >= safety and rescue > 0:
        return "Rescue Request"
    if damage >= safety and damage > 0:
        return "Damage Report"
    if safety > 0:
        return "Safety Update"
    return "General Information"


def category_payload(category: str, confidence: float):
    confidence_pct = max(0.0, min(99.0, confidence * 100.0))
    if category == "Rescue Request":
        return {
            "category": category,
            "categoryEmoji": "🔴",
            "categoryBadgeClass": "badge-red",
            "bannerTitle": "URGENT RESCUE REQUEST DETECTED",
            "bannerMessage": "This tweet requires immediate attention from emergency responders.",
            "bannerClass": "banner-red",
            "description": "Someone needs immediate help.",
            "confidence": round(confidence_pct, 1),
        }
    if category == "Damage Report":
        return {
            "category": category,
            "categoryEmoji": "🟡",
            "categoryBadgeClass": "badge-yellow",
            "bannerTitle": "DAMAGE REPORT DETECTED",
            "bannerMessage": "Infrastructure or property damage has been reported.",
            "bannerClass": "banner-yellow",
            "description": "Infrastructure/property damage info.",
            "confidence": round(confidence_pct, 1),
        }
    if category == "Safety Update":
        return {
            "category": category,
            "categoryEmoji": "🟢",
            "categoryBadgeClass": "badge-green",
            "bannerTitle": "SAFETY UPDATE RECEIVED",
            "bannerMessage": "Evacuation notices and relief distribution information.",
            "bannerClass": "banner-green",
            "description": "Evacuation notices, relief distribution.",
            "confidence": round(confidence_pct, 1),
        }
    return {
        "category": "General Information",
        "categoryEmoji": "⚪",
        "categoryBadgeClass": "badge-gray",
        "bannerTitle": "INFORMATION RECEIVED",
        "bannerMessage": "This is general information that may be useful for reference.",
        "bannerClass": "banner-gray",
        "description": "Non-urgent news and updates.",
        "confidence": round(confidence_pct, 1),
    }


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=5, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def init_db() -> None:
    conn = get_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            organization TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    # Lightweight migration for existing DBs created before `organization` existed.
    cols = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(users)").fetchall()
        if row and "name" in row.keys()
    }
    if "organization" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN organization TEXT NOT NULL DEFAULT ''")
    conn.commit()
    conn.close()


def clean_email(raw_email: str) -> str:
    return raw_email.strip().lower()


@app.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}
    full_name = str(data.get("full_name", "")).strip()
    email = clean_email(str(data.get("email", "")))
    organization = str(data.get("organization", "")).strip()
    password = str(data.get("password", ""))

    if len(full_name) < 2:
        return jsonify({"message": "Full name must be at least 2 characters."}), 400

    if "@" not in email or "." not in email:
        return jsonify({"message": "Please provide a valid email address."}), 400

    if len(password) < 6:
        return jsonify({"message": "Password must be at least 6 characters."}), 400

    if len(organization) < 2:
        return jsonify({"message": "Organization / agency is required."}), 400

    password_hash = generate_password_hash(password)

    conn = None
    try:
        conn = get_connection()
        conn.execute(
            "INSERT INTO users (full_name, email, organization, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
            (full_name, email, organization, password_hash, datetime.utcnow().isoformat()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"message": "Email is already registered."}), 409
    finally:
        if conn is not None:
            conn.close()

    return jsonify({"message": "Registration successful."}), 201


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    email = clean_email(str(data.get("email", "")))
    password = str(data.get("password", ""))

    conn = get_connection()
    row = conn.execute(
        "SELECT id, full_name, email, organization, password_hash FROM users WHERE email = ?",
        (email,),
    ).fetchone()
    conn.close()

    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"message": "Invalid email or password."}), 401

    session["user_id"] = row["id"]
    session["full_name"] = row["full_name"]
    session["email"] = row["email"]
    session["organization"] = row["organization"]

    return jsonify(
        {
            "message": "Login successful.",
            "user": {
                "id": row["id"],
                "full_name": row["full_name"],
                "email": row["email"],
                "organization": row["organization"],
            },
        }
    )

@app.post("/api/classify")
def classify():
    if "user_id" not in session:
        return jsonify({"message": "Authentication required."}), 401

    data = request.get_json(silent=True) or {}
    text = str(data.get("text", "")).strip()
    if len(text) < 1:
        return jsonify({"message": "Text is required."}), 400

    model = get_model()
    if model is None:
        return (
            jsonify(
                {
                    "message": "Model not trained yet. Run scripts/train_model.py first.",
                    "code": "MODEL_MISSING",
                }
            ),
            409,
        )

    # Binary ML score: P(disaster)
    try:
        proba = float(model.predict_proba([text])[0][1])
    except Exception:
        # Fallback: some sklearn pipelines don't expose predict_proba
        pred = int(model.predict([text])[0])
        proba = 0.85 if pred == 1 else 0.15

    if proba < 0.5:
        category = "General Information"
        confidence = 1.0 - proba
    else:
        category = keyword_subcategory(text)
        confidence = proba

    return jsonify(category_payload(category, confidence))


@app.get("/api/me")
def me():
    if "user_id" not in session:
        return jsonify({"logged_in": False})

    return jsonify(
        {
            "logged_in": True,
            "user": {
                "id": session.get("user_id"),
                "full_name": session.get("full_name"),
                "email": session.get("email"),
                "organization": session.get("organization"),
            },
        }
    )


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"message": "Logged out."})


@app.get("/")
def root_page():
    if "user_id" in session:
        return send_from_directory(BASE_DIR, "index.html")
    return send_from_directory(BASE_DIR, "auth.html")


@app.get("/<path:filename>")
def static_files(filename: str):
    return send_from_directory(BASE_DIR, filename)


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
