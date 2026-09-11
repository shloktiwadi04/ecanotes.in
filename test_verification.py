"""
EcaNotes.in - Comprehensive End-to-End Verification Test
"""
import sys
import os
import json
import urllib.request
import urllib.parse

import subprocess
import time
import socket

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://127.0.0.1:8000"

def is_server_running():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.0)
        s.connect(("127.0.0.1", 8000))
        s.close()
        return True
    except Exception:
        return False

def log_pass(msg):
    print(f"  [PASS] {msg}")

def log_fail(msg):
    print(f"  [FAIL] {msg}")
    sys.exit(1)

def http_get(path, headers=None):
    req = urllib.request.Request(f"{BASE_URL}{path}", headers=headers or {})
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)

def http_post_json(path, data, headers=None):
    body = json.dumps(data).encode("utf-8")
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(f"{BASE_URL}{path}", data=body, headers=req_headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8")), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8")), dict(e.headers)

def http_put_json(path, data, headers=None):
    body = json.dumps(data).encode("utf-8")
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(f"{BASE_URL}{path}", data=body, headers=req_headers, method="PUT")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8")), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8")), dict(e.headers)

def http_delete(path, headers=None):
    req = urllib.request.Request(f"{BASE_URL}{path}", headers=headers or {}, method="DELETE")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8")), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8")), dict(e.headers)

def http_post_multipart(path, fields, files, headers=None):
    boundary = "----WebKitFormBoundaryEcaTest7MA4YWxkTrZu0gW"
    body = bytearray()

    for k, v in fields.items():
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode("utf-8"))

    for k, (filename, filedata, content_type) in files.items():
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{filename}\"\r\nContent-Type: {content_type}\r\n\r\n".encode("utf-8"))
        body.extend(filedata)
        body.extend(b"\r\n")

    body.extend(f"--{boundary}--\r\n".encode("utf-8"))

    req_headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    if headers:
        req_headers.update(headers)

    req = urllib.request.Request(f"{BASE_URL}{path}", data=bytes(body), headers=req_headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8")), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8")), dict(e.headers)

def run_all_tests():
    print("================================================================")
    print("STARTING ECANOTES.IN AUTOMATED VERIFICATION SUITE")
    print("================================================================")

    # 1. Test Static Pages
    print("\n1. Testing Static HTML Pages...")
    status, body, _ = http_get("/")
    if status == 200 and b"EcaNotes.in" in body:
        log_pass("Public landing page (/) served with status 200")
    else:
        log_fail(f"Failed to serve index.html (status {status})")

    status, body, _ = http_get("/admin.html")
    if status == 200 and b"Owner Portal" in body:
        # Check that NO default password or hints exist in HTML
        if b"admin123" in body:
            log_fail("CRITICAL: 'admin123' found in admin.html!")
        if b"auth-creds-hint" in body:
            log_fail("CRITICAL: 'auth-creds-hint' block found in admin.html!")
        log_pass("Admin portal (/admin.html) served cleanly with zero credentials exposed")
    else:
        log_fail(f"Failed to serve admin.html (status {status})")

    # 2. Test Study Resources & "Practical Files"
    print("\n2. Testing Study Resources & 'Practical Files' category...")
    status, resources_raw, _ = http_get("/api/resources")
    resources = json.loads(resources_raw.decode("utf-8"))
    log_pass(f"Total live resources returned: {len(resources)}")

    # Filter for Practical Files
    status, pf_raw, _ = http_get("/api/resources?type=Practical%20Files")
    pf_resources = json.loads(pf_raw.decode("utf-8"))
    if len(pf_resources) > 0 and all("Practical" in r["type"] for r in pf_resources):
        log_pass(f"Filtering by 'Practical Files' works perfectly: found {len(pf_resources)} practical records")
        for pfr in pf_resources:
            print(f"      - [{pfr['year']}] {pfr['title']} ({pfr['subject']})")
    else:
        log_fail("Practical Files filter returned no results or incorrect types")

    # 3. Test Reviews & Dynamic Stats
    print("\n3. Testing Reviews API & Dynamic Rating Stats...")
    status, revs_raw, _ = http_get("/api/reviews")
    published_revs = json.loads(revs_raw.decode("utf-8"))
    log_pass(f"Published reviews returned: {len(published_revs)}")

    status, stats_raw, _ = http_get("/api/reviews/stats")
    stats = json.loads(stats_raw.decode("utf-8"))
    log_pass(f"Dynamic community rating: {stats['avg_rating']}/5 from {stats['total_count']} verified reviews ({stats['stars_display']})")

    # 4. Test Student Resource Upload with Real PDF
    print("\n4. Testing Student Resource Contribution...")
    dummy_pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF"
    upload_fields = {
        "name": "Rahul Sharma",
        "email": "rahul.sharma@example.edu",
        "year": "2nd Year",
        "subject": "Data Structures & Algorithms",
        "type": "Practical Files",
        "title": "DSA Binary Trees and Graphs Lab Experiments Complete"
    }
    upload_files = {
        "file": ("DSA_Binary_Trees_Lab.pdf", dummy_pdf, "application/pdf")
    }
    status, upload_res, _ = http_post_multipart("/api/resources/upload", upload_fields, upload_files)
    if status == 201 and upload_res.get("success"):
        new_resource_id = upload_res["id"]
        log_pass(f"Student resource uploaded successfully with id: {new_resource_id} (Status: pending)")
    else:
        log_fail(f"Student upload failed: {upload_res}")

    # Check that pending upload does NOT appear in public resources
    status, public_check, _ = http_get("/api/resources")
    pub_ids = [r["id"] for r in json.loads(public_check.decode("utf-8"))]
    if new_resource_id not in pub_ids:
        log_pass("Pending resource is correctly NOT visible on the public website")
    else:
        log_fail("Security violation: pending resource is visible publicly before owner verification!")

    # 5. Test Student Review Submission
    print("\n5. Testing Student Review Submission & Approval Gate...")
    review_data = {
        "name": "Ananya Sen",
        "branch": "ECE",
        "year": "3rd Year",
        "stars": 5,
        "review": "The newly added Practical Files for 3rd year saved our whole semester lab viva!"
    }
    status, review_res, _ = http_post_json("/api/reviews", review_data)
    if status == 201 and review_res.get("success"):
        new_review_id = review_res["id"]
        log_pass(f"Review submitted successfully with id: {new_review_id} (Status: pending)")
    else:
        log_fail(f"Review submission failed: {review_res}")

    # Check that pending review does NOT appear in public reviews
    status, pub_rev_check, _ = http_get("/api/reviews")
    pub_rev_ids = [r["id"] for r in json.loads(pub_rev_check.decode("utf-8"))]
    if new_review_id not in pub_rev_ids:
        log_pass("Pending review is correctly NOT visible on the public website")
    else:
        log_fail("Security violation: pending review is visible publicly before owner approval!")

    # 6. Test Owner Authentication Security
    print("\n6. Testing Owner Authentication Security...")
    # Invalid password attempt
    status, wrong_auth, _ = http_post_json("/api/admin/login", {"email": "owner@ecanotes.in", "password": "wrong_password_999"})
    if status == 401:
        log_pass("Rejected unauthorized login attempt with 401 Unauthorized")
    else:
        log_fail(f"Unauthorized login should have failed with 401, got {status}")

    # Valid owner login
    status, valid_auth, _ = http_post_json("/api/admin/login", {"email": "owner@ecanotes.in", "password": "admin123"})
    if status == 200 and "token" in valid_auth:
        admin_token = valid_auth["token"]
        log_pass(f"Owner authenticated successfully! Received secure bearer token (length: {len(admin_token)})")
    else:
        log_fail(f"Owner login failed: {valid_auth}")

    auth_header = {"Authorization": f"Bearer {admin_token}"}

    # Verify session with /api/admin/me
    status, me_res, _ = http_get("/api/admin/me", auth_header)
    if status == 200:
        log_pass("Bearer token validated via /api/admin/me")
    else:
        log_fail("Failed to validate bearer token")

    # 7. Test Admin Moderation Queue
    print("\n7. Testing Owner Moderation Queues...")
    status, pending_up_raw, _ = http_get("/api/admin/pending", auth_header)
    pending_uploads = json.loads(pending_up_raw.decode("utf-8"))
    pending_up_ids = [u["id"] for u in pending_uploads]
    if new_resource_id in pending_up_ids:
        log_pass(f"Student submission '{new_resource_id}' is queued in owner pending uploads")
    else:
        log_fail("Pending upload not found in admin queue")

    status, pending_rev_raw, _ = http_get("/api/admin/reviews/pending", auth_header)
    pending_reviews = json.loads(pending_rev_raw.decode("utf-8"))
    pending_rev_ids = [r["id"] for r in pending_reviews]
    if new_review_id in pending_rev_ids:
        log_pass(f"Student review '{new_review_id}' is queued in owner pending reviews")
    else:
        log_fail("Pending review not found in admin queue")

    # 8. Owner Moderates & Publishes Resource
    print("\n8. Testing Owner Resource Verification & Publishing...")
    verify_fields = {
        "title": "DSA Complete Binary Trees & Graphs Lab Experiments (Verified Faculty Edition)",
        "author": "Rahul Sharma (Reviewed by ECA Academic Team)",
        "year": "2nd Year",
        "subject": "Data Structures & Algorithms",
        "type": "Practical Files"
    }
    status, verify_res, _ = http_post_multipart(f"/api/admin/verify/{new_resource_id}", verify_fields, {}, auth_header)
    if status == 200 and verify_res.get("success"):
        log_pass(f"Owner approved & published resource: {verify_res['message']}")
    else:
        log_fail(f"Owner verification failed: {verify_res}")

    # Verify that it is now immediately live on the public site
    status, pub_check_2, _ = http_get("/api/resources?type=Practical%20Files")
    pub_list_2 = json.loads(pub_check_2.decode("utf-8"))
    matching = [r for r in pub_list_2 if r["id"] == new_resource_id]
    if matching and "Verified Faculty Edition" in matching[0]["title"]:
        log_pass(f"Verified resource is now LIVE on public website with updated title: '{matching[0]['title']}'")
    else:
        log_fail("Approved resource failed to appear in public resources")

    # 9. Owner Publishes Review
    print("\n9. Testing Owner Review Publishing...")
    status, pub_rev_action, _ = http_post_json(f"/api/admin/reviews/{new_review_id}/publish", {}, auth_header)
    if status == 200 and pub_rev_action.get("success"):
        log_pass("Owner published the student review")
    else:
        log_fail(f"Failed to publish review: {pub_rev_action}")

    # Verify that review is now live in public reviews
    status, pub_revs_after, _ = http_get("/api/reviews")
    revs_after = json.loads(pub_revs_after.decode("utf-8"))
    matching_rev = [r for r in revs_after if r["id"] == new_review_id]
    if matching_rev:
        log_pass(f"Published review is now visible on public site: by {matching_rev[0]['name']} ({matching_rev[0]['stars']} stars)")
    else:
        log_fail("Published review failed to appear in public reviews")

    # 10. Test Genuine PDF File Download & Counter
    print("\n10. Testing Authentic PDF Download Stream & Counter...")
    # First get current download count
    status, detail_raw, _ = http_get(f"/api/resources/{new_resource_id}")
    initial_downloads = json.loads(detail_raw.decode("utf-8"))["downloads"]

    status, pdf_stream, headers = http_get(f"/api/download/{new_resource_id}")
    if status == 200 and pdf_stream.startswith(b"%PDF-1.4"):
        content_disp = headers.get("content-disposition", "")
        log_pass(f"Download streamed genuine PDF (%PDF-1.4 header, size {len(pdf_stream)} bytes)")
        log_pass(f"Content-Disposition header: {content_disp}")
    else:
        log_fail(f"PDF download failed: status {status}, data start: {pdf_stream[:20]}")

    # Check that download counter was incremented
    status, detail_after, _ = http_get(f"/api/resources/{new_resource_id}")
    new_downloads = json.loads(detail_after.decode("utf-8"))["downloads"]
    if new_downloads == initial_downloads + 1:
        log_pass(f"Download count correctly incremented from {initial_downloads} to {new_downloads}")
    else:
        log_fail(f"Download counter did not increment properly (was {initial_downloads}, now {new_downloads})")

    # 11. Test Admin Direct Resource Publisher
    print("\n11. Testing Owner Direct Resource Publisher...")
    direct_fields = {
        "title": "Operating Systems System Calls Lab Record",
        "author": "Prof. S. K. Gupta",
        "year": "3rd Year",
        "subject": "Data Structures & Algorithms",
        "type": "Practical Files",
        "description": "Fork, exec, wait, pipe, and shared memory IPC implementations."
    }
    status, direct_res, _ = http_post_multipart("/api/admin/publish-direct", direct_fields, {}, auth_header)
    if status == 200 and direct_res.get("success"):
        log_pass(f"Direct publishing worked: {direct_res['message']}")
    else:
        log_fail(f"Direct publishing failed: {direct_res}")

    # 12. Test Dynamic Subjects API & Year Filtering
    print("\n12. Testing Dynamic Year-Linked Subjects API...")
    status, subjs_raw, _ = http_get("/api/subjects?year=1st%20Year")
    y1_subjects = json.loads(subjs_raw.decode("utf-8"))
    y1_names = [s["name"] for s in y1_subjects]
    log_pass(f"1st Year dynamic subjects returned ({len(y1_subjects)}): {', '.join(y1_names[:4])}...")

    status, subjs_raw2, _ = http_get("/api/subjects?year=2nd%20Year")
    y2_subjects = json.loads(subjs_raw2.decode("utf-8"))
    y2_names = [s["name"] for s in y2_subjects]
    log_pass(f"2nd Year dynamic subjects returned ({len(y2_subjects)}): {', '.join(y2_names[:4])}...")

    # Ensure 1st Year and 2nd Year subjects do not overlap inappropriately
    if "Digital Electronics" in y2_names and "Digital Electronics" not in y1_names:
        log_pass("Year linkage confirmed: 'Digital Electronics' belongs to 2nd Year and not 1st Year")
    else:
        log_fail(f"Year linkage mismatch: y1={y1_names}, y2={y2_names}")

    # 13. Test Owner Adding New Subject (e.g. "EV" under "1st Year")
    print("\n13. Testing Owner Subject Creation (e.g. 'EV' for '1st Year')...")
    status, ev_create, _ = http_post_json("/api/subjects", {"name": "EV", "year": "1st Year"}, auth_header)
    if status in [200, 201] and ev_create.get("success"):
        ev_subj = ev_create.get("subject", {})
        ev_id = ev_subj.get("id")
        log_pass(f"Owner created subject 'EV' (id: {ev_id}) under 1st Year")
    else:
        log_fail(f"Failed to create subject EV: {ev_create}")

    # 14. Verify EV appears in 1st Year and NOT in 2nd Year
    print("\n14. Verifying Year-Subject Linkage for 'EV'...")
    status, y1_after_raw, _ = http_get("/api/subjects?year=1st%20Year")
    y1_after_names = [s["name"] for s in json.loads(y1_after_raw.decode("utf-8"))]
    status, y2_after_raw, _ = http_get("/api/subjects?year=2nd%20Year")
    y2_after_names = [s["name"] for s in json.loads(y2_after_raw.decode("utf-8"))]

    if "EV" in y1_after_names:
        log_pass("'EV' is now dynamically available in 1st Year filter!")
    else:
        log_fail(f"'EV' missing from 1st Year subjects: {y1_after_names}")

    if "EV" not in y2_after_names:
        log_pass("'EV' is NOT present in 2nd Year subjects (strictly year-linked)")
    else:
        log_fail(f"'EV' incorrectly appeared in 2nd Year subjects!")

    # 15. Test Auto-Discovery on Student Upload
    print("\n15. Testing Automatic Subject Discovery on Student Upload...")
    upload_fields = {
        "name": "Sanya Malhotra",
        "email": "sanya@college.edu",
        "year": "3rd Year",
        "subject": "Microprocessors & Interfacing",
        "type": "Notes",
        "title": "8086 Pin Diagram & Architecture Complete Handwritten Notes"
    }
    status, upload_auto, _ = http_post_multipart("/api/resources/upload", upload_fields, upload_files)
    if status == 201 and upload_auto.get("success"):
        log_pass("Student uploaded note with new subject 'Microprocessors & Interfacing'")
    else:
        log_fail(f"Student upload failed: {upload_auto}")

    # Verify that "Microprocessors & Interfacing" was automatically discovered and added to 3rd Year
    status, y3_after_raw, _ = http_get("/api/subjects?year=3rd%20Year")
    y3_after_names = [s["name"] for s in json.loads(y3_after_raw.decode("utf-8"))]
    if "Microprocessors & Interfacing" in y3_after_names:
        log_pass("Auto-Discovery PASSED: 'Microprocessors & Interfacing' is automatically registered in 3rd Year subjects!")
    else:
        log_fail(f"Auto-Discovery failed: {y3_after_names}")

    # 16. Test Owner Updating Subject (Rename & Cascade)
    print("\n16. Testing Owner Subject Update & Cascade...")
    status, upd_res, _ = http_put_json(f"/api/subjects/{ev_id}", {"name": "Electric Vehicles (EV)", "year": "1st Year"}, auth_header)
    if status == 200 and upd_res.get("success"):
        log_pass(f"Subject successfully updated/renamed: {upd_res['message']}")
    else:
        log_fail(f"Failed to update subject: {upd_res}")

    # Verify updated name in 1st Year
    status, y1_upd_raw, _ = http_get("/api/subjects?year=1st%20Year")
    y1_upd_names = [s["name"] for s in json.loads(y1_upd_raw.decode("utf-8"))]
    if "Electric Vehicles (EV)" in y1_upd_names and "EV" not in y1_upd_names:
        log_pass("Renamed subject 'Electric Vehicles (EV)' correctly returned in 1st Year")
    else:
        log_fail(f"Updated subject mismatch in 1st Year: {y1_upd_names}")

    # 17. Test Owner Deleting Subject
    print("\n17. Testing Owner Subject Deletion...")
    status, del_res, _ = http_delete(f"/api/subjects/{ev_id}", auth_header)
    if status == 200 and del_res.get("success"):
        log_pass(f"Subject deleted: {del_res['message']}")
    else:
        log_fail(f"Failed to delete subject: {del_res}")

    # Verify deleted from 1st Year
    status, y1_del_raw, _ = http_get("/api/subjects?year=1st%20Year")
    y1_del_names = [s["name"] for s in json.loads(y1_del_raw.decode("utf-8"))]
    if "Electric Vehicles (EV)" not in y1_del_names:
        log_pass("Subject confirmed deleted from 1st Year list")
    else:
        log_fail("Subject still found in 1st Year list after deletion")

    # 18. Test Maximum 4 MB File Size Validation
    print("\n18. Testing Maximum 4 MB File Size Validation...")
    # Create oversized 5 MB payload
    oversized_data = b"%PDF-1.4\n" + (b"A" * (5 * 1024 * 1024))
    oversized_files = {
        "file": ("Huge_Document.pdf", oversized_data, "application/pdf")
    }
    oversized_fields = {
        "name": "Oversized Tester",
        "email": "tester@college.edu",
        "year": "1st Year",
        "subject": "Engineering Physics",
        "type": "Notes",
        "title": "5MB Physics Notes"
    }
    status, over_resp, _ = http_post_multipart("/api/resources/upload", oversized_fields, oversized_files)
    if status == 400 and "4 MB" in str(over_resp):
        log_pass(f"Rejected oversized (5 MB) student upload with HTTP 400: '{over_resp.get('detail')}'")
    else:
        log_fail(f"Oversized upload should have been rejected with 400: status={status}, resp={over_resp}")

    # Test direct publishing rejection for > 4 MB
    direct_over_fields = {
        "title": "Huge Faculty Book",
        "author": "ECA Faculty",
        "year": "1st Year",
        "subject": "Engineering Mathematics",
        "type": "Reference Book"
    }
    status, direct_over_resp, _ = http_post_multipart("/api/admin/publish-direct", direct_over_fields, oversized_files, auth_header)
    if status == 400 and "4 MB" in str(direct_over_resp):
        log_pass(f"Rejected oversized direct upload with HTTP 400: '{direct_over_resp.get('detail')}'")
    else:
        log_fail(f"Oversized direct publish should have been rejected with 400: status={status}, resp={direct_over_resp}")

    # 19. Test Public UI Structure & Clean Hero / Removed Sections
    print("\n19. Testing Public UI Structure, Clean Hero & Removed Sections...")
    status, index_bytes, _ = http_get("/")
    index_html = index_bytes.decode("utf-8")

    # Navbar check
    if "data-section=\"home\">HOME</a>" in index_html and \
       "data-section=\"resourcesDisplaySection\">AVAILABLE RESOURCES</a>" in index_html and \
       "data-section=\"reviews\">REVIEWS</a>" in index_html and \
       "data-section=\"contribute\">CONTRIBUTION</a>" in index_html:
        log_pass("Main navbar contains exactly the 4 required sections: HOME, AVAILABLE RESOURCES, REVIEWS, CONTRIBUTION")
    else:
        log_fail("Main navbar is missing one or more required sections")

    # Removed sections check
    if "What We Offer" not in index_html and "offerSection" not in index_html:
        log_pass("'What We Offer' section completely removed from public UI")
    else:
        log_fail("'What We Offer' section still found in index.html")

    if "Expanding Beyond 1st Year Soon" not in index_html and "expansion-banner" not in index_html:
        log_pass("'Expanding Beyond 1st Year Soon' banner completely removed from public UI")
    else:
        log_fail("'Expanding Beyond 1st Year Soon' banner still found in index.html")

    # Clean hero check
    if "hero-clean" in index_html and "hero-title-clean" in index_html and "peer-hub-card" not in index_html:
        log_pass("Clean, minimal, text-focused hero section active (bulky cards removed)")
    else:
        log_fail("Hero section does not match minimal text-focused specifications")

    # Footer check
    if "Created by Shlok Tiwadi" in index_html and "footer-bottom-centered" in index_html:
        log_pass("Footer centered attribution 'Created by Shlok Tiwadi' present")
    else:
        log_fail("Footer centered attribution missing")

    if ">LEGAL<" not in index_html and "LEGAL</h4>" not in index_html:
        log_pass("LEGAL footer column completely removed")
    else:
        log_fail("LEGAL footer column still present in index.html")

    # Branch filter wrap & load more button check
    if "branchFilterWrap" in index_html and "loadMoreResourcesBtn" in index_html:
        log_pass("Dynamic branch filter container & 'Load More Resources' button present in DOM")
    else:
        log_fail("Branch filter container or Load More button missing from index.html")

    # 20. Test Admin Portal Branding & Streamlined UI
    print("\n20. Testing Admin Portal Branding & Streamlined UI...")
    status, admin_bytes, _ = http_get("/admin.html")
    admin_html = admin_bytes.decode("utf-8")

    if "ECANotes Admin Portal" in admin_html:
        log_pass("Admin portal title & branding updated to 'ECANotes Admin Portal'")
    else:
        log_fail("Admin portal title does not contain 'ECANotes Admin Portal'")

    if "Storage & SQL Online" not in admin_html:
        log_pass("'Storage & SQL Online' indicator successfully removed")
    else:
        log_fail("'Storage & SQL Online' indicator still present in admin.html")

    if "SQL Database Inspector" not in admin_html and "pane-sql" not in admin_html:
        log_pass("'SQL Database Inspector' tab and pane successfully removed")
    else:
        log_fail("'SQL Database Inspector' still present in admin.html")

    if "adminStatPublishedData" in admin_html:
        log_pass("'Published Data' stat card present in admin dashboard")
    else:
        log_fail("'Published Data' stat card missing from admin.html")

    if "directBranch" in admin_html:
        log_pass("Direct Publisher includes branch selection dropdown")
    else:
        log_fail("Direct Publisher missing branch selection dropdown")

    # 21. Test PDF Preview vs Download Header Differentiation
    print("\n21. Testing PDF Inline Preview Stream vs Download Attachment...")
    status, prev_bytes, prev_headers = http_get(f"/api/preview/{new_resource_id}")
    prev_disp = prev_headers.get("content-disposition", "")
    if status == 200 and "inline" in prev_disp and "attachment" not in prev_disp:
        log_pass(f"GET /api/preview/ streams PDF with Content-Disposition: inline ('{prev_disp}')")
    else:
        log_fail(f"Preview endpoint did not return inline disposition: status={status}, disp={prev_disp}")

    status, dl_bytes, dl_headers = http_get(f"/api/download/{new_resource_id}")
    dl_disp = dl_headers.get("content-disposition", "")
    if status == 200 and "attachment" in dl_disp:
        log_pass(f"GET /api/download/ returns Content-Disposition: attachment ('{dl_disp}')")
    else:
        log_fail(f"Download endpoint did not return attachment disposition: status={status}, disp={dl_disp}")

    # 22. Test Dynamic Branch Filtering in Resources API
    print("\n22. Testing Dynamic Branch Filtering in Backend API...")
    status, branch_res_raw, _ = http_get("/api/resources?year=2nd%20Year&branch=CSE")
    cse_resources = json.loads(branch_res_raw.decode("utf-8"))
    if all(r.get("branch") in ["CSE", "All"] for r in cse_resources):
        log_pass(f"Filtering by branch=CSE returned {len(cse_resources)} resources, all with branch 'CSE' or 'All'")
    else:
        log_fail(f"Branch filtering returned mismatched branches: {cse_resources}")

    # 23. Test Direct Publishing with Specific Branch
    print("\n23. Testing Direct Publishing with Specific Branch...")
    direct_branch_fields = {
        "title": "Computer Networks TCP/IP Socket Programming",
        "author": "Prof. A. K. Verma",
        "year": "3rd Year",
        "branch": "IT",
        "subject": "Data Structures & Algorithms",
        "type": "Practical Files",
        "description": "Socket API client-server implementations in C/Python."
    }
    status, dir_branch_res, _ = http_post_multipart("/api/admin/publish-direct", direct_branch_fields, {}, auth_header)
    if status == 200 and dir_branch_res.get("success"):
        dir_res_id = dir_branch_res["id"]
        log_pass(f"Direct published resource with branch 'IT' (id: {dir_res_id})")
    else:
        log_fail(f"Direct publishing with branch failed: {dir_branch_res}")

    # Verify that query for branch=IT returns it
    status, it_raw, _ = http_get("/api/resources?year=3rd%20Year&branch=IT")
    it_resources = json.loads(it_raw.decode("utf-8"))
    if any(r["id"] == dir_res_id and r.get("branch") == "IT" for r in it_resources):
        log_pass(f"Direct published resource confirmed live in branch 'IT' search results")
    else:
        log_fail(f"Published resource not found under branch IT: {it_resources}")

    # 24. Test Student Upload & Moderation with Branch
    print("\n24. Testing Student Upload and Admin Moderation with Branch...")
    cyb_upload_fields = {
        "name": "Kavita Rao",
        "email": "kavita@college.edu",
        "year": "3rd Year",
        "branch": "CYB",
        "subject": "Cyber Security Fundamentals",
        "type": "Notes",
        "title": "Applied Cryptography and PKI Infrastructure Complete Notes"
    }
    status, cyb_upload_res, _ = http_post_multipart("/api/resources/upload", cyb_upload_fields, upload_files)
    if status == 201 and cyb_upload_res.get("success"):
        cyb_id = cyb_upload_res["id"]
        log_pass(f"Student uploaded resource with branch 'CYB' (id: {cyb_id})")
    else:
        log_fail(f"Upload with branch failed: {cyb_upload_res}")

    # Owner verifies with branch 'CYB'
    cyb_verify_fields = {
        "title": "Applied Cryptography and PKI Infrastructure Complete Notes (Verified)",
        "author": "Kavita Rao",
        "year": "3rd Year",
        "branch": "CYB",
        "subject": "Cyber Security Fundamentals",
        "type": "Notes"
    }
    status, cyb_ver_res, _ = http_post_multipart(f"/api/admin/verify/{cyb_id}", cyb_verify_fields, {}, auth_header)
    if status == 200 and cyb_ver_res.get("success"):
        log_pass(f"Owner verified and published resource with branch 'CYB'")
    else:
        log_fail(f"Verification with branch failed: {cyb_ver_res}")

    # Verify it is in public resources under CYB
    status, cyb_pub_raw, _ = http_get("/api/resources?year=3rd%20Year&branch=CYB")
    cyb_pub = json.loads(cyb_pub_raw.decode("utf-8"))
    if any(r["id"] == cyb_id and r.get("branch") == "CYB" for r in cyb_pub):
        log_pass("Verified CYB resource is live and discoverable under branch 'CYB'")
    else:
        log_fail("Verified CYB resource missing from branch query")

    # 25. Test Dynamic Published Data Storage Stat Calculation
    print("\n25. Testing Dynamic Published Data Storage Stat Calculation...")
    status, admin_stats_raw, _ = http_get("/api/admin/stats", auth_header)
    admin_stats = json.loads(admin_stats_raw.decode("utf-8"))
    pub_data_str = admin_stats.get("publishedData")
    pub_data_bytes = admin_stats.get("publishedDataBytes", 0)

    if pub_data_str and any(unit in pub_data_str for unit in ["MB", "KB", "GB", "B"]) and pub_data_bytes > 0:
        log_pass(f"Dynamic 'Published Data' stat successfully calculated: {pub_data_str} ({pub_data_bytes} bytes)")
    else:
        log_fail(f"Invalid published data stat: {admin_stats}")

    print("\n================================================================")
    print("ALL 25 VERIFICATION TESTS PASSED FLAWLESSLY! 🚀")
    print("All 9 Enhancements Fully Operational & Zero Regressions!")
    print("================================================================")

def main():
    server_proc = None
    if not is_server_running():
        print("Starting local server for automated tests...")
        server_proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "backend.server:app", "--host", "127.0.0.1", "--port", "8000"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        for _ in range(40):
            if is_server_running():
                break
            time.sleep(0.25)
        if not is_server_running():
            log_fail("Could not start local server on port 8000")
        print("Local server started successfully on port 8000.")

    try:
        run_all_tests()
    finally:
        if server_proc:
            print("\nShutting down automated test server...")
            server_proc.terminate()
            server_proc.wait()
            print("Test server terminated.")

if __name__ == "__main__":
    main()

