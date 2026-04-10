from __future__ import annotations

import os
import sqlite3
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, session, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "users.db"

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY", "change-this-secret-in-production")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def clean_email(raw_email: str) -> str:
    return raw_email.strip().lower()


@app.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}
    full_name = str(data.get("full_name", "")).strip()
    email = clean_email(str(data.get("email", "")))
    password = str(data.get("password", ""))

    if len(full_name) < 2:
        return jsonify({"message": "Full name must be at least 2 characters."}), 400

    if "@" not in email or "." not in email:
        return jsonify({"message": "Please provide a valid email address."}), 400

    if len(password) < 6:
        return jsonify({"message": "Password must be at least 6 characters."}), 400

    password_hash = generate_password_hash(password)

    try:
        conn = get_connection()
        conn.execute(
            "INSERT INTO users (full_name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (full_name, email, password_hash, datetime.utcnow().isoformat()),
        )
        conn.commit()
        conn.close()
    except sqlite3.IntegrityError:
        return jsonify({"message": "Email is already registered."}), 409

    return jsonify({"message": "Registration successful."}), 201


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    email = clean_email(str(data.get("email", "")))
    password = str(data.get("password", ""))

    conn = get_connection()
    row = conn.execute(
        "SELECT id, full_name, email, password_hash FROM users WHERE email = ?",
        (email,),
    ).fetchone()
    conn.close()

    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"message": "Invalid email or password."}), 401

    session["user_id"] = row["id"]
    session["full_name"] = row["full_name"]
    session["email"] = row["email"]

    return jsonify(
        {
            "message": "Login successful.",
            "user": {
                "id": row["id"],
                "full_name": row["full_name"],
                "email": row["email"],
            },
        }
    )


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
