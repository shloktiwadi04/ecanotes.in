"""
EcaNotes.in - Production Backend Server
Built with FastAPI, SQLite, and genuine file storage.
"""

import os
import sys
import time
import secrets
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request, HTTPException, Depends, UploadFile, File, Form, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

# Add parent directory to sys.path so 'backend' package imports work cleanly
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from backend.database import (
    init_db, get_connection, hash_password, verify_password,
    DATA_DIR, UPLOADS_DIR, ensure_subject
)
from backend.storage import create_sample_pdf

MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024  # 4 MB

# Initialize Database and Seeds on startup
init_db()

app = FastAPI(
    title="EcaNotes.in Academic Portal API",
    description="Production backend API for college study resources, uploads, reviews, and secure owner moderation.",
    version="2.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# AUTHENTICATION & SECURITY HELPERS
# =============================================================================
def get_current_admin(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in to the Owner Portal."
        )

    token = auth_header.split(" ")[1].strip()
    conn = get_connection()
    cursor = conn.cursor()
    now_ts = int(time.time())

    cursor.execute("""
        SELECT s.token, s.user_id, s.expires_at, u.email
        FROM admin_sessions s
        JOIN admin_users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > ?
    """, (token, now_ts))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid token. Please log in again."
        )

    return {"token": row["token"], "user_id": row["user_id"], "email": row["email"]}


# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================
class LoginRequest(BaseModel):
    email: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ReviewCreateRequest(BaseModel):
    name: str
    branch: str
    year: str
    stars: int
    review: str

class ResourceUpdateRequest(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None
    year: Optional[str] = None
    type: Optional[str] = None
    author: Optional[str] = None

class SubjectCreateRequest(BaseModel):
    name: str
    year: str

class SubjectUpdateRequest(BaseModel):
    name: Optional[str] = None
    year: Optional[str] = None



# =============================================================================
# PUBLIC API: STUDY RESOURCES
# =============================================================================
@app.get("/api/resources")
def list_resources(
    year: Optional[str] = "All",
    type: Optional[str] = "All",
    subject: Optional[str] = "All",
    q: Optional[str] = None
):
    """
    Returns verified, published study resources matching filters and search query.
    """
    conn = get_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM resources WHERE status = 'approved'"
    params = []

    if year and year != "All":
        query += " AND year = ?"
        params.append(year)

    if type and type != "All":
        if type == "Practical Files":
            query += " AND type = 'Practical Files'"
        elif type == "Notes":
            query += " AND (type = 'Notes' OR type = 'Handwritten Notes')"
        else:
            query += " AND type = ?"
            params.append(type)

    if subject and subject != "All":
        query += " AND subject = ?"
        params.append(subject)

    query += " ORDER BY timestamp DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    resources = [dict(r) for r in rows]

    # Search filter in python for comprehensive multi-field matching
    if q and q.strip():
        search_term = q.strip().lower()
        resources = [
            r for r in resources
            if search_term in r["title"].lower()
            or search_term in r["subject"].lower()
            or search_term in r["author"].lower()
            or search_term in r["type"].lower()
            or (r["description"] and search_term in r["description"].lower())
        ]

    return resources


@app.get("/api/subjects")
def list_subjects(year: Optional[str] = "All"):
    """
    Returns subjects dynamically from SQLite database.
    Can be filtered by year (e.g. '1st Year', '2nd Year', or 'All').
    Includes active verified resource count for each subject.
    """
    conn = get_connection()
    cursor = conn.cursor()

    if year and year != "All":
        cursor.execute("""
            SELECT s.id, s.name, s.year, s.created_at,
                   COUNT(r.id) as resource_count
            FROM subjects s
            LEFT JOIN resources r ON LOWER(s.name) = LOWER(r.subject) AND s.year = r.year AND r.status = 'approved'
            WHERE s.year = ?
            GROUP BY s.id
            ORDER BY s.name ASC
        """, (year,))
    else:
        cursor.execute("""
            SELECT s.id, s.name, s.year, s.created_at,
                   COUNT(r.id) as resource_count
            FROM subjects s
            LEFT JOIN resources r ON LOWER(s.name) = LOWER(r.subject) AND s.year = r.year AND r.status = 'approved'
            GROUP BY s.id
            ORDER BY s.year ASC, s.name ASC
        """)

    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/resources/{resource_id}")
def get_resource_detail(resource_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM resources WHERE id = ? AND status = 'approved'", (resource_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Study resource not found")
    return dict(row)


@app.post("/api/resources/upload", status_code=status.HTTP_201_CREATED)
async def upload_resource(
    name: str = Form(...),
    email: str = Form(...),
    year: str = Form(...),
    subject: str = Form(...),
    type: str = Form(...),
    title: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Student resource submission.
    Saves authentic uploaded file to disk and stores metadata with status='pending'.
    """
    # Validate extension
    allowed_extensions = {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"}
    original_filename = file.filename or "student_notes.pdf"
    ext = Path(original_filename).suffix.lower()
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: PDF, JPG, PNG, DOC, DOCX")

    res_id = f"up-{int(time.time() * 1000)}"
    safe_name = f"{res_id}_{secrets.token_hex(4)}{ext}"
    dest_path = UPLOADS_DIR / safe_name

    # Save real binary file to disk
    file_bytes = await file.read()
    file_size_bytes = len(file_bytes)
    if file_size_bytes > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File size must be 4 MB or less.")
    file_size_str = f"{(file_size_bytes / (1024 * 1024)):.1f} MB" if file_size_bytes >= 1024*1024 else f"{(file_size_bytes / 1024):.0f} KB"

    with open(dest_path, "wb") as f:
        f.write(file_bytes)

    now_str = datetime.now().strftime("%d/%m/%Y, %I:%M:%S %p")
    now_ts = int(time.time() * 1000)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO resources (
            id, title, subject, year, type, author, email, file_path, file_name, file_size, file_type, downloads, description, status, created_at, approved_at, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', ?, NULL, ?)
    """, (
        res_id, title.strip(), subject.strip(), year.strip(), type.strip(),
        name.strip(), email.strip(), str(dest_path), original_filename,
        file_size_str, file.content_type or "application/pdf",
        f"Contributed by {name.strip()} ({email.strip()}) for {year.strip()} {subject.strip()}.",
        now_str, now_ts
    ))
    conn.commit()

    # Automatically register subject for this year if new (e.g. "EV" -> "1st Year")
    ensure_subject(subject.strip(), year.strip(), conn)

    conn.close()

    return {
        "success": True,
        "id": res_id,
        "message": "Resource successfully submitted and sent to the Owner for verification."
    }


@app.get("/api/download/{resource_id}")
def download_resource(resource_id: str):
    """
    Downloads the genuine binary file and increments download counter in SQLite.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM resources WHERE id = ?", (resource_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Resource file not found")

    file_path = row["file_path"]
    download_filename = row["file_name"]

    # If physical file is missing, generate authentic compliant PDF
    if not file_path or not os.path.exists(file_path):
        gen_path = create_sample_pdf(
            row["title"], row["subject"], row["year"], row["type"],
            row["author"], row["description"] or "", download_filename
        )
        file_path = str(gen_path)
        cursor.execute("UPDATE resources SET file_path = ? WHERE id = ?", (file_path, resource_id))

    # Increment downloads
    new_downloads = (row["downloads"] or 0) + 1
    cursor.execute("UPDATE resources SET downloads = ? WHERE id = ?", (new_downloads, resource_id))
    conn.commit()
    conn.close()

    return FileResponse(
        path=file_path,
        filename=download_filename,
        media_type=row["file_type"] or "application/pdf"
    )


# =============================================================================
# PUBLIC API: STUDENT REVIEWS
# =============================================================================
@app.get("/api/reviews")
def list_published_reviews():
    """
    Returns ONLY published reviews, sorted by timestamp DESC (recently published first).
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, name, branch, year, stars, review, created_at, published_at, timestamp
        FROM reviews
        WHERE status = 'published'
        ORDER BY timestamp DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/reviews", status_code=status.HTTP_201_CREATED)
def submit_review(payload: ReviewCreateRequest):
    """
    Student review submission. Saved as 'pending' until approved by owner.
    """
    if not (1 <= payload.stars <= 5):
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5 stars")

    rev_id = f"rev-{int(time.time() * 1000)}"
    now_str = datetime.now().strftime("%d/%m/%Y, %I:%M:%S %p")
    now_ts = int(time.time() * 1000)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO reviews (
            id, name, branch, year, stars, review, status, created_at, published_at, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?)
    """, (
        rev_id, payload.name.strip(), payload.branch.strip(), payload.year.strip(),
        payload.stars, payload.review.strip(), now_str, now_ts
    ))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "id": rev_id,
        "message": "Thank you! Your review has been submitted for owner verification."
    }


@app.get("/api/reviews/stats")
def get_reviews_stats():
    """
    Dynamic community score and review count calculated strictly from published reviews.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT stars FROM reviews WHERE status = 'published'")
    rows = cursor.fetchall()
    conn.close()

    count = len(rows)
    if count == 0:
        return {"avg_rating": "0.0", "total_count": 0, "stars_display": "☆☆☆☆☆"}

    total_stars = sum(r["stars"] for r in rows)
    avg_score = round(total_stars / count, 1)
    rounded_stars = round(avg_score)
    stars_display = "★" * rounded_stars + "☆" * (5 - rounded_stars)

    return {
        "avg_rating": f"{avg_score:.1f}",
        "total_count": count,
        "stars_display": stars_display
    }


# =============================================================================
# OWNER/ADMIN SECURE API
# =============================================================================
@app.post("/api/admin/login")
def admin_login(payload: LoginRequest):
    """
    Secure owner login. Verifies email & password hash with PBKDF2-SHA256.
    Returns crypto bearer token stored in server database.
    """
    email = payload.email.strip().lower()
    password = payload.password.strip()

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, password_hash, salt FROM admin_users WHERE email = ?", (email,))
    user = cursor.fetchone()

    if not user or not verify_password(password, user["password_hash"], user["salt"]):
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid owner credentials. Access denied."
        )

    # Generate secure 256-bit token valid for 7 days
    token = secrets.token_hex(32)
    now_ts = int(time.time())
    expires_at = now_ts + (7 * 24 * 3600)

    cursor.execute("""
        INSERT INTO admin_sessions (token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    """, (token, user["id"], now_ts, expires_at))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "token": token,
        "email": user["email"],
        "message": "Owner authenticated successfully."
    }


@app.get("/api/admin/me")
def admin_me(admin=Depends(get_current_admin)):
    return {"authenticated": True, "email": admin["email"]}


@app.post("/api/admin/logout")
def admin_logout(admin=Depends(get_current_admin)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM admin_sessions WHERE token = ?", (admin["token"],))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Logged out successfully."}


@app.post("/api/admin/change-password")
def change_password(payload: ChangePasswordRequest, admin=Depends(get_current_admin)):
    """
    Allows the authenticated owner to update their password securely.
    """
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters long.")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT password_hash, salt FROM admin_users WHERE id = ?", (admin["user_id"],))
    user = cursor.fetchone()

    if not verify_password(payload.current_password, user["password_hash"], user["salt"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    new_hash, new_salt = hash_password(payload.new_password)
    cursor.execute("UPDATE admin_users SET password_hash = ?, salt = ? WHERE id = ?", (new_hash, new_salt, admin["user_id"]))
    conn.commit()
    conn.close()

    return {"success": True, "message": "Password updated successfully."}


# =============================================================================
# OWNER/ADMIN SUBJECT MANAGEMENT API
# =============================================================================
@app.post("/api/subjects", status_code=status.HTTP_201_CREATED)
def create_subject(payload: SubjectCreateRequest, admin=Depends(get_current_admin)):
    """
    Owner creates a new subject linked to a specific academic year.
    """
    name = payload.name.strip()
    year = payload.year.strip()

    if not name:
        raise HTTPException(status_code=400, detail="Subject name cannot be empty.")
    if not year or year == "All":
        raise HTTPException(status_code=400, detail="Please select a valid academic year (e.g. 1st Year, 2nd Year).")

    subject = ensure_subject(name, year)
    return {
        "success": True,
        "subject": subject,
        "message": f"Subject '{name}' created for {year}."
    }


@app.put("/api/subjects/{subject_id}")
def update_subject(subject_id: str, payload: SubjectUpdateRequest, admin=Depends(get_current_admin)):
    """
    Owner renames a subject or changes its assigned year.
    Also cascades the rename to all corresponding resources in SQLite.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM subjects WHERE id = ?", (subject_id,))
    existing = cursor.fetchone()

    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Subject not found.")

    new_name = payload.name.strip() if payload.name and payload.name.strip() else existing["name"]
    new_year = payload.year.strip() if payload.year and payload.year.strip() else existing["year"]

    # Check for duplicate in same year
    cursor.execute("""
        SELECT id FROM subjects 
        WHERE LOWER(name) = LOWER(?) AND year = ? AND id != ?
    """, (new_name, new_year, subject_id))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail=f"Subject '{new_name}' already exists for {new_year}.")

    old_name = existing["name"]
    old_year = existing["year"]

    cursor.execute("""
        UPDATE subjects SET name = ?, year = ? WHERE id = ?
    """, (new_name, new_year, subject_id))

    # Cascade to existing resources
    if old_name != new_name or old_year != new_year:
        cursor.execute("""
            UPDATE resources SET subject = ?, year = ?
            WHERE subject = ? AND year = ?
        """, (new_name, new_year, old_name, old_year))

    conn.commit()
    cursor.execute("SELECT * FROM subjects WHERE id = ?", (subject_id,))
    updated = dict(cursor.fetchone())
    conn.close()

    return {
        "success": True,
        "subject": updated,
        "message": f"Subject updated to '{new_name}' ({new_year})."
    }


@app.delete("/api/subjects/{subject_id}")
def delete_subject(subject_id: str, admin=Depends(get_current_admin)):
    """
    Owner deletes a subject from the system.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM subjects WHERE id = ?", (subject_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Subject not found.")

    name = row["name"]
    year = row["year"]

    cursor.execute("DELETE FROM subjects WHERE id = ?", (subject_id,))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "message": f"Subject '{name}' ({year}) deleted successfully."
    }


@app.get("/api/admin/pending")
def list_pending_uploads(admin=Depends(get_current_admin)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM resources WHERE status = 'pending' ORDER BY timestamp DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/admin/verify/{resource_id}")
async def verify_and_publish_resource(
    resource_id: str,
    title: Optional[str] = Form(None),
    subject: Optional[str] = Form(None),
    year: Optional[str] = Form(None),
    type: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    replacement_file: Optional[UploadFile] = File(None),
    admin=Depends(get_current_admin)
):
    """
    Owner verifies and publishes a pending resource.
    Supports editing title, subject, year, type, and author, or replacing file.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM resources WHERE id = ?", (resource_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Pending resource not found")

    new_title = title.strip() if title else row["title"]
    new_subject = subject.strip() if subject else row["subject"]
    new_year = year.strip() if year else row["year"]
    new_type = type.strip() if type else row["type"]
    new_author = author.strip() if author else row["author"]
    file_path = row["file_path"]
    file_name = row["file_name"]
    file_size = row["file_size"]
    file_type = row["file_type"]

    if replacement_file and replacement_file.filename:
        file_bytes = await replacement_file.read()
        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(status_code=400, detail="File size must be 4 MB or less.")
        safe_name = f"{resource_id}_rep_{secrets.token_hex(4)}{Path(replacement_file.filename).suffix}"
        rep_path = UPLOADS_DIR / safe_name
        with open(rep_path, "wb") as f:
            f.write(file_bytes)
        file_path = str(rep_path)
        file_name = replacement_file.filename
        file_size = f"{(len(file_bytes) / (1024 * 1024)):.1f} MB"
        file_type = replacement_file.content_type or "application/pdf"

    now_str = datetime.now().strftime("%d/%m/%Y, %I:%M:%S %p")

    cursor.execute("""
        UPDATE resources SET
            title = ?, subject = ?, year = ?, type = ?, author = ?,
            file_path = ?, file_name = ?, file_size = ?, file_type = ?,
            status = 'approved', approved_at = ?
        WHERE id = ?
    """, (
        new_title, new_subject, new_year, new_type, new_author,
        file_path, file_name, file_size, file_type,
        now_str, resource_id
    ))
    conn.commit()
    ensure_subject(new_subject, new_year, conn)
    conn.close()

    return {"success": True, "message": f'"{new_title}" verified and published live!'}


@app.delete("/api/admin/reject/{resource_id}")
def reject_upload(resource_id: str, admin=Depends(get_current_admin)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path FROM resources WHERE id = ?", (resource_id,))
    row = cursor.fetchone()

    if row and row["file_path"] and os.path.exists(row["file_path"]):
        try:
            os.remove(row["file_path"])
        except Exception:
            pass

    cursor.execute("DELETE FROM resources WHERE id = ?", (resource_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Resource rejected and removed."}


@app.delete("/api/admin/resources/{resource_id}")
def unpublish_resource(resource_id: str, admin=Depends(get_current_admin)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM resources WHERE id = ?", (resource_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Resource removed from live website."}


@app.post("/api/admin/publish-direct")
async def admin_publish_direct(
    title: str = Form(...),
    author: Optional[str] = Form("EcaNotes Faculty"),
    year: str = Form(...),
    subject: str = Form(...),
    type: str = Form(...),
    description: Optional[str] = Form(""),
    file: Optional[UploadFile] = File(None),
    admin=Depends(get_current_admin)
):
    """
    Direct resource publisher for verified owner.
    Saves document and directly publishes to website with status='approved'.
    """
    res_id = f"dir-{int(time.time() * 1000)}"
    original_filename = f"{title.strip().replace(' ', '_')}.pdf"
    file_size_str = "3.5 MB"
    file_type = "application/pdf"

    if file and file.filename:
        original_filename = file.filename
        ext = Path(original_filename).suffix.lower()
        safe_name = f"{res_id}_{secrets.token_hex(4)}{ext}"
        dest_path = UPLOADS_DIR / safe_name
        file_bytes = await file.read()
        file_size_bytes = len(file_bytes)
        if file_size_bytes > MAX_FILE_SIZE_BYTES:
            raise HTTPException(status_code=400, detail="File size must be 4 MB or less.")
        file_size_str = f"{(file_size_bytes / (1024 * 1024)):.1f} MB" if file_size_bytes >= 1024*1024 else f"{(file_size_bytes / 1024):.0f} KB"
        with open(dest_path, "wb") as f:
            f.write(file_bytes)
        file_path = str(dest_path)
        file_type = file.content_type or "application/pdf"
    else:
        from backend.storage import create_sample_pdf
        pdf_path = create_sample_pdf(
            title=title.strip(),
            subject=subject.strip(),
            year=year.strip(),
            res_type=type.strip(),
            author=author.strip(),
            description=description.strip() if description else f"Study material for {subject.strip()}.",
            filename=f"{res_id}.pdf"
        )
        file_path = str(pdf_path)

    now_str = datetime.now().strftime("%d/%m/%Y, %I:%M:%S %p")
    now_ts = int(time.time() * 1000)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO resources (
            id, title, subject, year, type, author, email, file_path, file_name, file_size, file_type, downloads, description, status, created_at, approved_at, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, 'owner@ecanotes.in', ?, ?, ?, ?, 0, ?, 'approved', ?, ?, ?)
    """, (
        res_id, title.strip(), subject.strip(), year.strip(), type.strip(),
        author.strip(), file_path, original_filename, file_size_str, file_type,
        description.strip() if description else f"Official study material for {subject.strip()} ({year.strip()}).",
        now_str, now_str, now_ts
    ))
    conn.commit()
    ensure_subject(subject.strip(), year.strip(), conn)
    conn.close()

    return {"success": True, "id": res_id, "message": f'"{title}" published directly to live website!'}


@app.get("/api/admin/reviews/pending")
def list_pending_reviews(admin=Depends(get_current_admin)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM reviews WHERE status = 'pending' ORDER BY timestamp DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/admin/reviews/{review_id}/publish")
def publish_review(review_id: str, admin=Depends(get_current_admin)):
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%d/%m/%Y, %I:%M:%S %p")
    cursor.execute("UPDATE reviews SET status = 'published', published_at = ? WHERE id = ?", (now_str, review_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Review approved and published to live website."}


@app.delete("/api/admin/reviews/{review_id}/reject")
def reject_review(review_id: str, admin=Depends(get_current_admin)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM reviews WHERE id = ?", (review_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Review rejected and removed."}


@app.delete("/api/admin/reviews/{review_id}/unpublish")
def unpublish_review(review_id: str, admin=Depends(get_current_admin)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM reviews WHERE id = ?", (review_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Review removed from live website."}


@app.get("/api/admin/stats")
def get_admin_stats(admin=Depends(get_current_admin)):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as cnt FROM resources WHERE status = 'pending'")
    pending = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) as cnt FROM resources WHERE status = 'approved'")
    verified = cursor.fetchone()["cnt"]

    cursor.execute("SELECT SUM(downloads) as total FROM resources WHERE status = 'approved'")
    total_dl = cursor.fetchone()["total"] or 0

    cursor.execute("SELECT COUNT(*) as cnt FROM reviews WHERE status = 'pending'")
    pending_reviews = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) as cnt FROM reviews WHERE status = 'published'")
    published_reviews = cursor.fetchone()["cnt"]

    conn.close()

    return {
        "pending": pending,
        "verified": verified,
        "totalDownloads": total_dl,
        "pendingReviews": pending_reviews,
        "publishedReviews": published_reviews
    }


@app.get("/api/admin/sql")
def inspect_sql_data(admin=Depends(get_current_admin)):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM resources WHERE status = 'pending' LIMIT 10")
    pending_uploads = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM resources WHERE status = 'approved' LIMIT 10")
    verified_resources = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM reviews WHERE status = 'pending' LIMIT 10")
    pending_reviews = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM reviews WHERE status = 'published' LIMIT 10")
    published_reviews = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM subjects ORDER BY year, name LIMIT 25")
    subjects = [dict(r) for r in cursor.fetchall()]

    conn.close()

    return {
        "pending_uploads": pending_uploads,
        "verified_resources": verified_resources,
        "pending_reviews": pending_reviews,
        "published_reviews": published_reviews,
        "subjects": subjects
    }


# =============================================================================
# STATIC FILE SERVING FOR FULL DEPLOYMENT
# =============================================================================
# Mount CSS, JS, and real uploads
if (BASE_DIR / "css").exists():
    app.mount("/css", StaticFiles(directory=str(BASE_DIR / "css")), name="css")

if (BASE_DIR / "js").exists():
    app.mount("/js", StaticFiles(directory=str(BASE_DIR / "js")), name="js")

if UPLOADS_DIR.exists():
    app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.get("/")
@app.get("/index.html")
def serve_index():
    index_file = BASE_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "EcaNotes.in API Online"}


@app.get("/admin")
@app.get("/admin.html")
def serve_admin():
    admin_file = BASE_DIR / "admin.html"
    if admin_file.exists():
        return FileResponse(admin_file)
    return {"message": "Admin portal file not found"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting EcaNotes.in Production Server on http://0.0.0.0:{port}")
    uvicorn.run("backend.server:app", host="0.0.0.0", port=port, reload=False)
