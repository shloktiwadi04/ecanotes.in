"""
EcaNotes.in - Unified Relational Database Engine
Supports:
1. Cloud PostgreSQL (Supabase / Neon / Render Postgres) when DATABASE_URL is set.
2. Local SQLite (data/ecanotes.db) when DATABASE_URL is absent.
- Persistent relational storage for resources, reviews, admin accounts, sessions, and subjects.
- Bytea/BLOB binary storage for uploaded PDF files (up to 4 MB) ensuring 100% persistence on cloud.
- Secure PBKDF2-HMAC-SHA256 password hashing with random salt.
"""

import os
import sys
import re
import sqlite3
import hashlib
import secrets
import time
from datetime import datetime
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "ecanotes.db"
UPLOADS_DIR = DATA_DIR / "uploads"

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def get_database_url() -> str | None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        return None
    url = url.strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url


def is_postgres() -> bool:
    return bool(get_database_url() and HAS_PSYCOPG2)


class PostgresCursor:
    """
    Transparent cursor wrapper translating SQLite-style '?' placeholders
    and SQLite dialect idioms (INSERT OR REPLACE, INSERT OR IGNORE) into PostgreSQL.
    """
    def __init__(self, raw_cursor):
        self._cursor = raw_cursor

    def execute(self, query: str, params=None):
        translated = query.replace("?", "%s")

        # Emulate PRAGMA table_info in PostgreSQL
        if "PRAGMA table_info" in translated:
            self._cursor.execute("""
                SELECT column_name as name FROM information_schema.columns 
                WHERE table_name = 'resources'
            """)
            return self

        # Handle INSERT OR REPLACE INTO -> ON CONFLICT (id) DO UPDATE / DO NOTHING
        if re.match(r"^\s*INSERT\s+OR\s+REPLACE\s+INTO", translated, re.IGNORECASE):
            translated = re.sub(r"^\s*INSERT\s+OR\s+REPLACE\s+INTO", "INSERT INTO", translated, flags=re.IGNORECASE)
            if "ON CONFLICT" not in translated.upper():
                translated = translated.rstrip().rstrip(";") + " ON CONFLICT (id) DO NOTHING"

        # Handle INSERT OR IGNORE INTO -> ON CONFLICT DO NOTHING
        if re.match(r"^\s*INSERT\s+OR\s+IGNORE\s+INTO", translated, re.IGNORECASE):
            translated = re.sub(r"^\s*INSERT\s+OR\s+IGNORE\s+INTO", "INSERT INTO", translated, flags=re.IGNORECASE)
            if "ON CONFLICT" not in translated.upper():
                translated = translated.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"

        if params is not None:
            adapted = []
            for p in params:
                if isinstance(p, (bytes, bytearray)):
                    adapted.append(psycopg2.Binary(p))
                else:
                    adapted.append(p)
            self._cursor.execute(translated, tuple(adapted))
        else:
            self._cursor.execute(translated)
        return self

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        return dict(row)

    def fetchall(self):
        rows = self._cursor.fetchall()
        return [dict(r) for r in rows]

    @property
    def rowcount(self):
        return self._cursor.rowcount

    def close(self):
        self._cursor.close()


class PostgresConnection:
    def __init__(self, raw_conn):
        self._conn = raw_conn

    def cursor(self):
        return PostgresCursor(self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor))

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


def get_connection():
    db_url = get_database_url()
    if db_url and HAS_PSYCOPG2:
        try:
            raw_conn = psycopg2.connect(db_url)
            return PostgresConnection(raw_conn)
        except Exception as err:
            print(f"[DB] PostgreSQL connection error: {err}. Falling back to SQLite.")

    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return pwd_hash, salt


def verify_password(password: str, pwd_hash: str, salt: str) -> bool:
    expected_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(expected_hash, pwd_hash)


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Resources Table (Includes file_data BYTEA for cloud permanent persistence)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subject TEXT NOT NULL,
        year TEXT NOT NULL,
        branch TEXT DEFAULT 'All',
        type TEXT NOT NULL,
        author TEXT NOT NULL,
        email TEXT,
        file_path TEXT,
        file_name TEXT NOT NULL,
        file_size TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_data BYTEA,
        downloads INTEGER DEFAULT 0,
        description TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL,
        approved_at TEXT,
        timestamp BIGINT NOT NULL
    )
    """)

    # 2. Reviews Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        branch TEXT NOT NULL,
        year TEXT NOT NULL,
        stars INTEGER NOT NULL,
        review TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL,
        published_at TEXT,
        timestamp BIGINT NOT NULL
    )
    """)

    # 3. Admin Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    # 4. Admin Sessions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL
    )
    """)

    # 5. Subjects Table (Dynamic Year-Linked Subjects)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        year TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(name, year)
    )
    """)
    conn.commit()

    # Ensure branch & file_data columns exist if table was previously created
    try:
        cursor.execute("PRAGMA table_info(resources)")
        cols = [col["name"] for col in cursor.fetchall()]
        if "branch" not in cols:
            cursor.execute("ALTER TABLE resources ADD COLUMN branch TEXT DEFAULT 'All'")
            conn.commit()
            print("[DB] Migrated resources table: added branch column")
        if "file_data" not in cols:
            cursor.execute("ALTER TABLE resources ADD COLUMN file_data BYTEA")
            conn.commit()
            print("[DB] Migrated resources table: added file_data column")
    except Exception as e:
        print(f"[DB] Column check notice: {e}")

    # Update existing seed resources to ensure valid branches if default was 'All'
    try:
        cursor.execute("UPDATE resources SET branch = 'CSE' WHERE id = 'res-2' AND (branch IS NULL OR branch = 'All')")
        cursor.execute("UPDATE resources SET branch = 'ECE' WHERE id = 'res-4' AND (branch IS NULL OR branch = 'All')")
        cursor.execute("UPDATE resources SET branch = 'CSE' WHERE id = 'res-6' AND (branch IS NULL OR branch = 'All')")
        cursor.execute("UPDATE resources SET branch = 'IT' WHERE id = 'res-8' AND (branch IS NULL OR branch = 'All')")
        conn.commit()
    except Exception:
        pass

    # Seed Admin User if none exists
    cursor.execute("SELECT COUNT(*) as cnt FROM admin_users")
    if cursor.fetchone()["cnt"] == 0:
        admin_email = os.environ.get("ADMIN_EMAIL", "owner@ecanotes.in").lower().strip()
        admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
        pwd_hash, salt = hash_password(admin_password)
        cursor.execute(
            "INSERT INTO admin_users (id, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)",
            ("admin-1", admin_email, pwd_hash, salt, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        )
        conn.commit()
        print(f"[DB] Initialized owner account for {admin_email}")

    # Seed Initial Subjects if table is empty
    cursor.execute("SELECT COUNT(*) as cnt FROM subjects")
    if cursor.fetchone()["cnt"] == 0:
        seed_subjects(conn)

    # Seed Initial Resources if table is empty
    cursor.execute("SELECT COUNT(*) as cnt FROM resources WHERE status = 'approved'")
    if cursor.fetchone()["cnt"] == 0:
        seed_resources(conn)

    # Seed Initial Reviews if table is empty
    cursor.execute("SELECT COUNT(*) as cnt FROM reviews WHERE status = 'published'")
    if cursor.fetchone()["cnt"] == 0:
        seed_reviews(conn)

    # Automatically index all subjects from resources into subjects table
    cursor.execute("SELECT DISTINCT subject, year FROM resources WHERE subject IS NOT NULL AND year IS NOT NULL")
    existing_res_subjects = cursor.fetchall()
    for r in existing_res_subjects:
        ensure_subject(r["subject"], r["year"], conn)

    conn.close()


def seed_resources(conn):
    from backend.storage import create_sample_pdf

    now_str = datetime.now().strftime("%d/%m/%Y, %I:%M:%S %p")
    now_ts = int(time.time() * 1000)

    seeds = [
        {
            "id": "res-1",
            "title": "Engineering Mathematics - I (Calculus & Linear Algebra)",
            "subject": "Engineering Mathematics",
            "year": "1st Year",
            "branch": "All",
            "type": "Handwritten Notes",
            "author": "Aarav Sharma",
            "downloads": 4820,
            "description": "Comprehensive handwritten formulas, theorems, and solved semester questions for Matrices, Eigenvalues, and Multivariable Calculus.",
            "file_name": "Engg_Maths_1_Complete.pdf",
            "file_size": "4.2 MB"
        },
        {
            "id": "res-2",
            "title": "Data Structures & Algorithms Laboratory - Complete Practical File",
            "subject": "Data Structures & Algorithms",
            "year": "2nd Year",
            "branch": "CSE",
            "type": "Practical Files",
            "author": "Vikram Malhotra",
            "downloads": 3950,
            "description": "Complete lab record with verified C++ programs, output screenshots, algorithm complexity analysis, and frequently asked viva questions.",
            "file_name": "DSA_Lab_Practical_File_Complete.pdf",
            "file_size": "5.4 MB"
        },
        {
            "id": "res-3",
            "title": "Engineering Physics 2024-25 End Semester Solved PYQs",
            "subject": "Engineering Physics",
            "year": "1st Year",
            "branch": "All",
            "type": "PYQ",
            "author": "Dr. S. K. Gupta",
            "downloads": 3120,
            "description": "Last 5 years solved university question papers for Wave Optics, Quantum Mechanics, Lasers, and Fiber Optics with step-by-step solutions.",
            "file_name": "Physics_Solved_PYQ_2020_2025.pdf",
            "file_size": "3.8 MB"
        },
        {
            "id": "res-4",
            "title": "Digital Electronics & Logic Design Lab Practical File",
            "subject": "Digital Electronics",
            "year": "2nd Year",
            "branch": "ECE",
            "type": "Practical Files",
            "author": "Neha Singhania",
            "downloads": 2840,
            "description": "Fully verified experiment sheets with circuit diagrams, truth tables, IC pinouts, and Boolean minimization lab outputs.",
            "file_name": "Digital_Electronics_Lab_Record.pdf",
            "file_size": "4.6 MB"
        },
        {
            "id": "res-5",
            "title": "Programming in C - Solved Assignment Sheets & Programs",
            "subject": "Programming in C",
            "year": "1st Year",
            "branch": "All",
            "type": "Assignment",
            "author": "Rohan Patel",
            "downloads": 2480,
            "description": "50+ classic university assignment problems including recursion, dynamic memory allocation, pointers, and structures.",
            "file_name": "Programming_in_C_Assignments.pdf",
            "file_size": "2.9 MB"
        },
        {
            "id": "res-6",
            "title": "Operating Systems Practical Lab Manual & Shell Scripts",
            "subject": "Operating Systems",
            "year": "3rd Year",
            "branch": "CSE",
            "type": "Practical Files",
            "author": "Aditya Verma",
            "downloads": 2190,
            "description": "Ready-to-submit OS lab manual with CPU scheduling simulations, Banker's algorithm, Page replacement, and Linux bash scripts.",
            "file_name": "OS_Lab_Manual_and_Codes.pdf",
            "file_size": "3.7 MB"
        },
        {
            "id": "res-7",
            "title": "Basic Electrical Engineering - Core Theory Notes",
            "subject": "Basic Electrical Engineering",
            "year": "1st Year",
            "branch": "All",
            "type": "Notes",
            "author": "Prof. R. C. Rao",
            "downloads": 1940,
            "description": "Clear conceptual notes on KVL, KCL, Mesh/Nodal analysis, Thevenin's theorem, Single-phase AC circuits, and Three-phase systems.",
            "file_name": "Basic_Electrical_Theory_Notes.pdf",
            "file_size": "3.1 MB"
        },
        {
            "id": "res-8",
            "title": "Computer Networks Lab Record & Cisco Packet Tracer Files",
            "subject": "Computer Networks",
            "year": "3rd Year",
            "branch": "IT",
            "type": "Practical Files",
            "author": "Pooja Hegde",
            "downloads": 1820,
            "description": "Comprehensive practical file with IP subnetting, socket programming in Python/C, and Packet Tracer network topologies.",
            "file_name": "CN_Practical_Lab_Record.pdf",
            "file_size": "6.1 MB"
        },
        {
            "id": "res-9",
            "title": "Artificial Intelligence & Expert Systems Complete Notes",
            "subject": "Artificial Intelligence",
            "year": "4th Year",
            "branch": "CSE",
            "type": "Notes",
            "author": "Prof. V. Raman",
            "downloads": 1640,
            "description": "Search algorithms, heuristic state spaces, knowledge representation, propositional logic, and inference engines.",
            "file_name": "AI_Core_Theory_Notes.pdf",
            "file_size": "3.4 MB"
        },
        {
            "id": "res-10",
            "title": "Microprocessor & Interfacing 8086 Practical Record",
            "subject": "Digital Electronics",
            "year": "2nd Year",
            "branch": "EIC",
            "type": "Practical Files",
            "author": "Karan Dave",
            "downloads": 1430,
            "description": "8086 microprocessor assembly language programs, pin configurations, memory interfacing, and peripheral IC 8255/8259 lab records.",
            "file_name": "Microprocessor_8086_Lab_Record.pdf",
            "file_size": "4.1 MB"
        }
    ]

    cursor = conn.cursor()
    for s in seeds:
        pdf_path = create_sample_pdf(s["title"], s["subject"], s["year"], s["type"], s["author"], s["description"], s["file_name"])
        pdf_bytes = None
        if pdf_path and os.path.exists(pdf_path):
            try:
                with open(pdf_path, "rb") as pf:
                    pdf_bytes = pf.read()
            except Exception:
                pass
        cursor.execute("""
            INSERT OR REPLACE INTO resources (
                id, title, subject, year, branch, type, author, email, file_path, file_name, file_size, file_type, file_data, downloads, description, status, created_at, approved_at, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)
        """, (
            s["id"], s["title"], s["subject"], s["year"], s.get("branch", "All"), s["type"], s["author"],
            "contributor@ecanotes.in", str(pdf_path), s["file_name"], s["file_size"],
            "application/pdf", pdf_bytes, s["downloads"], s["description"], now_str, now_str, now_ts
        ))
    conn.commit()
    print(f"[DB] Seeded {len(seeds)} verified study resources.")


def seed_reviews(conn):
    seeds = [
        {
            "id": "rev-1",
            "name": "Rohan Sharma",
            "branch": "CSE",
            "year": "1st Year",
            "stars": 5,
            "review": "EcaNotes made finding PYQs and notes much easier. I used it during my semester exams and it saved me a lot of time. Highly recommend for any engineering student.",
            "created_at": "10/09/2026, 04:30:00 PM",
            "timestamp": int(time.time() * 1000) - 3600000
        },
        {
            "id": "rev-2",
            "name": "Priya Patel",
            "branch": "ECE",
            "year": "2nd Year",
            "stars": 5,
            "review": "The handwritten notes and lab practical files are so detailed. Found Engineering Maths notes that explained concepts better than textbooks. Amazing platform!",
            "created_at": "10/09/2026, 03:15:00 PM",
            "timestamp": int(time.time() * 1000) - 7200000
        },
        {
            "id": "rev-3",
            "name": "Aditya Kumar",
            "branch": "Civil",
            "year": "1st Year",
            "stars": 5,
            "review": "I shared my own assignment notes and practical files. Within days students were already downloading them. Feels great to help peers across colleges.",
            "created_at": "10/09/2026, 01:45:00 PM",
            "timestamp": int(time.time() * 1000) - 10800000
        },
        {
            "id": "rev-4",
            "name": "Ananya Mishra",
            "branch": "EEE",
            "year": "3rd Year",
            "stars": 5,
            "review": "Used EcaNotes for mid-sem and end-sem preparation. The solved PYQs and lab records match our syllabus accurately. Thank you for building this!",
            "created_at": "09/09/2026, 11:20:00 AM",
            "timestamp": int(time.time() * 1000) - 86400000
        },
        {
            "id": "rev-5",
            "name": "Vignesh Krishnan",
            "branch": "Mechanical",
            "year": "1st Year",
            "stars": 5,
            "review": "I was struggling to find good notes and practicals for Engineering Chemistry. Found exactly what I needed here. The filters by year and type are super easy.",
            "created_at": "09/09/2026, 09:10:00 AM",
            "timestamp": int(time.time() * 1000) - 90000000
        },
        {
            "id": "rev-6",
            "name": "Shreya Nair",
            "branch": "IT",
            "year": "2nd Year",
            "stars": 4,
            "review": "Clean and distraction-free website. Found previous papers and practical files for my core subjects in minutes. Love the responsive layout.",
            "created_at": "08/09/2026, 05:40:00 PM",
            "timestamp": int(time.time() * 1000) - 172800000
        }
    ]

    cursor = conn.cursor()
    for r in seeds:
        cursor.execute("""
            INSERT OR REPLACE INTO reviews (
                id, name, branch, year, stars, review, status, created_at, published_at, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)
        """, (
            r["id"], r["name"], r["branch"], r["year"], r["stars"], r["review"],
            r["created_at"], r["created_at"], r["timestamp"]
        ))
    conn.commit()
    print(f"[DB] Seeded {len(seeds)} published student reviews.")


def seed_subjects(conn):
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    seeds = [
        # 1st Year Core Subjects
        ("sub-1-1", "Engineering Mathematics", "1st Year"),
        ("sub-1-2", "Engineering Physics", "1st Year"),
        ("sub-1-3", "Engineering Chemistry", "1st Year"),
        ("sub-1-4", "Basic Electrical Engineering", "1st Year"),
        ("sub-1-5", "Programming in C", "1st Year"),
        ("sub-1-6", "Engineering Graphics", "1st Year"),
        ("sub-1-7", "Environmental Science", "1st Year"),
        ("sub-1-8", "Mechanical Engineering", "1st Year"),

        # 2nd Year Core Subjects
        ("sub-2-1", "Data Structures & Algorithms", "2nd Year"),
        ("sub-2-2", "Digital Electronics", "2nd Year"),
        ("sub-2-3", "Object Oriented Programming", "2nd Year"),
        ("sub-2-4", "Discrete Mathematics", "2nd Year"),

        # 3rd Year Core Subjects
        ("sub-3-1", "Operating Systems", "3rd Year"),
        ("sub-3-2", "Computer Networks", "3rd Year"),
        ("sub-3-3", "Database Management Systems", "3rd Year"),
        ("sub-3-4", "Software Engineering", "3rd Year"),

        # 4th Year Core Subjects
        ("sub-4-1", "Artificial Intelligence", "4th Year"),
        ("sub-4-2", "Machine Learning", "4th Year"),
        ("sub-4-3", "Cloud Computing", "4th Year")
    ]

    for sid, name, year in seeds:
        cursor.execute("""
            INSERT OR IGNORE INTO subjects (id, name, year, created_at)
            VALUES (?, ?, ?, ?)
        """, (sid, name, year, now_str))
    conn.commit()
    print(f"[DB] Seeded {len(seeds)} initial year-linked subjects.")


def ensure_subject(name: str, year: str, conn=None):
    """
    Ensures a subject exists for a given year. If not present, automatically
    inserts it with case-insensitive check and links it to that year.
    """
    if not name or not name.strip():
        return None

    clean_name = name.strip()
    clean_year = (year or "1st Year").strip()
    if clean_year == "All" or not clean_year:
        clean_year = "1st Year"

    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM subjects 
        WHERE LOWER(name) = LOWER(?) AND year = ?
    """, (clean_name, clean_year))
    row = cursor.fetchone()

    if row:
        result = dict(row)
        if should_close:
            conn.close()
        return result

    # Create new dynamic subject linked to this year
    sub_id = f"sub-{int(time.time() * 1000)}-{secrets.token_hex(2)}"
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO subjects (id, name, year, created_at)
        VALUES (?, ?, ?, ?)
    """, (sub_id, clean_name, clean_year, now_str))
    conn.commit()

    cursor.execute("SELECT * FROM subjects WHERE id = ?", (sub_id,))
    row = cursor.fetchone()
    result = dict(row) if row else None

    if should_close:
        conn.close()

    print(f"[DB] Dynamically registered new subject: '{clean_name}' for '{clean_year}'")
    return result

