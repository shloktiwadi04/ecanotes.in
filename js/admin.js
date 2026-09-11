/**
 * EcaNotes.in - Owner / Admin Portal Controller
 * Dedicated logic for admin.html
 * Fully secured: zero hardcoded credentials in frontend, connects to FastAPI + SQLite backend.
 */

document.addEventListener('DOMContentLoaded', () => {
  // =========================================================================
  // 1. DOM ELEMENTS
  // =========================================================================
  const authSection = document.getElementById('adminAuthSection');
  const dashSection = document.getElementById('adminDashboardSection');
  const loginForm = document.getElementById('adminLoginForm');
  const emailInput = document.getElementById('adminEmailInput');
  const passwordInput = document.getElementById('adminPasswordInput');
  const loginError = document.getElementById('adminLoginError');
  const logoutBtn = document.getElementById('adminLogoutBtn');

  // Stats
  const statPending = document.getElementById('adminStatPending');
  const statPendingReviews = document.getElementById('adminStatPendingReviews');
  const statVerified = document.getElementById('adminStatVerified');
  const statDownloads = document.getElementById('adminStatDownloads');
  const navPendingBadge = document.getElementById('adminNavPendingBadge');
  const tabPendingBadge = document.getElementById('adminTabPendingBadge');
  const tabReviewsBadge = document.getElementById('adminTabReviewsBadge');

  // Moderation Lists
  const pendingContainer = document.getElementById('adminPendingList');
  const emptyPendingState = document.getElementById('adminEmptyPending');
  const pendingReviewsList = document.getElementById('adminPendingReviewsList');
  const emptyPendingReviews = document.getElementById('adminEmptyPendingReviews');
  const publishedReviewsTableBody = document.getElementById('adminPublishedReviewsTableBody');
  const publishedReviewsCount = document.getElementById('adminPublishedReviewsCount');

  // Verified Table
  const verifiedTableBody = document.getElementById('adminVerifiedTableBody');
  const verifiedSearchInput = document.getElementById('adminVerifiedSearch');

  // Direct Publish Form
  const directPublishForm = document.getElementById('directPublishForm');
  const directFileDropZone = document.getElementById('directFileDropZone');
  const directFileInput = document.getElementById('directFileInput');
  const directFileSelected = document.getElementById('directFileSelected');
  let stagedDirectFile = null;

  // Staged replacement files per pending item ID
  const stagedReplacementFiles = {};

  // Subjects Manager Elements
  const statSubjects = document.getElementById('adminStatSubjects');
  const adminAddSubjectForm = document.getElementById('adminAddSubjectForm');
  const newSubjectName = document.getElementById('newSubjectName');
  const newSubjectYear = document.getElementById('newSubjectYear');
  const adminSubjectsTableBody = document.getElementById('adminSubjectsTableBody');
  const editSubjectModal = document.getElementById('editSubjectModal');
  const editSubjectForm = document.getElementById('editSubjectForm');
  const editSubjectId = document.getElementById('editSubjectId');
  const editSubjectName = document.getElementById('editSubjectName');
  const editSubjectYear = document.getElementById('editSubjectYear');
  const closeEditSubjectModalBtn = document.getElementById('closeEditSubjectModalBtn');
  const cancelEditSubjectBtn = document.getElementById('cancelEditSubjectBtn');
  const directYearSelect = document.getElementById('directYear');
  const directSubjectSelect = document.getElementById('directSubject');
  const directCustomSubjectInput = document.getElementById('directCustomSubject');

  // Cached data
  let currentPendingList = [];
  let currentVerifiedList = [];
  let currentPendingReviews = [];
  let currentPublishedReviews = [];
  let currentSubjectsList = [];
  let currentSubjectYearFilter = 'All';

  // =========================================================================
  // 2. AUTHENTICATION LIFECYCLE (Zero hardcoded credentials)
  // =========================================================================
  async function checkAuth() {
    try {
      const isAuth = await EcaAPI.adminMe();
      if (isAuth) {
        if (authSection) authSection.style.display = 'none';
        if (dashSection) dashSection.style.display = 'block';
        if (logoutBtn) logoutBtn.style.display = 'inline-flex';
        await refreshAllDashboardViews();
        return;
      }
    } catch {
      // Fallback if offline
    }

    if (authSection) authSection.style.display = 'flex';
    if (dashSection) dashSection.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
      const password = passwordInput ? passwordInput.value.trim() : '';

      if (!email || !password) {
        if (loginError) {
          loginError.textContent = '⚠️ Please enter both email and password.';
          loginError.style.display = 'block';
        }
        return;
      }

      const submitBtn = loginForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Authenticating...';
      }

      try {
        await EcaAPI.adminLogin(email, password);
        if (loginError) loginError.style.display = 'none';
        showToast('🔐 Welcome, Owner! Moderation Console Unlocked.');
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';
        await checkAuth();
      } catch (err) {
        if (loginError) {
          loginError.textContent = `⚠️ ${err.message || 'Invalid email or password. Access denied.'}`;
          loginError.style.display = 'block';
        }
        showToast('Authentication failed. Please check credentials.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In to Moderation Console →';
        }
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await EcaAPI.adminLogout();
      } catch {}
      showToast('Logged out successfully.');
      await checkAuth();
    });
  }

  window.addEventListener('ecanotes_unauthorized', () => {
    checkAuth();
  });

  // =========================================================================
  // 3. STATS & COUNTERS
  // =========================================================================
  async function updateStats() {
    let stats = null;
    try {
      stats = await EcaAPI.getAdminStats();
    } catch {}

    if (!stats && typeof EcaSQLDB !== 'undefined') {
      stats = EcaSQLDB.getStats();
    }

    if (!stats) return;

    if (statPending) statPending.textContent = stats.pending || 0;
    if (statPendingReviews) statPendingReviews.textContent = stats.pendingReviews || 0;
    if (statVerified) statVerified.textContent = stats.verified || 0;
    if (statDownloads) statDownloads.textContent = (stats.totalDownloads || 0).toLocaleString();

    const statPublishedData = document.getElementById('adminStatPublishedData');
    if (statPublishedData) {
      statPublishedData.textContent = stats.publishedData || '0 MB';
    }

    if (statSubjects) {
      try {
        const allSubjs = await EcaAPI.getSubjects();
        statSubjects.textContent = (allSubjs || []).length;
      } catch {}
    }

    const totalPending = (stats.pending || 0) + (stats.pendingReviews || 0);
    if (navPendingBadge) {
      navPendingBadge.textContent = totalPending;
      navPendingBadge.style.display = totalPending > 0 ? 'inline-block' : 'none';
    }
    if (tabPendingBadge) {
      tabPendingBadge.textContent = stats.pending || 0;
      tabPendingBadge.style.display = (stats.pending || 0) > 0 ? 'inline-block' : 'none';
    }
    if (tabReviewsBadge) {
      tabReviewsBadge.textContent = stats.pendingReviews || 0;
      tabReviewsBadge.style.display = (stats.pendingReviews || 0) > 0 ? 'inline-block' : 'none';
    }
  }

  // =========================================================================
  // 4. TAB NAVIGATION
  // =========================================================================
  const tabs = document.querySelectorAll('.admin-nav-tab');
  const tabPanes = document.querySelectorAll('.admin-tab-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(tab.getAttribute('data-target'));
      if (targetPane) targetPane.classList.add('active');

      const targetId = tab.getAttribute('data-target');
      if (targetId === 'pane-pending') await renderPendingUploads();
      if (targetId === 'pane-reviews') await renderReviewsModeration();
      if (targetId === 'pane-verified') await renderVerifiedTable();
      if (targetId === 'pane-subjects') await renderSubjectsManager(currentSubjectYearFilter);
      if (targetId === 'pane-direct') await populateDirectSubjects();
      if (targetId === 'pane-sql') await renderSQLViewer();
    });
  });

  // =========================================================================
  // 5. PENDING UPLOADS QUEUE (Full Field Moderation)
  // =========================================================================
  async function renderPendingUploads() {
    if (!pendingContainer) return;
    try {
      currentPendingList = await EcaAPI.getPendingUploads();
      currentSubjectsList = await EcaAPI.getSubjects();
    } catch {
      currentPendingList = typeof EcaSQLDB !== 'undefined' ? EcaSQLDB.getPendingUploads() : [];
      currentSubjectsList = typeof EcaSQLDB !== 'undefined' ? EcaSQLDB.getSubjects() : [];
    }

    if (!currentPendingList || currentPendingList.length === 0) {
      pendingContainer.innerHTML = '';
      if (emptyPendingState) emptyPendingState.style.display = 'block';
      return;
    }

    if (emptyPendingState) emptyPendingState.style.display = 'none';

    pendingContainer.innerHTML = currentPendingList.map(item => {
      const yearOptions = ['1st Year', '2nd Year', '3rd Year', '4th Year']
        .map(y => `<option value="${y}" ${item.year === y ? 'selected' : ''}>${y}</option>`)
        .join('');

      const typeOptions = [
        'Notes',
        'PYQ',
        'Assignment',
        'Practical Files',
        'Handwritten Notes',
        'Formula Sheet',
        'Reference Book',
        'Study Material'
      ]
        .map(t => `<option value="${t}" ${item.type === t ? 'selected' : ''}>${t}</option>`)
        .join('');

      const itemYear = item.year || '1st Year';
      const yearSubjects = (currentSubjectsList || []).filter(s => s.year === itemYear).map(s => s.name);
      const hasSubject = yearSubjects.some(s => s.toLowerCase() === (item.subject || '').toLowerCase());
      let subjectOptions = yearSubjects
        .map(s => `<option value="${escapeHTML(s)}" ${item.subject && item.subject.toLowerCase() === s.toLowerCase() ? 'selected' : ''}>${escapeHTML(s)}</option>`)
        .join('');
      if (!hasSubject && item.subject) {
        subjectOptions = `<option value="${escapeHTML(item.subject)}" selected>${escapeHTML(item.subject)}</option>` + subjectOptions;
      }

      return `
        <article class="mod-card" id="card-${item.id}">
          <div class="mod-card-header">
            <div class="mod-header-left">
              <span class="mod-status-pill">Awaiting Verification</span>
              <span class="mod-date">📅 Submitted: ${escapeHTML(item.created_at || '')}</span>
            </div>
            <div class="mod-student-info">
              <span>Student Email: <strong>${escapeHTML(item.email || 'Anonymous')}</strong></span>
            </div>
          </div>

          <div class="mod-edit-form">
            <!-- Row 1: Title & Author -->
            <div class="mod-form-row two-col">
              <div class="mod-input-group">
                <label class="mod-label" for="title-${item.id}">
                  Resource Title (Editable):
                </label>
                <input 
                  type="text" 
                  id="title-${item.id}" 
                  class="mod-input" 
                  value="${escapeHTML(item.title || '')}" 
                  placeholder="Enter resource title"
                >
              </div>

              <div class="mod-input-group">
                <label class="mod-label" for="author-${item.id}">
                  Student / Contributor Name (Editable):
                </label>
                <input 
                  type="text" 
                  id="author-${item.id}" 
                  class="mod-input" 
                  value="${escapeHTML(item.author || '')}" 
                  placeholder="Enter author name"
                >
              </div>
            </div>

            <!-- Row 2: Year, Branch, Subject, Type -->
            <div class="mod-form-row four-col" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
              <div class="mod-input-group">
                <label class="mod-label" for="year-${item.id}">
                  Academic Year:
                </label>
                <select id="year-${item.id}" class="mod-select">
                  ${yearOptions}
                </select>
              </div>

              <div class="mod-input-group">
                <label class="mod-label" for="branch-${item.id}">
                  Branch:
                </label>
                <select id="branch-${item.id}" class="mod-select">
                  <option value="All" ${(!item.branch || item.branch === 'All') ? 'selected' : ''}>All Branches</option>
                  <option value="CSE" ${item.branch === 'CSE' ? 'selected' : ''}>CSE</option>
                  <option value="IT" ${item.branch === 'IT' ? 'selected' : ''}>IT</option>
                  <option value="CYB" ${item.branch === 'CYB' ? 'selected' : ''}>CYB</option>
                  <option value="ECE" ${item.branch === 'ECE' ? 'selected' : ''}>ECE</option>
                  <option value="EIC" ${item.branch === 'EIC' ? 'selected' : ''}>EIC</option>
                  <option value="MECHANICAL" ${item.branch === 'MECHANICAL' ? 'selected' : ''}>MECHANICAL</option>
                  <option value="CIVIL" ${item.branch === 'CIVIL' ? 'selected' : ''}>CIVIL</option>
                  <option value="ELECTRICAL" ${item.branch === 'ELECTRICAL' ? 'selected' : ''}>ELECTRICAL</option>
                </select>
              </div>

              <div class="mod-input-group">
                <label class="mod-label" for="subject-${item.id}">
                  Subject:
                </label>
                <select id="subject-${item.id}" class="mod-select">
                  ${subjectOptions}
                  <option value="__custom__" ${!hasSubject ? 'selected' : ''}>+ Custom Subject...</option>
                </select>
                <input 
                  type="text" 
                  id="custom-subject-${item.id}" 
                  class="mod-input mod-custom-subject" 
                  value="${!hasSubject ? escapeHTML(item.subject || '') : ''}" 
                  placeholder="Type custom subject name" 
                  style="${!hasSubject ? 'display: block; margin-top: 6px;' : 'display: none; margin-top: 6px;'}"
                >
              </div>

              <div class="mod-input-group">
                <label class="mod-label" for="type-${item.id}">
                  Resource Type:
                </label>
                <select id="type-${item.id}" class="mod-select">
                  ${typeOptions}
                </select>
              </div>
            </div>

            <!-- Row 3: Attached File & Replace File -->
            <div class="mod-file-section">
              <div class="mod-file-current">
                <div class="mod-file-icon">📄</div>
                <div class="mod-file-details">
                  <div class="mod-file-name" id="file-name-display-${item.id}">
                    ${escapeHTML(item.file_name || 'document.pdf')}
                  </div>
                  <div class="mod-file-meta" id="file-size-display-${item.id}">
                    Size: ${escapeHTML(item.file_size || '3.5 MB')} · Type: ${escapeHTML(item.file_type || 'PDF')}
                  </div>
                </div>
              </div>

              <div class="mod-file-actions">
                <button type="button" class="btn-mod-preview" data-action="preview" data-id="${item.id}">
                  👁️ Preview / Open
                </button>
                <label class="btn-mod-replace" for="replace-file-${item.id}">
                  📁 Replace File
                  <input type="file" id="replace-file-${item.id}" data-id="${item.id}" class="mod-replace-input" accept=".pdf,.docx,.png,.jpg,.jpeg">
                </label>
              </div>
            </div>
          </div>

          <!-- Bottom Action Buttons -->
          <div class="mod-card-actions">
            <button type="button" class="btn-mod-discard" data-action="discard" data-id="${item.id}">
              ✕ Discard Submission
            </button>
            <button type="button" class="btn-mod-publish" data-action="publish" data-id="${item.id}">
              ✓ Verify &amp; Publish to Website
            </button>
          </div>
        </article>
      `;
    }).join('');

    attachPendingListeners();
  }

  function attachPendingListeners() {
    // Year dropdown change -> update subjects for that year
    pendingContainer.querySelectorAll('.mod-select').forEach(sel => {
      if (sel.id.startsWith('year-')) {
        const id = sel.id.replace('year-', '');
        const subjSel = document.getElementById(`subject-${id}`);
        if (subjSel) {
          sel.addEventListener('change', () => {
            const selectedYear = sel.value;
            const matching = (currentSubjectsList || []).filter(s => s.year === selectedYear).map(s => s.name);
            let opts = matching.map(s => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join('');
            opts += `<option value="__custom__">+ Custom Subject...</option>`;
            subjSel.innerHTML = opts;
            const customInput = document.getElementById(`custom-subject-${id}`);
            if (customInput) customInput.style.display = 'none';
          });
        }
      }
    });

    // Subject dropdown custom toggle
    pendingContainer.querySelectorAll('.mod-select').forEach(sel => {
      if (sel.id.startsWith('subject-')) {
        const id = sel.id.replace('subject-', '');
        const customInput = document.getElementById(`custom-subject-${id}`);
        sel.addEventListener('change', () => {
          if (sel.value === '__custom__') {
            if (customInput) {
              customInput.style.display = 'block';
              customInput.focus();
            }
          } else {
            if (customInput) customInput.style.display = 'none';
          }
        });
      }
    });

    // File replacement handler
    pendingContainer.querySelectorAll('.mod-replace-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const id = input.getAttribute('data-id');
        if (file) {
          if (file.size > 4 * 1024 * 1024) {
            showToast('File size must be 4 MB or less.');
            input.value = '';
            return;
          }
          stagedReplacementFiles[id] = file;
          const nameDisp = document.getElementById(`file-name-display-${id}`);
          const sizeDisp = document.getElementById(`file-size-display-${id}`);
          if (nameDisp) {
            nameDisp.innerHTML = `<strong>${escapeHTML(file.name)}</strong> <span class="badge-replaced">REPLACED</span>`;
          }
          if (sizeDisp) {
            sizeDisp.textContent = `New Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB · Type: ${file.type || 'PDF'}`;
          }
          showToast(`📁 File replaced with "${file.name}". Ready to verify.`);
        }
      });
    });

    // Preview button
    pendingContainer.querySelectorAll('[data-action="preview"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (stagedReplacementFiles[id]) {
          const blobUrl = URL.createObjectURL(stagedReplacementFiles[id]);
          window.open(blobUrl, '_blank');
          return;
        }
        window.open(EcaAPI.getPreviewUrl(id), '_blank');
      });
    });

    // Discard button
    pendingContainer.querySelectorAll('[data-action="discard"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to discard this submission?')) {
          delete stagedReplacementFiles[id];
          try {
            await EcaAPI.rejectUpload(id);
          } catch {
            if (typeof EcaSQLDB !== 'undefined') EcaSQLDB.rejectUpload(id);
          }
          showToast('Submission discarded.');
          await refreshAllDashboardViews();
        }
      });
    });

    // Verify & Publish button
    pendingContainer.querySelectorAll('[data-action="publish"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const titleInput = document.getElementById(`title-${id}`);
        const authorInput = document.getElementById(`author-${id}`);
        const yearSelect = document.getElementById(`year-${id}`);
        const branchSelect = document.getElementById(`branch-${id}`);
        const subjectSelect = document.getElementById(`subject-${id}`);
        const customSubjectInput = document.getElementById(`custom-subject-${id}`);
        const typeSelect = document.getElementById(`type-${id}`);

        const finalTitle = titleInput ? titleInput.value.trim() : '';
        const finalAuthor = authorInput ? authorInput.value.trim() : '';
        const finalYear = yearSelect ? yearSelect.value : '1st Year';
        const finalBranch = branchSelect ? branchSelect.value : 'All';
        let finalSubject = subjectSelect ? subjectSelect.value : 'Engineering Mathematics';
        if (finalSubject === '__custom__' && customSubjectInput) {
          finalSubject = customSubjectInput.value.trim() || 'General Engineering';
        }
        const finalType = typeSelect ? typeSelect.value : 'Notes';

        if (!finalTitle) {
          showToast('⚠️ Please enter a title before publishing.');
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Publishing...';

        try {
          const formData = new FormData();
          formData.append('title', finalTitle);
          formData.append('author', finalAuthor || 'EcaNotes Contributor');
          formData.append('year', finalYear);
          formData.append('branch', finalBranch);
          formData.append('subject', finalSubject);
          formData.append('type', finalType);

          if (stagedReplacementFiles[id]) {
            formData.append('replacement_file', stagedReplacementFiles[id]);
          }

          await EcaAPI.verifyResource(id, formData);
          delete stagedReplacementFiles[id];
          showToast(`🎉 "${finalTitle}" is now LIVE on EcaNotes.in!`);
          await refreshAllDashboardViews();
        } catch (err) {
          console.error(err);
          showToast(`Failed to publish: ${err.message}`);
          btn.disabled = false;
          btn.textContent = '✓ Verify & Publish to Website';
        }
      });
    });
  }

  // =========================================================
  // 6. LIVE VERIFIED RESOURCES TABLE
  // =========================================================
  async function renderVerifiedTable() {
    if (!verifiedTableBody) return;
    try {
      currentVerifiedList = await EcaAPI.getResources({});
    } catch {
      currentVerifiedList = typeof EcaSQLDB !== 'undefined' ? EcaSQLDB.getVerifiedResources() : [];
    }

    const query = verifiedSearchInput ? verifiedSearchInput.value.toLowerCase().trim() : '';

    const filtered = query
      ? (currentVerifiedList || []).filter(r =>
          (r.title || '').toLowerCase().includes(query) ||
          (r.subject || '').toLowerCase().includes(query) ||
          (r.year || '').toLowerCase().includes(query) ||
          (r.author || '').toLowerCase().includes(query)
        )
      : (currentVerifiedList || []);

    if (filtered.length === 0) {
      verifiedTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-4 text-muted">
            No verified resources found matching your search.
          </td>
        </tr>
      `;
      return;
    }

    verifiedTableBody.innerHTML = filtered.map((r, i) => `
      <tr>
        <td><strong>${i + 1}</strong></td>
        <td>
          <div class="table-resource-title">${escapeHTML(r.title)}</div>
          <div class="table-resource-meta">${escapeHTML(r.file_name || 'document.pdf')} · ${escapeHTML(r.file_size || r.fileSize || '4.0 MB')}</div>
        </td>
        <td>
          <span class="badge-year">${escapeHTML(r.year || '1st Year')}</span>
          ${r.branch && r.branch !== 'All' ? `<span class="badge-type" style="background:#EFF6FF;color:#2563EB;margin-left:4px;font-size:0.75rem;">${escapeHTML(r.branch)}</span>` : ''}
        </td>
        <td>${escapeHTML(r.subject)}</td>
        <td><span class="badge-type">${escapeHTML(r.type)}</span></td>
        <td>${escapeHTML(r.author)}</td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn-table-action preview" data-id="${r.id}" title="Preview PDF">
              👁️ Preview
            </button>
            <button type="button" class="btn-table-action download" data-id="${r.id}" data-filename="${escapeHTML(r.file_name || 'resource.pdf')}" title="Download PDF">
              📥 Download
            </button>
            <button type="button" class="btn-table-action unpublish" data-id="${r.id}" title="Unpublish">
              ⚠️ Unpublish
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // Attach actions
    verifiedTableBody.querySelectorAll('.btn-table-action.preview').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        window.open(EcaAPI.getPreviewUrl(id), '_blank');
      });
    });

    verifiedTableBody.querySelectorAll('.btn-table-action.download').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const filename = btn.getAttribute('data-filename');
        EcaAPI.downloadResource(id, filename);
      });
    });

    verifiedTableBody.querySelectorAll('.btn-table-action.unpublish').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to unpublish this resource? It will be removed from the public website.')) {
          try {
            await EcaAPI.unpublishResource(id);
          } catch {
            if (typeof EcaSQLDB !== 'undefined') EcaSQLDB.unpublishResource(id);
          }
          showToast('Resource unpublished.');
          await refreshAllDashboardViews();
        }
      });
    });
  }

  if (verifiedSearchInput) {
    verifiedSearchInput.addEventListener('input', renderVerifiedTable);
  }

  // =========================================================
  // 7. DIRECT PUBLISHER (Owner Direct Upload)
  // =========================================================
  if (directFileDropZone && directFileInput) {
    directFileDropZone.addEventListener('click', () => directFileInput.click());

    directFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 4 * 1024 * 1024) {
          showToast('File size must be 4 MB or less.');
          directFileInput.value = '';
          return;
        }
        stagedDirectFile = file;
        if (directFileSelected) {
          directFileSelected.innerHTML = `✅ Selected: <strong>${escapeHTML(file.name)}</strong> (${(file.size / (1024*1024)).toFixed(2)} MB)`;
          directFileSelected.style.display = 'block';
        }
      }
    });

    ['dragenter', 'dragover'].forEach(ev => {
      directFileDropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        directFileDropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(ev => {
      directFileDropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        directFileDropZone.classList.remove('dragover');
      });
    });

    directFileDropZone.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0];
      if (file) {
        if (file.size > 4 * 1024 * 1024) {
          showToast('File size must be 4 MB or less.');
          if (directFileInput) directFileInput.value = '';
          return;
        }
        stagedDirectFile = file;
        if (directFileSelected) {
          directFileSelected.innerHTML = `✅ Selected: <strong>${escapeHTML(file.name)}</strong> (${(file.size / (1024*1024)).toFixed(2)} MB)`;
          directFileSelected.style.display = 'block';
        }
      }
    });
  }

  async function populateDirectSubjects(year = null) {
    if (!directSubjectSelect) return;
    const targetYear = year || (directYearSelect ? directYearSelect.value : '1st Year');
    try {
      const subjects = await EcaAPI.getSubjects(targetYear);
      let opts = '<option value="" disabled selected>-- Select Subject --</option>';
      if (Array.isArray(subjects)) {
        subjects.forEach(s => {
          opts += `<option value="${escapeHTML(s.name)}">${escapeHTML(s.name)}</option>`;
        });
      }
      opts += '<option value="__custom__">+ Add New / Custom Subject...</option>';
      directSubjectSelect.innerHTML = opts;
      if (directCustomSubjectInput) directCustomSubjectInput.style.display = 'none';
    } catch (err) {
      console.error('Failed to populate direct subjects:', err);
    }
  }

  if (directYearSelect) {
    directYearSelect.addEventListener('change', () => {
      populateDirectSubjects(directYearSelect.value);
    });
  }

  if (directSubjectSelect) {
    directSubjectSelect.addEventListener('change', () => {
      if (directSubjectSelect.value === '__custom__') {
        if (directCustomSubjectInput) {
          directCustomSubjectInput.style.display = 'block';
          directCustomSubjectInput.focus();
        }
      } else {
        if (directCustomSubjectInput) {
          directCustomSubjectInput.style.display = 'none';
        }
      }
    });
  }

  if (directPublishForm) {
    directPublishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('directTitle').value.trim();
      const author = document.getElementById('directAuthor').value.trim() || 'EcaNotes Faculty';
      const year = document.getElementById('directYear').value;
      let subject = directSubjectSelect ? directSubjectSelect.value : '';
      if (subject === '__custom__') {
        subject = directCustomSubjectInput ? directCustomSubjectInput.value.trim() : '';
      }
      const type = document.getElementById('directType').value;
      const desc = document.getElementById('directDesc').value.trim();

      if (!title) {
        showToast('Please enter a title.');
        return;
      }

      if (!subject) {
        showToast('Please select or specify a subject.');
        return;
      }

      if (stagedDirectFile && stagedDirectFile.size > 4 * 1024 * 1024) {
        showToast('File size must be 4 MB or less.');
        return;
      }

      const submitBtn = directPublishForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Publishing...';
      }

      try {
        const directBranch = document.getElementById('directBranch');
        const branch = directBranch ? directBranch.value : 'All';

        const formData = new FormData();
        formData.append('title', title);
        formData.append('author', author);
        formData.append('year', year);
        formData.append('branch', branch);
        formData.append('subject', subject);
        formData.append('type', type);
        formData.append('description', desc);
        if (stagedDirectFile) {
          formData.append('file', stagedDirectFile);
        }

        await EcaAPI.publishDirect(formData);
        showToast(`🎉 "${title}" published directly to the website!`);
        directPublishForm.reset();
        stagedDirectFile = null;
        if (directFileSelected) directFileSelected.style.display = 'none';
        if (directCustomSubjectInput) directCustomSubjectInput.style.display = 'none';
        await populateDirectSubjects(directYearSelect ? directYearSelect.value : '1st Year');
        await refreshAllDashboardViews();
      } catch (err) {
        console.error(err);
        showToast(`Failed to publish: ${err.message}`);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '🚀 Publish Directly to Live Website';
        }
      }
    });
  }

  // =========================================================
  // 7b. DYNAMIC SUBJECTS MANAGER
  // =========================================================
  async function renderSubjectsManager(selectedYear = 'All') {
    if (!adminSubjectsTableBody) return;
    try {
      const yearQuery = (!selectedYear || selectedYear === 'All') ? null : selectedYear;
      const subjects = await EcaAPI.getSubjects(yearQuery);
      currentSubjectsList = await EcaAPI.getSubjects();

      if (!Array.isArray(subjects) || subjects.length === 0) {
        adminSubjectsTableBody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 28px; color: #64748B;">
              No subjects found for ${escapeHTML(selectedYear)}. Add one above!
            </td>
          </tr>
        `;
        return;
      }

      adminSubjectsTableBody.innerHTML = subjects.map(s => `
        <tr id="subject-row-${s.id}">
          <td>
            <strong class="table-resource-title" id="subj-name-${s.id}">${escapeHTML(s.name)}</strong>
          </td>
          <td>
            <span class="badge-year" id="subj-year-${s.id}">${escapeHTML(s.year)}</span>
          </td>
          <td>
            <span class="badge-type">${s.resource_count || 0} resources</span>
          </td>
          <td style="text-align: right;">
            <div class="table-actions" style="justify-content: flex-end;">
              <button type="button" class="btn-table-action edit" data-action="edit-subject" data-id="${s.id}" data-name="${escapeHTML(s.name)}" data-year="${escapeHTML(s.year)}" title="Edit Subject">
                ✏️ Edit
              </button>
              <button type="button" class="btn-table-action delete" data-action="delete-subject" data-id="${s.id}" data-name="${escapeHTML(s.name)}" title="Delete Subject">
                🗑️ Delete
              </button>
            </div>
          </td>
        </tr>
      `).join('');

      attachSubjectActionListeners();
    } catch (err) {
      console.error('Failed to render subjects manager:', err);
    }
  }

  function attachSubjectActionListeners() {
    if (!adminSubjectsTableBody) return;

    // Edit button clicks
    adminSubjectsTableBody.querySelectorAll('[data-action="edit-subject"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const year = btn.getAttribute('data-year');
        openEditSubjectModal(id, name, year);
      });
    });

    // Delete button clicks
    adminSubjectsTableBody.querySelectorAll('[data-action="delete-subject"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        if (confirm(`Are you sure you want to delete subject "${name}"?`)) {
          try {
            await EcaAPI.deleteSubject(id);
            showToast(`🗑️ Subject "${name}" deleted.`);
            await refreshAllDashboardViews();
          } catch (err) {
            showToast(`Failed to delete subject: ${err.message}`);
          }
        }
      });
    });
  }

  // Filter pills in subjects tab
  document.querySelectorAll('.btn-filter-pill[data-subject-year]').forEach(pill => {
    pill.addEventListener('click', async () => {
      document.querySelectorAll('.btn-filter-pill[data-subject-year]').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentSubjectYearFilter = pill.getAttribute('data-subject-year');
      await renderSubjectsManager(currentSubjectYearFilter);
    });
  });

  // Add Subject Form
  if (adminAddSubjectForm) {
    adminAddSubjectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = newSubjectName ? newSubjectName.value.trim() : '';
      const year = newSubjectYear ? newSubjectYear.value : '1st Year';
      if (!name) {
        showToast('Please enter a subject name.');
        return;
      }
      try {
        await EcaAPI.createSubject(name, year);
        showToast(`✅ Subject "${name}" added to ${year}!`);
        if (newSubjectName) newSubjectName.value = '';
        await refreshAllDashboardViews();
      } catch (err) {
        showToast(`Failed to add subject: ${err.message}`);
      }
    });
  }

  // Edit Subject Modal
  function openEditSubjectModal(id, name, year) {
    if (!editSubjectModal) return;
    if (editSubjectId) editSubjectId.value = id;
    if (editSubjectName) editSubjectName.value = name;
    if (editSubjectYear) editSubjectYear.value = year;
    editSubjectModal.classList.add('active');
  }

  function closeEditSubjectModal() {
    if (!editSubjectModal) return;
    editSubjectModal.classList.remove('active');
  }

  if (closeEditSubjectModalBtn) closeEditSubjectModalBtn.addEventListener('click', closeEditSubjectModal);
  if (cancelEditSubjectBtn) cancelEditSubjectBtn.addEventListener('click', closeEditSubjectModal);

  if (editSubjectForm) {
    editSubjectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = editSubjectId ? editSubjectId.value : '';
      const name = editSubjectName ? editSubjectName.value.trim() : '';
      const year = editSubjectYear ? editSubjectYear.value : '1st Year';
      if (!id || !name) {
        showToast('Subject name cannot be empty.');
        return;
      }
      try {
        await EcaAPI.updateSubject(id, name, year);
        showToast(`✅ Subject updated to "${name}" (${year})!`);
        closeEditSubjectModal();
        await refreshAllDashboardViews();
      } catch (err) {
        showToast(`Failed to update subject: ${err.message}`);
      }
    });
  }

  // =========================================================
  // 8. STUDENT REVIEWS MODERATION (Pending & Published)
  // =========================================================
  async function renderReviewsModeration() {
    await renderPendingReviews();
    await renderPublishedReviewsTable();
  }

  async function renderPendingReviews() {
    if (!pendingReviewsList) return;
    try {
      currentPendingReviews = await EcaAPI.getPendingReviews();
    } catch {
      currentPendingReviews = typeof EcaSQLDB !== 'undefined' ? EcaSQLDB.getPendingReviews() : [];
    }

    if (!currentPendingReviews || currentPendingReviews.length === 0) {
      pendingReviewsList.innerHTML = '';
      if (emptyPendingReviews) emptyPendingReviews.style.display = 'block';
      return;
    }

    if (emptyPendingReviews) emptyPendingReviews.style.display = 'none';

    pendingReviewsList.innerHTML = currentPendingReviews.map(rev => {
      const stars = Math.max(1, Math.min(5, Number(rev.stars) || 5));
      const starStr = '★'.repeat(stars) + '☆'.repeat(5 - stars);
      const text = rev.review || rev.quote || '';
      const branchYear = [rev.branch, rev.year].filter(Boolean).join(' • ');

      return `
        <article class="review-mod-card" data-id="${rev.id}">
          <div>
            <div class="review-mod-header">
              <span class="review-mod-stars">${starStr} (${stars}/5)</span>
              <span class="review-mod-status">Pending Moderation</span>
            </div>
            <p class="review-mod-text">&ldquo;${escapeHTML(text)}&rdquo;</p>
          </div>
          <div>
            <div class="review-mod-author">
              <div>
                <div class="review-mod-author-name">${escapeHTML(rev.name || 'Anonymous Student')}</div>
                <div class="review-mod-author-meta">${escapeHTML(branchYear || 'College Student')}</div>
              </div>
              <div class="review-mod-date">${escapeHTML(rev.created_at || '')}</div>
            </div>
            <div class="review-mod-actions">
              <button type="button" class="btn-review-publish" data-action="publish-review" data-id="${rev.id}">
                ✓ Publish Review
              </button>
              <button type="button" class="btn-review-reject" data-action="reject-review" data-id="${rev.id}">
                ✕ Reject
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Attach action listeners
    pendingReviewsList.querySelectorAll('[data-action="publish-review"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        try {
          await EcaAPI.publishReview(id);
          showToast('✅ Review approved and published to EcaNotes.in!');
          await refreshAllDashboardViews();
        } catch (err) {
          showToast(`Error: ${err.message}`);
          btn.disabled = false;
        }
      });
    });

    pendingReviewsList.querySelectorAll('[data-action="reject-review"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to reject and remove this review?')) {
          try {
            await EcaAPI.rejectReview(id);
            showToast('Review rejected and removed.');
            await refreshAllDashboardViews();
          } catch (err) {
            showToast(`Error: ${err.message}`);
          }
        }
      });
    });
  }

  async function renderPublishedReviewsTable() {
    if (!publishedReviewsTableBody) return;
    try {
      currentPublishedReviews = await EcaAPI.getReviews();
    } catch {
      currentPublishedReviews = typeof EcaSQLDB !== 'undefined' ? EcaSQLDB.getPublishedReviews() : [];
    }

    if (publishedReviewsCount) {
      publishedReviewsCount.textContent = (currentPublishedReviews || []).length;
    }

    if (!currentPublishedReviews || currentPublishedReviews.length === 0) {
      publishedReviewsTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 24px; color: #94A3B8;">
            No published reviews yet.
          </td>
        </tr>
      `;
      return;
    }

    publishedReviewsTableBody.innerHTML = currentPublishedReviews.map((rev, idx) => {
      const stars = Math.max(1, Math.min(5, Number(rev.stars) || 5));
      const starStr = '★'.repeat(stars) + '☆'.repeat(5 - stars);
      const text = rev.review || rev.quote || '';
      const branchYear = [rev.branch, rev.year].filter(Boolean).join(' • ');

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${escapeHTML(rev.name || 'Student')}</strong></td>
          <td>${escapeHTML(branchYear || '-')}</td>
          <td><span style="color: #F59E0B; letter-spacing: 1px;">${starStr}</span> (${stars}/5)</td>
          <td style="max-width: 320px; font-size: 0.8125rem; color: #475569;">
            &ldquo;${escapeHTML(text)}&rdquo;
          </td>
          <td>
            <button type="button" class="btn-review-unpublish" data-action="unpublish-review" data-id="${rev.id}">
              Unpublish
            </button>
          </td>
        </tr>
      `;
    }).join('');

    publishedReviewsTableBody.querySelectorAll('[data-action="unpublish-review"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Unpublish this review from the website?')) {
          try {
            await EcaAPI.unpublishReview(id);
            showToast('Review unpublished from the live site.');
            await refreshAllDashboardViews();
          } catch (err) {
            showToast(`Error: ${err.message}`);
          }
        }
      });
    });
  }

  // =========================================================
  // 9. SQL VIEWER & INSPECTOR
  // =========================================================
  async function renderSQLViewer() {
    let sqlData = null;
    try {
      sqlData = await EcaAPI.getSQLData();
    } catch {}

    if (!sqlData && typeof EcaSQLDB !== 'undefined') {
      const rawDB = EcaSQLDB.getRawDB();
      sqlData = {
        pending_uploads: rawDB.tables.pending_uploads,
        verified_resources: rawDB.tables.verified_resources,
        pending_reviews: rawDB.tables.pending_reviews || [],
        published_reviews: rawDB.tables.published_reviews || []
      };
    }

    if (!sqlData) return;

    const pendingCount = (sqlData.pending_uploads || []).length;
    const verifiedCount = (sqlData.verified_resources || []).length;
    const pendingRevCount = (sqlData.pending_reviews || []).length;
    const publishedRevCount = (sqlData.published_reviews || []).length;
    const subjectsCount = (sqlData.subjects || currentSubjectsList || []).length;

    const sqlStatus = document.getElementById('sqlStatusText');
    if (sqlStatus) {
      sqlStatus.innerHTML = `Database Status: <strong style="color: #10B981;">ONLINE (Active SQLite)</strong> | pending: <strong>${pendingCount}</strong> | verified: <strong>${verifiedCount}</strong> | subjects: <strong>${subjectsCount}</strong> | reviews: <strong>${pendingRevCount} pend / ${publishedRevCount} pub</strong>`;
    }

    const pendingViewer = document.getElementById('sqlPendingTableData');
    if (pendingViewer) {
      pendingViewer.textContent = JSON.stringify(sqlData.pending_uploads, null, 2);
    }

    const verifiedViewer = document.getElementById('sqlVerifiedTableData');
    if (verifiedViewer) {
      verifiedViewer.textContent = JSON.stringify((sqlData.verified_resources || []).slice(0, 8), null, 2) + 
        ((sqlData.verified_resources || []).length > 8 ? `\n... and ${(sqlData.verified_resources || []).length - 8} more rows` : '');
    }
  }

  // =========================================================
  // 10. REAL-TIME CROSS-TAB SYNC & REFRESH
  // =========================================================
  async function refreshAllDashboardViews() {
    await updateStats();
    await renderPendingUploads();
    await renderReviewsModeration();
    await renderVerifiedTable();
    await renderSubjectsManager(currentSubjectYearFilter);
    await populateDirectSubjects();
    await renderSQLViewer();
  }

  window.addEventListener('storage', (e) => {
    if (e.key === 'ecanotes_sync_trigger' || e.key === 'ecanotes_sql_db') {
      refreshAllDashboardViews();
    }
  });

  window.addEventListener('ecanotes_db_change', () => {
    refreshAllDashboardViews();
  });

  // Toast Notification
  function showToast(msg) {
    let toast = document.getElementById('adminToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'adminToast';
      toast.className = 'admin-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 4000);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initial check
  checkAuth();
});
