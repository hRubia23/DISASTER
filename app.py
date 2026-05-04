from __future__ import annotations

import csv
import io
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, request, session, send_from_directory
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import joblib
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
# Make scripts/ importable so joblib can unpickle TextPreprocessor
sys.path.insert(0, str(BASE_DIR))
from scripts.preprocessors import TextPreprocessor, FeatureEngineer, passthrough_text  # noqa: F401

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

    # Strong rescue: person is actively in immediate danger
    strong_rescue_keywords = [
        "trapped", "stuck", "stranded", "dying", "drowning",
        "naiipit", "naipit", "nakulong", "nalulunod",
        "nalubog", "napit", "matay", "lungsuran",
        "atrapa", "naatrapa", "naatrapado",
        "need help", "urgent rescue", "send rescue",
    ]
    # Weak rescue: generic "help" words that could accompany any category
    weak_rescue_keywords = [
        "rescue", "help", "emergency", "urgent", "sagip", "saklolo",
        "tulong", "tabang", "tabangi", "socorro", "ayuda",
        "pagtabang", "nasakitan", "tawhid tabang",
        "flood", "baha", "bahain",
    ]
    rescue_keywords = strong_rescue_keywords + weak_rescue_keywords
    damage_keywords = [
        "damage", "destroyed", "collapsed", "broken", "infrastructure",
        "building", "bridge", "road",
        "nasira", "sirang", "giba", "guho", "guhoan",
        "nasunog", "sunog", "kalsada", "tulay",
        "guba", "gibung", "daot", "naguba",
        "calle", "puente", "edificio",
        # Tausug
        "natumba", "nalaglag", "bangag", "lupak", "nasugad", "nauba",
    ]
    safety_keywords = [
        "evacuation", "evacuate", "evacuated", "shelter", "relief",
        "camp", "safety", "safe zone", "emergency services", "hospital",
        "lumikas", "paglikas",
        "evac center", "evacuation center", "evacuation camp",
        "evacuation site", "relief goods", "relief operations",
        "relief center", "relief camp", "evacuation area", "evac",
        "evacuacion", "albergue", "centro de evacuacion",
        "centro de refugio", "clinica",
        "balay tabang", "balay kaluwasan", "kaluwasan",
        # Tausug
        "pagluwas", "lumaas", "sentro", "higad",
        "lugar kaluwasan", "tabang lugal",
    ]

    strong_rescue = sum(1 for k in strong_rescue_keywords if k in lower_text)
    rescue = sum(1 for k in rescue_keywords if k in lower_text)
    damage = sum(1 for k in damage_keywords if k in lower_text)
    safety = sum(1 for k in safety_keywords if k in lower_text)

    # Only override to Rescue Request if there's a strong rescue signal,
    # or if rescue clearly dominates with no competing damage signal
    if strong_rescue > 0 and strong_rescue >= damage:
        return "Rescue Request"
    if damage > 0 and damage >= (rescue - strong_rescue):
        # Damage matches outweigh weak-only rescue matches
        if damage >= safety:
            return "Damage Report"
    if rescue > damage and rescue >= safety and rescue > 0:
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
            role TEXT NOT NULL DEFAULT 'viewer',
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS classifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            tweet TEXT NOT NULL,
            category TEXT NOT NULL,
            confidence REAL NOT NULL,
            model_used TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS flags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            classification_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            reason TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(classification_id) REFERENCES classifications(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            classification_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(classification_id, user_id),
            FOREIGN KEY(classification_id) REFERENCES classifications(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS reposts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            classification_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(classification_id, user_id),
            FOREIGN KEY(classification_id) REFERENCES classifications(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS replies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            classification_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            reply_text TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(classification_id) REFERENCES classifications(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    # Lightweight migrations for existing DBs.
    cols = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(users)").fetchall()
        if row and "name" in row.keys()
    }
    if "organization" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN organization TEXT NOT NULL DEFAULT ''")
    if "role" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer'")
    conn.commit()
    conn.close()


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    role = "viewer"
    admin_emails = {
        email.strip().lower()
        for email in os.environ.get("ADMIN_EMAILS", "").split(",")
        if email.strip()
    }
    if email in admin_emails:
        role = "admin"

    conn = None
    try:
        conn = get_connection()
        conn.execute(
            "INSERT INTO users (full_name, email, organization, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (full_name, email, organization, password_hash, role, now_utc_iso()),
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
        "SELECT id, full_name, email, organization, role, password_hash FROM users WHERE email = ?",
        (email,),
    ).fetchone()
    conn.close()

    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"message": "Invalid email or password."}), 401

    session["user_id"] = row["id"]
    session["full_name"] = row["full_name"]
    session["email"] = row["email"]
    session["organization"] = row["organization"]
    session["role"] = row["role"]

    return jsonify(
        {
            "message": "Login successful.",
            "user": {
                "id": row["id"],
                "full_name": row["full_name"],
                "email": row["email"],
                "organization": row["organization"],
                "role": row["role"],
            },
        }
    )


_LABEL_MAP = {
    "rescue_volunteering_or_donation_effort": "Rescue Request",
    "requests_or_urgent_needs": "Rescue Request",
    "injured_or_dead_people": "Rescue Request",
    "missing_or_found_people": "Rescue Request",
    "infrastructure_and_utility_damage": "Damage Report",
    "displaced_people_and_evacuations": "Safety Update",
    "caution_and_advice": "Safety Update",
    "sympathy_and_support": "General Information",
    "other_relevant_information": "General Information",
    "not_humanitarian": "General Information",
    # already-mapped labels (heuristic path)
    "Rescue Request": "Rescue Request",
    "Damage Report": "Damage Report",
    "Safety Update": "Safety Update",
    "General Information": "General Information",
}


def classify_text(text: str):
    model = get_model()
    model_used = "heuristic"
    if model is None:
        category = keyword_subcategory(text)
        confidence = 0.72
        return category, confidence, model_used

    model_used = "ml"
    try:
        proba = model.predict_proba([text])[0]
        best_idx = int(proba.argmax())
        confidence = float(proba[best_idx])
        raw_category = str(model.classes_[best_idx])
    except Exception:
        raw_category = str(model.predict([text])[0])
        confidence = 0.85
    category = _LABEL_MAP.get(raw_category, "General Information")

    # Keyword post-processing override: if keywords detect a specific category,
    # trust that over the ML model (handles local dialects & damage vs rescue confusion)
    keyword_category = keyword_subcategory(text)
    if keyword_category != "General Information":
        category = keyword_category

    return category, confidence, model_used


def log_classification(user_id: int, tweet: str, category: str, confidence: float, model_used: str) -> int:
    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO classifications (user_id, tweet, category, confidence, model_used, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, tweet, category, confidence, model_used, now_utc_iso()),
    )
    conn.commit()
    classification_id = int(cur.lastrowid)
    conn.close()
    return classification_id

@app.post("/api/classify")
def classify():
    if "user_id" not in session:
        return jsonify({"message": "Authentication required."}), 401

    data = request.get_json(silent=True) or {}
    text = str(data.get("text", "")).strip()
    if len(text) < 1:
        return jsonify({"message": "Text is required."}), 400

    category, confidence, model_used = classify_text(text)
    classification_id = log_classification(
        int(session["user_id"]), text, category, confidence, model_used
    )
    payload = category_payload(category, confidence)
    payload["classification_id"] = classification_id
    payload["model_used"] = model_used
    return jsonify(payload)


@app.post("/api/classify/batch")
def classify_batch():
    if "user_id" not in session:
        return jsonify({"message": "Authentication required."}), 401

    tweets = []
    if request.files:
        file = request.files.get("file")
        if not file:
            return jsonify({"message": "File is required."}), 400
        raw = file.read().decode("utf-8", errors="ignore")
        reader = csv.reader(io.StringIO(raw))
        rows = list(reader)
        if rows and len(rows[0]) == 1 and rows[0][0].strip().lower() in {"tweet", "text"}:
            rows = rows[1:]
        for row in rows:
            if not row:
                continue
            tweets.append(str(row[0]).strip())
    else:
        data = request.get_json(silent=True) or {}
        tweets = data.get("tweets") if isinstance(data, dict) else None
        if not isinstance(tweets, list):
            tweets = []

    tweets = [str(t or "").strip() for t in tweets if str(t or "").strip()]
    if not tweets:
        return jsonify({"message": "Tweets array or CSV file is required."}), 400

    results = []
    for raw in tweets:
        text = str(raw or "").strip()
        category, confidence, model_used = classify_text(text)
        classification_id = log_classification(
            int(session["user_id"]), text, category, confidence, model_used
        )
        payload = category_payload(category, confidence)
        payload.update({"classification_id": classification_id, "model_used": model_used, "tweet": text})
        results.append(payload)

    return jsonify({"results": results, "count": len(results)})


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
                "role": session.get("role"),
            },
        }
    )


@app.get("/api/history")
def history():
    if "user_id" not in session:
        return jsonify({"message": "Authentication required."}), 401

    scope = request.args.get("scope", "mine")
    limit = int(request.args.get("limit", "200"))
    limit = max(1, min(limit, 500))
    user_id = session.get("user_id")

    conn = get_connection()
    if scope == "all" and session.get("role") == "admin":
        rows = conn.execute(
            """
            SELECT c.id, c.tweet, c.category, c.confidence, c.created_at, c.model_used, u.full_name,
                   (SELECT COUNT(*) FROM likes l WHERE l.classification_id = c.id) AS like_count,
                   (SELECT COUNT(*) FROM reposts r WHERE r.classification_id = c.id) AS repost_count,
                   (SELECT COUNT(*) FROM replies rp WHERE rp.classification_id = c.id) AS reply_count,
                   EXISTS(
                       SELECT 1 FROM likes l2 WHERE l2.classification_id = c.id AND l2.user_id = ?
                   ) AS liked_by_me,
                   EXISTS(
                       SELECT 1 FROM reposts r2 WHERE r2.classification_id = c.id AND r2.user_id = ?
                   ) AS reposted_by_me
            FROM classifications c
            JOIN users u ON u.id = c.user_id
            ORDER BY c.id DESC
            LIMIT ?
            """,
            (user_id, user_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT c.id, c.tweet, c.category, c.confidence, c.created_at, c.model_used, u.full_name,
                   (SELECT COUNT(*) FROM likes l WHERE l.classification_id = c.id) AS like_count,
                   (SELECT COUNT(*) FROM reposts r WHERE r.classification_id = c.id) AS repost_count,
                   (SELECT COUNT(*) FROM replies rp WHERE rp.classification_id = c.id) AS reply_count,
                   EXISTS(
                       SELECT 1 FROM likes l2 WHERE l2.classification_id = c.id AND l2.user_id = ?
                   ) AS liked_by_me,
                   EXISTS(
                       SELECT 1 FROM reposts r2 WHERE r2.classification_id = c.id AND r2.user_id = ?
                   ) AS reposted_by_me
            FROM classifications c
            JOIN users u ON u.id = c.user_id
            WHERE c.user_id = ?
            ORDER BY c.id DESC
            LIMIT ?
            """,
            (user_id, user_id, user_id, limit),
        ).fetchall()
    conn.close()

    items = [dict(row) for row in rows]
    return jsonify({"items": items})


@app.get("/api/classifications/<int:classification_id>")
def get_classification(classification_id: int):
    if "user_id" not in session:
        return jsonify({"message": "Authentication required."}), 401

    conn = get_connection()
    if session.get("role") == "admin":
        row = conn.execute(
            """
            SELECT c.id, c.tweet, c.category, c.confidence, c.created_at, c.model_used, u.full_name,
                   (SELECT COUNT(*) FROM likes l WHERE l.classification_id = c.id) AS like_count,
                   (SELECT COUNT(*) FROM reposts r WHERE r.classification_id = c.id) AS repost_count,
                   (SELECT COUNT(*) FROM replies rp WHERE rp.classification_id = c.id) AS reply_count,
                   EXISTS(
                       SELECT 1 FROM likes l2 WHERE l2.classification_id = c.id AND l2.user_id = ?
                   ) AS liked_by_me,
                   EXISTS(
                       SELECT 1 FROM reposts r2 WHERE r2.classification_id = c.id AND r2.user_id = ?
                   ) AS reposted_by_me
            FROM classifications c
            JOIN users u ON u.id = c.user_id
            WHERE c.id = ?
            """,
            (session.get("user_id"), session.get("user_id"), classification_id),
        ).fetchone()
    else:
        row = conn.execute(
            """
            SELECT c.id, c.tweet, c.category, c.confidence, c.created_at, c.model_used, u.full_name,
                   (SELECT COUNT(*) FROM likes l WHERE l.classification_id = c.id) AS like_count,
                   (SELECT COUNT(*) FROM reposts r WHERE r.classification_id = c.id) AS repost_count,
                   (SELECT COUNT(*) FROM replies rp WHERE rp.classification_id = c.id) AS reply_count,
                   EXISTS(
                       SELECT 1 FROM likes l2 WHERE l2.classification_id = c.id AND l2.user_id = ?
                   ) AS liked_by_me,
                   EXISTS(
                       SELECT 1 FROM reposts r2 WHERE r2.classification_id = c.id AND r2.user_id = ?
                   ) AS reposted_by_me
            FROM classifications c
            JOIN users u ON u.id = c.user_id
            WHERE c.id = ? AND c.user_id = ?
            """,
            (session.get("user_id"), session.get("user_id"), classification_id, session.get("user_id")),
        ).fetchone()
    conn.close()

    if not row:
        return jsonify({"message": "Classification not found."}), 404
    return jsonify(dict(row))


@app.post("/api/classifications/<int:classification_id>/like")
def toggle_like(classification_id: int):
    if "user_id" not in session:
        return jsonify({"message": "Authentication required."}), 401

    if session.get("role") == "admin":
        return jsonify({"message": "Admins cannot like posts."}), 403

    conn = get_connection()
    owned = conn.execute(
        "SELECT 1 FROM classifications WHERE id = ? AND user_id = ?",
        (classification_id, session.get("user_id")),
    ).fetchone()
    if not owned:
        conn.close()
        return jsonify({"message": "Classification not found."}), 404

    existing = conn.execute(
        "SELECT 1 FROM likes WHERE classification_id = ? AND user_id = ?",
        (classification_id, session.get("user_id")),
    ).fetchone()

    if existing:
        conn.execute(
            "DELETE FROM likes WHERE classification_id = ? AND user_id = ?",
            (classification_id, session.get("user_id")),
        )
        liked = False
    else:
        conn.execute(
            "INSERT INTO likes (classification_id, user_id, created_at) VALUES (?, ?, ?)",
            (classification_id, session.get("user_id"), now_utc_iso()),
        )
        liked = True

    conn.commit()
    count_row = conn.execute(
        "SELECT COUNT(*) as count FROM likes WHERE classification_id = ?",
        (classification_id,),
    ).fetchone()
    conn.close()
    return jsonify({"liked": liked, "like_count": int(count_row["count"])})


@app.post("/api/classifications/<int:classification_id>/repost")
def toggle_repost(classification_id: int):
    if "user_id" not in session:
        return jsonify({"message": "Authentication required."}), 401

    if session.get("role") == "admin":
        return jsonify({"message": "Admins cannot repost."}), 403

    conn = get_connection()
    owned = conn.execute(
        "SELECT 1 FROM classifications WHERE id = ? AND user_id = ?",
        (classification_id, session.get("user_id")),
    ).fetchone()
    if not owned:
        conn.close()
        return jsonify({"message": "Classification not found."}), 404

    existing = conn.execute(
        "SELECT 1 FROM reposts WHERE classification_id = ? AND user_id = ?",
        (classification_id, session.get("user_id")),
    ).fetchone()

    if existing:
        conn.execute(
            "DELETE FROM reposts WHERE classification_id = ? AND user_id = ?",
            (classification_id, session.get("user_id")),
        )
        reposted = False
    else:
        conn.execute(
            "INSERT INTO reposts (classification_id, user_id, created_at) VALUES (?, ?, ?)",
            (classification_id, session.get("user_id"), now_utc_iso()),
        )
        reposted = True

    conn.commit()
    count_row = conn.execute(
        "SELECT COUNT(*) as count FROM reposts WHERE classification_id = ?",
        (classification_id,),
    ).fetchone()
    conn.close()
    return jsonify({"reposted": reposted, "repost_count": int(count_row["count"])})


@app.post("/api/classifications/<int:classification_id>/reply")
def add_reply(classification_id: int):
    if "user_id" not in session:
        return jsonify({"message": "Authentication required."}), 401

    if session.get("role") == "admin":
        return jsonify({"message": "Admins cannot reply."}), 403

    data = request.get_json(silent=True) or {}
    reply_text = str(data.get("reply", "")).strip()
    if len(reply_text) < 2:
        return jsonify({"message": "Reply must be at least 2 characters."}), 400

    conn = get_connection()
    owned = conn.execute(
        "SELECT 1 FROM classifications WHERE id = ? AND user_id = ?",
        (classification_id, session.get("user_id")),
    ).fetchone()
    if not owned:
        conn.close()
        return jsonify({"message": "Classification not found."}), 404

    conn.execute(
        "INSERT INTO replies (classification_id, user_id, reply_text, created_at) VALUES (?, ?, ?, ?)",
        (classification_id, session.get("user_id"), reply_text, now_utc_iso()),
    )
    conn.commit()
    reply_row = conn.execute(
        """
        SELECT r.id, r.reply_text, r.created_at, u.full_name
        FROM replies r
        JOIN users u ON u.id = r.user_id
        WHERE r.id = last_insert_rowid()
        """,
    ).fetchone()
    count_row = conn.execute(
        "SELECT COUNT(*) as count FROM replies WHERE classification_id = ?",
        (classification_id,),
    ).fetchone()
    conn.close()
    return jsonify({"reply_count": int(count_row["count"]), "reply": dict(reply_row) if reply_row else None})


@app.get("/api/classifications/<int:classification_id>/replies")
def list_replies(classification_id: int):
    if "user_id" not in session:
        return jsonify({"message": "Authentication required."}), 401

    conn = get_connection()
    if session.get("role") == "admin":
        owned = conn.execute(
            "SELECT 1 FROM classifications WHERE id = ?",
            (classification_id,),
        ).fetchone()
    else:
        owned = conn.execute(
            "SELECT 1 FROM classifications WHERE id = ? AND user_id = ?",
            (classification_id, session.get("user_id")),
        ).fetchone()

    if not owned:
        conn.close()
        return jsonify({"message": "Classification not found."}), 404

    rows = conn.execute(
        """
        SELECT r.id, r.reply_text, r.created_at, u.full_name
        FROM replies r
        JOIN users u ON u.id = r.user_id
        WHERE r.classification_id = ?
        ORDER BY r.id ASC
        """,
        (classification_id,),
    ).fetchall()
    conn.close()
    return jsonify({"items": [dict(row) for row in rows]})


@app.get("/api/stats")
def stats():
    if "user_id" not in session:
        return jsonify({"message": "Authentication required."}), 401

    scope = request.args.get("scope", "mine")
    conn = get_connection()
    if scope == "all" and session.get("role") == "admin":
        where_clause = ""
        params = ()
    else:
        where_clause = "WHERE user_id = ?"
        params = (session.get("user_id"),)

    rows = conn.execute(
        f"SELECT category, COUNT(*) as count, AVG(confidence) as avg_conf FROM classifications {where_clause} GROUP BY category",
        params,
    ).fetchall()
    total_row = conn.execute(
        f"SELECT COUNT(*) as total, AVG(confidence) as avg_conf FROM classifications {where_clause}",
        params,
    ).fetchone()
    conn.close()

    by_category = {row["category"]: row["count"] for row in rows}
    avg_conf = float(total_row["avg_conf"] or 0.0)
    total = int(total_row["total"] or 0)
    return jsonify({"total": total, "avg_confidence": round(avg_conf * 100, 1), "by_category": by_category})


@app.post("/api/flag")
def flag():
    if "user_id" not in session:
        return jsonify({"message": "Authentication required."}), 401

    data = request.get_json(silent=True) or {}
    classification_id = data.get("classification_id")
    reason = str(data.get("reason", "Needs review")).strip() or "Needs review"

    if not classification_id:
        return jsonify({"message": "classification_id is required."}), 400

    conn = get_connection()
    conn.execute(
        "INSERT INTO flags (classification_id, user_id, reason, created_at) VALUES (?, ?, ?, ?)",
        (classification_id, session.get("user_id"), reason, now_utc_iso()),
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Flag recorded."})


@app.post("/api/history/clear")
def clear_history():
    if "user_id" not in session:
        return jsonify({"message": "Authentication required."}), 401

    scope = request.args.get("scope", "mine")
    conn = get_connection()

    if scope == "all" and session.get("role") == "admin":
        conn.execute("DELETE FROM replies")
        conn.execute("DELETE FROM likes")
        conn.execute("DELETE FROM reposts")
        conn.execute("DELETE FROM flags")
        conn.execute("DELETE FROM classifications")
    else:
        user_id = session.get("user_id")
        ids = [
            row["id"]
            for row in conn.execute(
                "SELECT id FROM classifications WHERE user_id = ?",
                (user_id,),
            ).fetchall()
        ]
        if ids:
            placeholders = ",".join("?" * len(ids))
            conn.execute(f"DELETE FROM replies WHERE classification_id IN ({placeholders})", ids)
            conn.execute(f"DELETE FROM likes WHERE classification_id IN ({placeholders})", ids)
            conn.execute(f"DELETE FROM reposts WHERE classification_id IN ({placeholders})", ids)
            conn.execute(f"DELETE FROM flags WHERE classification_id IN ({placeholders})", ids)
        conn.execute("DELETE FROM classifications WHERE user_id = ?", (user_id,))

    conn.commit()
    conn.close()
    return jsonify({"message": "History cleared."})


@app.get("/api/export/csv")
def export_csv():
    if "user_id" not in session:
        return jsonify({"message": "Authentication required."}), 401

    scope = request.args.get("scope", "mine")
    conn = get_connection()
    if scope == "all" and session.get("role") == "admin":
        rows = conn.execute(
            """
            SELECT c.tweet, c.category, c.confidence, c.created_at, c.model_used, u.email
            FROM classifications c
            JOIN users u ON u.id = c.user_id
            ORDER BY c.id DESC
            """
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT tweet, category, confidence, created_at, model_used
            FROM classifications
            WHERE user_id = ?
            ORDER BY id DESC
            """,
            (session.get("user_id"),),
        ).fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    if scope == "all" and session.get("role") == "admin":
        writer.writerow(["tweet", "category", "confidence", "created_at", "model_used", "email"])
    else:
        writer.writerow(["tweet", "category", "confidence", "created_at", "model_used"])
    for row in rows:
        writer.writerow(list(row))

    return app.response_class(output.getvalue(), mimetype="text/csv")


@app.get("/api/export/pdf")
def export_pdf():
    if "user_id" not in session:
        return jsonify({"message": "Authentication required."}), 401

    scope = request.args.get("scope", "mine")
    stats_payload = stats().get_json()
    if scope != "all" or session.get("role") != "admin":
        stats_payload = stats_payload

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    pdf.setTitle("Disaster Tweet Classification Report")
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(40, height - 50, "Disaster Tweet Classification Report")

    pdf.setFont("Helvetica", 11)
    pdf.drawString(40, height - 75, f"Generated: {now_utc_iso()}")
    pdf.drawString(40, height - 92, f"Scope: {scope}")

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(40, height - 125, "Summary")
    pdf.setFont("Helvetica", 11)
    pdf.drawString(40, height - 145, f"Total classified: {stats_payload.get('total', 0)}")
    pdf.drawString(40, height - 162, f"Average confidence: {stats_payload.get('avg_confidence', 0)}%")

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(40, height - 195, "By Category")
    pdf.setFont("Helvetica", 11)
    y = height - 215
    for category, count in stats_payload.get("by_category", {}).items():
        pdf.drawString(50, y, f"{category}: {count}")
        y -= 16

    pdf.showPage()
    pdf.save()
    buffer.seek(0)

    return app.response_class(buffer.read(), mimetype="application/pdf")


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
