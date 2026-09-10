"""
EcaNotes.in - File Storage and Authentic PDF Generator
Generates compliant %PDF-1.4 binary documents on the fly and saves uploaded files.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def clean_text(text: str) -> str:
    if not text:
        return ""
    return text.replace("\r", " ").replace("\n", " ").replace("(", "[").replace(")", "]")


def create_sample_pdf(title: str, subject: str, year: str, res_type: str, author: str, description: str, filename: str) -> Path:
    """
    Generates a genuine %PDF-1.4 binary document with high quality academic formatting.
    Compatible with Adobe Acrobat, Chrome, Edge, Safari, iOS, and Android.
    """
    safe_name = filename if filename.endswith(".pdf") else f"{filename}.pdf"
    file_path = UPLOADS_DIR / safe_name

    # If file already exists, avoid regenerating
    if file_path.exists() and file_path.stat().st_size > 100:
        return file_path

    t_clean = clean_text(title)
    s_clean = clean_text(subject)
    y_clean = clean_text(year)
    type_clean = clean_text(res_type)
    auth_clean = clean_text(author)
    desc_clean = clean_text(description)

    stream_lines = [
        "q",
        # Navy Header Banner (#0F1E36)
        "0.059 0.118 0.212 rg",
        "36 690 540 70 re",
        "f",
        # Emerald/Cyan accent line
        "0.063 0.725 0.506 rg",
        "36 686 540 4 re",
        "f",
        # Header text
        "BT",
        "1 1 1 rg",
        "/F1 22 Tf",
        "50 728 Td",
        "(EcaNotes.in) Tj",
        "/F2 10 Tf",
        "0 -18 Td",
        "(COLLEGE STUDY MATERIAL - VERIFIED ACADEMIC RESOURCE) Tj",
        "ET",
        # Resource Info Slate Box
        "0.96 0.98 1 rg",
        "36 530 540 140 re",
        "f",
        "0.8 0.85 0.9 RG",
        "1 w",
        "36 530 540 140 re",
        "S",
        # Title & details
        "BT",
        "0.059 0.118 0.212 rg",
        "/F1 15 Tf",
        "50 635 Td",
        f"({t_clean[:55]}) Tj",
        "/F2 10 Tf",
        "0 -24 Td",
        "0.2 0.3 0.4 rg",
        f"(Subject: {s_clean}   |   Level: {y_clean}   |   Category: {type_clean}) Tj",
        "0 -16 Td",
        f"(Verified Contributor: {auth_clean}   |   Portal: https://ecanotes.in) Tj",
        "0 -16 Td",
        "(Access: Free academic download for university students) Tj",
        "ET",
        # Syllabus & Highlights
        "BT",
        "0.059 0.118 0.212 rg",
        "/F1 13 Tf",
        "50 495 Td",
        "(1. RESOURCE SUMMARY & KEY HIGHLIGHTS) Tj",
        "/F2 10 Tf",
        "0.25 0.3 0.38 rg",
        "0 -18 Td",
        f"({desc_clean[:85]}) Tj",
        "0 -14 Td",
        f"({desc_clean[85:170]}) Tj",
        "0 -24 Td",
        "/F1 11 Tf",
        "0.059 0.118 0.212 rg",
        "(Content Verification Checkpoints:) Tj",
        "/F2 10 Tf",
        "0.25 0.3 0.38 rg",
        "0 -16 Td",
        "(  * Accurate syllabus coverage aligned with AICTE and State University curriculum) Tj",
        "0 -14 Td",
        "(  * Verified lab experiments, solved theoretical models, and derivation steps) Tj",
        "0 -14 Td",
        "(  * Verified viva-voce questions and quick-revision exam formulas) Tj",
        "0 -14 Td",
        "(  * Clean, readable diagrams and step-by-step program execution outputs) Tj",
        "ET",
        # Verification Seal Box
        "0.92 0.98 0.94 rg",
        "36 210 540 60 re",
        "f",
        "0.063 0.725 0.506 RG",
        "1.5 w",
        "36 210 540 60 re",
        "S",
        "BT",
        "0.02 0.45 0.3 rg",
        "/F1 11 Tf",
        "50 248 Td",
        "(OFFICIALLY VERIFIED & APPROVED BY ECANOTES ACADEMIC PORTAL) Tj",
        "/F2 9 Tf",
        "0.1 0.2 0.15 rg",
        "0 -16 Td",
        "(This study resource has passed peer moderation for academic rigor and formatting.) Tj",
        "ET",
        # Footer rule & text
        "0.8 0.85 0.9 RG",
        "0.5 w",
        "36 70 540 0.5 re",
        "S",
        "BT",
        "0.5 0.55 0.6 rg",
        "/F2 8.5 Tf",
        "50 52 Td",
        "(EcaNotes.in - College Study Material By The Students, For The Students. Free download for educational use.) Tj",
        "ET",
        "Q"
    ]

    stream_content = "\n".join(stream_lines)
    stream_bytes = stream_content.encode("latin-1")
    stream_len = len(stream_bytes)

    # Construct genuine PDF-1.4 file
    parts = []
    offsets = []

    def append_obj(obj_str: str):
        offsets.append(sum(len(p) for p in parts))
        parts.append(obj_str.encode("latin-1"))

    # Header
    parts.append(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")

    # Obj 1: Catalog
    append_obj("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")

    # Obj 2: Pages
    append_obj("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")

    # Obj 3: Page
    append_obj("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n")

    # Obj 4: Stream
    offsets.append(sum(len(p) for p in parts))
    stream_header = f"4 0 obj\n<< /Length {stream_len} >>\nstream\n".encode("latin-1")
    stream_footer = b"\nendstream\nendobj\n"
    parts.append(stream_header + stream_bytes + stream_footer)

    # Obj 5: Font Helvetica-Bold
    append_obj("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n")

    # Obj 6: Font Helvetica
    append_obj("6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n")

    # Xref & Trailer
    xref_offset = sum(len(p) for p in parts)
    xref_str = f"xref\n0 7\n0000000000 65535 f \n"
    for off in offsets:
        xref_str += f"{off:010d} 00000 n \n"
    xref_str += f"trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n"
    parts.append(xref_str.encode("latin-1"))

    with open(file_path, "wb") as f:
        for p in parts:
            f.write(p)

    return file_path
