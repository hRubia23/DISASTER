## DISASTER — Disaster Tweet Classifier (Localhost System)

This project is a simple **localhost web system** for classifying disaster-related tweets, with **user authentication** (register/login) backed by a **SQLite database**.

---

## Requirements

- Python 3.10+ recommended
- Windows PowerShell

Install dependencies:

```bash
py -m pip install -r requirements.txt
```

---

## Run on localhost (Flask)

From the project folder:

```bash
py app.py
```

Then open:

- `http://127.0.0.1:5000/`

---

## Database (Authentication Details)

- **Database type**: SQLite (file-based, no separate install needed)
- **Database file**: `users.db`
- **Location**: project root (auto-created when you run `app.py`)

The database contains a `users` table with:
- `full_name`
- `email` (unique)
- `password_hash`
- `created_at`

---

## API Endpoints (System Authentication)

- **Register**: `POST /api/register`
  - JSON body: `{ "full_name": "...", "email": "...", "password": "..." }`
- **Login**: `POST /api/login`
  - JSON body: `{ "email": "...", "password": "..." }`
- **Current session**: `GET /api/me`
- **Logout**: `POST /api/logout`

Notes:
- The system uses cookie-based sessions (browser keeps the login).
- If you are not logged in, `/` redirects you to `auth.html`.

---

## Project Folder Structure (for submission)

- `datasets/`
  - Place your dataset file(s) here (example: `datasets/disaster_tweets.csv`)
- `scripts/`
  - Python scripts for training/evaluation and generating graphs/charts
- `models/`
  - Saved model artifacts (example: `models/model.joblib`)
- `outputs/`
  - Generated graphs/charts/images for your report
  - `outputs/graphs/`
  - `outputs/charts/`
  - `outputs/images/`
- Root frontend pages:
  - `auth.html`, `index.html`, `result.html`, `dashboard.html`
  - `styles.css`, `script.js`, `auth-client.js`
- Backend:
  - `app.py` (Flask)

---

## Python scripts (graphs/charts/images)

These scripts assume you have a dataset CSV at:
- `datasets/disaster_tweets.csv`

Expected columns (typical Kaggle format):
- `text` (tweet text)
- `target` (0/1 label)

Run:

```bash
py scripts\plot_eda.py
py scripts\train_model.py
py scripts\evaluate_model.py
```

Outputs:
- `outputs/graphs/` (EDA plots)
- `outputs/charts/` (confusion matrix, metrics)
- `models/model.joblib` (trained baseline model)

