/**
 * EcaNotes.in - Main Client-Side JavaScript
 * Clean, modular vanilla JavaScript implementing all functional interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
  // =========================================================================
  // 1. STATE & DATA STORE
  // =========================================================================

  // Live verified resources from the backend API (or fallback to db.js)
  let allResources = [];

  // Resources pagination state (Show 6 initially, reveal +6 on click)
  let visibleResourcesCount = 6;

  // Reviews pagination state (Show 4 initially, reveal +4 on click)
  let visibleReviewsCount = 4;
  let selectedRatingValue = 5;

  // Active filter state
  let currentFilters = {
    searchQuery: '',
    year: '1st Year',
    branch: 'All',
    type: 'All',
    subject: 'All'
  };


  // =========================================================
  // 2. DOM ELEMENTS CACHE
  // =========================================================
  const navSearchInput = document.getElementById('navSearchInput');
  const mobileSearchInput = document.getElementById('mobileSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mobileDrawer = document.getElementById('mobileDrawer');
  const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');

  const resourcesGrid = document.getElementById('resourcesGrid');
  const noResourcesState = document.getElementById('noResourcesState');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const subjectFilter = document.getElementById('subjectFilter');
  const branchFilter = document.getElementById('branchFilter');
  const branchFilterWrap = document.getElementById('branchFilterWrap');
  const moreResourcesWrap = document.getElementById('moreResourcesWrap');
  const loadMoreResourcesBtn = document.getElementById('loadMoreResourcesBtn');
  const quickChips = document.querySelectorAll('.quick-chips .chip');

  const yearFilter = document.getElementById('yearFilter');
  const heroFindResourcesBtn = document.getElementById('heroFindResourcesBtn');
  const heroContributeBtn = document.getElementById('heroContributeBtn');
  const contribBranchGroup = document.getElementById('contribBranchGroup');
  const contribBranch = document.getElementById('contribBranch');

  const reviewsGrid = document.getElementById('reviewsGrid');
  const moreReviewsWrap = document.getElementById('moreReviewsWrap');
  const moreReviewsBtn = document.getElementById('moreReviewsBtn');
  const ratingForm = document.getElementById('ratingForm');
  const starSelector = document.getElementById('starSelector');
  const starBtns = document.querySelectorAll('#starSelector .star-btn');
  const selectedRatingInput = document.getElementById('selectedRating');
  const ratingError = document.getElementById('ratingError');
  const avgRatingDisplay = document.getElementById('avgRatingDisplay');
  const avgStarsDisplay = document.getElementById('avgStarsDisplay');
  const reviewCountDisplay = document.getElementById('reviewCountDisplay');
  const reviewSuccessBanner = document.getElementById('reviewSuccessBanner');

  const contributeForm = document.getElementById('contributeForm');
  const uploadDropzone = document.getElementById('uploadDropzone');
  const fileUploadInput = document.getElementById('fileUploadInput');
  const dropzoneIdle = document.getElementById('dropzoneIdle');
  const dropzoneSelected = document.getElementById('dropzoneSelected');
  const selectedFileName = document.getElementById('selectedFileName');
  const selectedFileSize = document.getElementById('selectedFileSize');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const fileError = document.getElementById('fileError');
  const contribSuccessBanner = document.getElementById('contribSuccessBanner');

  const resourceModal = document.getElementById('resourceModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalDismissBtn = document.getElementById('modalDismissBtn');
  const modalDownloadBtn = document.getElementById('modalDownloadBtn');
  const modalPreviewBtn = document.getElementById('modalPreviewBtn');
  const modalResourceTitle = document.getElementById('modalResourceTitle');
  const modalResourceType = document.getElementById('modalResourceType');
  const modalResourceMeta = document.getElementById('modalResourceMeta');
  const modalResourceDesc = document.getElementById('modalResourceDesc');

  let activeModalResource = null;
  let stagedFile = null;

  // Owner Portal Badges
  const ownerPendingBadge = document.getElementById('ownerPendingBadge');
  const mobilePendingBadge = document.getElementById('mobilePendingBadge');


  // =========================================================
  // 3. NAVBAR & SEARCH BEHAVIOR
  // =========================================================

  // Sticky navbar shadow on scroll
  const topHeader = document.getElementById('topHeader');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      topHeader?.classList.add('scrolled');
    } else {
      topHeader?.classList.remove('scrolled');
    }
    updateActiveNavOnScroll();
  }, { passive: true });

  // Mobile drawer toggle
  if (hamburgerBtn && mobileDrawer) {
    hamburgerBtn.addEventListener('click', () => {
      const isOpen = mobileDrawer.classList.toggle('open');
      hamburgerBtn.classList.toggle('active');
      hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
      mobileDrawer.setAttribute('aria-hidden', String(!isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });
  }

  // Close drawer when clicking a navigation link
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (mobileDrawer?.classList.contains('open')) {
        mobileDrawer.classList.remove('open');
        hamburgerBtn?.classList.remove('active');
        hamburgerBtn?.setAttribute('aria-expanded', 'false');
        mobileDrawer.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
    });
  });

  // Search input listeners
  function handleSearch(query) {
    currentFilters.searchQuery = query.toLowerCase().trim();
    if (clearSearchBtn) {
      clearSearchBtn.style.display = currentFilters.searchQuery ? 'block' : 'none';
    }
    visibleResourcesCount = 6;
    renderResources();

    if (query.trim() && window.scrollY < 400) {
      const target = document.getElementById('resourcesDisplaySection');
      target?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  if (navSearchInput) {
    navSearchInput.addEventListener('input', (e) => {
      handleSearch(e.target.value);
      if (mobileSearchInput) mobileSearchInput.value = e.target.value;
    });
  }

  if (mobileSearchInput) {
    mobileSearchInput.addEventListener('input', (e) => {
      handleSearch(e.target.value);
      if (navSearchInput) navSearchInput.value = e.target.value;
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (navSearchInput) navSearchInput.value = '';
      if (mobileSearchInput) mobileSearchInput.value = '';
      clearSearchBtn.style.display = 'none';
      currentFilters.searchQuery = '';
      visibleResourcesCount = 6;
      renderResources();
      navSearchInput?.focus();
    });
  }


  // =========================================================
  // 4. ACTIVE NAVIGATION HIGHLIGHTING & SMOOTH SCROLL
  // =========================================================
  function updateActiveNavOnScroll() {
    const sections = ['home', 'resourcesDisplaySection', 'reviews', 'contribute'];
    const scrollPos = window.scrollY + 120;

    for (const sectionId of sections) {
      const el = document.getElementById(sectionId);
      if (el) {
        const top = el.offsetTop;
        const height = el.offsetHeight;
        if (scrollPos >= top && scrollPos < top + height) {
          navLinks.forEach(link => {
            const href = link.getAttribute('href');
            const dataSec = link.getAttribute('data-section');
            if (href === `#${sectionId}` || dataSec === sectionId) {
              link.classList.add('active');
            } else {
              link.classList.remove('active');
            }
          });
          break;
        }
      }
    }
  }


  // =========================================================
  // 5. HERO & SHORTCUT ACTIONS
  // =========================================================
  if (exploreMaterialsBtn) {
    exploreMaterialsBtn.addEventListener('click', () => {
      document.getElementById('resourcesDisplaySection')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  if (heroFindResourcesBtn) {
    heroFindResourcesBtn.addEventListener('click', () => {
      document.getElementById('resourcesDisplaySection')?.scrollIntoView({ behavior: 'smooth' });
      navSearchInput?.focus();
    });
  }

  if (heroContributeBtn) {
    heroContributeBtn.addEventListener('click', () => {
      document.getElementById('contribute')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Footer category links
  document.querySelectorAll('.footer-links a[data-category]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const cat = link.getAttribute('data-category');
      setActiveChip(cat);
      currentFilters.type = cat;
      renderResources();
      document.getElementById('resourcesDisplaySection')?.scrollIntoView({ behavior: 'smooth' });
    });
  });


  // =========================================================
  // 6. FILTERING LOGIC & CHIPS
  // =========================================================
  quickChips.forEach(chip => {
    chip.addEventListener('click', () => {
      quickChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const chipValue = chip.getAttribute('data-chip');
      currentFilters.type = chipValue;
      visibleResourcesCount = 6;
      renderResources();
    });
  });

  function setActiveChip(value) {
    quickChips.forEach(chip => {
      if (chip.getAttribute('data-chip') === value) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  async function updateSubjectFilterDropdown(selectedYear, preserveSelection = false) {
    if (!subjectFilter) return;
    const previousSubject = preserveSelection ? subjectFilter.value : 'All';
    try {
      const yearQuery = (!selectedYear || selectedYear === 'All') ? null : selectedYear;
      const subjects = await EcaAPI.getSubjects(yearQuery);
      subjectFilter.innerHTML = '<option value="All">All Subjects</option>';
      if (Array.isArray(subjects)) {
        subjects.forEach(subj => {
          const opt = document.createElement('option');
          opt.value = subj.name;
          opt.textContent = subj.name;
          subjectFilter.appendChild(opt);
        });
      }
      if (preserveSelection && previousSubject && Array.from(subjectFilter.options).some(o => o.value === previousSubject)) {
        subjectFilter.value = previousSubject;
        currentFilters.subject = previousSubject;
      } else {
        subjectFilter.value = 'All';
        currentFilters.subject = 'All';
      }
    } catch (err) {
      console.error('Failed to load subjects for filter:', err);
    }
  }

  async function updateContribSubjectSuggestions(year) {
    const datalist = document.getElementById('subjectSuggestions');
    if (!datalist) return;
    try {
      const yearQuery = (!year || year === 'All') ? null : year;
      const subjects = await EcaAPI.getSubjects(yearQuery);
      datalist.innerHTML = '';
      if (Array.isArray(subjects)) {
        subjects.forEach(subj => {
          const opt = document.createElement('option');
          opt.value = subj.name;
          datalist.appendChild(opt);
        });
      }
    } catch (err) {
      console.error('Failed to update contrib subject suggestions:', err);
    }
  }

  const contribYearSelect = document.getElementById('contribYear');
  if (contribYearSelect) {
    contribYearSelect.addEventListener('change', (e) => {
      const selectedYear = e.target.value;
      if (contribBranchGroup) {
        if (selectedYear === '1st Year') {
          contribBranchGroup.style.display = 'none';
          if (contribBranch) contribBranch.value = 'All';
        } else {
          contribBranchGroup.style.display = 'block';
        }
      }
      updateContribSubjectSuggestions(selectedYear);
    });
  }

  if (subjectFilter) {
    subjectFilter.addEventListener('change', (e) => {
      currentFilters.subject = e.target.value;
      visibleResourcesCount = 6;
      renderResources();
    });
  }

  if (branchFilter) {
    branchFilter.addEventListener('change', (e) => {
      currentFilters.branch = e.target.value;
      visibleResourcesCount = 6;
      renderResources();
    });
  }

  if (yearFilter) {
    yearFilter.addEventListener('change', async (e) => {
      currentFilters.year = e.target.value;
      if (currentFilters.year === '1st Year') {
        if (branchFilterWrap) branchFilterWrap.style.display = 'none';
        if (branchFilter) branchFilter.value = 'All';
        currentFilters.branch = 'All';
      } else {
        if (branchFilterWrap) branchFilterWrap.style.display = 'block';
      }
      visibleResourcesCount = 6;
      await updateSubjectFilterDropdown(currentFilters.year, false);
      renderResources();
    });
  }

  if (loadMoreResourcesBtn) {
    loadMoreResourcesBtn.addEventListener('click', () => {
      visibleResourcesCount += 6;
      renderResources();
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', async () => {
      currentFilters = {
        searchQuery: '',
        year: 'All',
        branch: 'All',
        type: 'All',
        subject: 'All'
      };
      if (navSearchInput) navSearchInput.value = '';
      if (mobileSearchInput) mobileSearchInput.value = '';
      if (clearSearchBtn) clearSearchBtn.style.display = 'none';
      if (yearFilter) yearFilter.value = 'All';
      if (branchFilterWrap) branchFilterWrap.style.display = 'block';
      if (branchFilter) branchFilter.value = 'All';
      visibleResourcesCount = 6;
      await updateSubjectFilterDropdown('All', false);
      if (subjectFilter) subjectFilter.value = 'All';
      setActiveChip('All');
      renderResources();
    });
  }


  // =========================================================
  // 7. STUDY RESOURCES RENDERING
  // =========================================================
  async function loadResources() {
    try {
      const data = await EcaAPI.getResources(currentFilters);
      if (data && Array.isArray(data)) {
        allResources = data;
        return;
      }
    } catch {}
    if (typeof EcaSQLDB !== 'undefined') {
      allResources = EcaSQLDB.getVerifiedResources();
    }
  }

  function getFilteredResources() {
    return allResources.filter(res => {
      // Search text filter
      if (currentFilters.searchQuery) {
        const q = currentFilters.searchQuery.toLowerCase();
        const matchesTitle = (res.title || '').toLowerCase().includes(q);
        const matchesSubject = (res.subject || '').toLowerCase().includes(q);
        const matchesAuthor = (res.author || '').toLowerCase().includes(q);
        const matchesType = (res.type || '').toLowerCase().includes(q);
        const matchesBranch = (res.branch || '').toLowerCase().includes(q);
        const matchesDesc = res.description ? res.description.toLowerCase().includes(q) : false;
        if (!matchesTitle && !matchesSubject && !matchesAuthor && !matchesType && !matchesBranch && !matchesDesc) {
          return false;
        }
      }

      // Year filter
      if (currentFilters.year !== 'All') {
        if (res.year && res.year !== currentFilters.year) {
          return false;
        }
      }

      // Branch filter (when branch filter is active)
      if (currentFilters.branch && currentFilters.branch !== 'All') {
        if (res.branch && res.branch !== 'All' && res.branch !== currentFilters.branch) {
          return false;
        }
      }

      // Subject dropdown filter
      if (currentFilters.subject !== 'All') {
        if (res.subject !== currentFilters.subject) {
          return false;
        }
      }

      // Quick chip category filter
      if (currentFilters.type !== 'All') {
        if (currentFilters.type === 'Notes' && !(res.type || '').includes('Notes')) return false;
        if (currentFilters.type === 'PYQ' && !(res.type || '').includes('PYQ')) return false;
        if (currentFilters.type === 'Assignment' && !(res.type || '').includes('Assignment')) return false;
        if (currentFilters.type === 'Practical Files' && !(res.type || '').includes('Practical')) return false;
        if (currentFilters.type === 'Handwritten Notes' && res.type !== 'Handwritten Notes') return false;
      }

      return true;
    });
  }

  async function renderResources() {
    if (!resourcesGrid) return;
    await loadResources();
    const filtered = getFilteredResources();

    if (filtered.length === 0) {
      resourcesGrid.innerHTML = '';
      if (noResourcesState) noResourcesState.style.display = 'block';
      if (moreResourcesWrap) moreResourcesWrap.style.display = 'none';
      return;
    }

    if (noResourcesState) noResourcesState.style.display = 'none';

    // Show only the 6 most recent resources initially, revealing subsequent with Load More
    const visibleList = filtered.slice(0, visibleResourcesCount);

    if (moreResourcesWrap) {
      if (filtered.length > visibleResourcesCount) {
        moreResourcesWrap.style.display = 'flex';
        if (loadMoreResourcesBtn) {
          const remaining = filtered.length - visibleResourcesCount;
          loadMoreResourcesBtn.textContent = `Load More Resources (${remaining} remaining) ↓`;
        }
      } else {
        moreResourcesWrap.style.display = 'none';
      }
    }

    resourcesGrid.innerHTML = visibleList.map(res => {
      const typeClass = getTypePillClass(res.type);
      return `
        <article class="resource-card" data-id="${res.id}">
          <div class="resource-card-top">
            <div class="resource-tag-row">
              <span class="resource-pill ${typeClass}">${escapeHTML(res.type)}</span>
              <span class="resource-year-tag">${escapeHTML(res.year || '1st Year')}</span>
              ${res.branch && res.branch !== 'All' ? `<span class="resource-branch-tag" style="background:#EEF2FF;color:#4F46E5;padding:2px 8px;border-radius:999px;font-size:0.6875rem;font-weight:600;">${escapeHTML(res.branch)}</span>` : ''}
            </div>

            <h3 class="resource-card-title" title="${escapeHTML(res.title)}">
              ${escapeHTML(res.title)}
            </h3>

            <div class="resource-meta-row">
              <div class="resource-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                </svg>
                <span>${escapeHTML(res.subject)}</span>
              </div>
              <div class="resource-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>${escapeHTML(res.author)}</span>
              </div>
            </div>
          </div>

          <div class="resource-card-footer">
            <div class="resource-download-count">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span><strong id="dl-count-${res.id}">${(res.downloads || 0).toLocaleString()}</strong> downloads</span>
            </div>

            <div class="resource-actions-wrap">
              <button 
                type="button" 
                class="btn-preview-sm" 
                data-action="preview" 
                data-id="${res.id}" 
                aria-label="Preview ${escapeHTML(res.title)}"
              >
                Preview
              </button>
              <button 
                type="button" 
                class="btn-download-sm" 
                data-action="download" 
                data-id="${res.id}" 
                aria-label="Download ${escapeHTML(res.title)}"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>PDF</span>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Attach card event listeners
    resourcesGrid.querySelectorAll('[data-action="preview"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const res = allResources.find(r => r.id === id);
        if (res) openResourceModal(res);
      });
    });

    resourcesGrid.querySelectorAll('[data-action="download"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const res = allResources.find(r => r.id === id);
        if (res) {
          downloadResourceFile(res);
        }
      });
    });
  }

  function getTypePillClass(type) {
    if ((type || '').includes('PYQ')) return 'pill-pyq';
    if ((type || '').includes('Assignment')) return 'pill-assignment';
    if ((type || '').includes('Handwritten')) return 'pill-handwritten';
    if ((type || '').includes('Practical')) return 'pill-practical';
    return 'pill-notes';
  }


  // =========================================================
  // 8. RATINGS & REVIEWS SECTION
  // =========================================================
  async function renderReviews() {
    if (!reviewsGrid) return;
    let allPublished = [];
    try {
      allPublished = await EcaAPI.getReviews();
    } catch {}
    if (!allPublished || allPublished.length === 0) {
      allPublished = typeof EcaSQLDB !== 'undefined' ? EcaSQLDB.getPublishedReviews() : [];
    }

    const visibleReviews = allPublished.slice(0, visibleReviewsCount);

    if (visibleReviews.length === 0) {
      reviewsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #64748B;">
          <p style="font-size: 1.1rem; font-weight: 600;">No reviews published yet.</p>
          <p style="font-size: 0.875rem; margin-top: 6px;">Be the first student to share your feedback above!</p>
        </div>
      `;
      if (moreReviewsWrap) moreReviewsWrap.style.display = 'none';
      updateAggregateRating(allPublished);
      return;
    }

    reviewsGrid.innerHTML = visibleReviews.map(rev => {
      const starCount = Math.max(1, Math.min(5, Number(rev.stars) || 5));
      const starString = '★'.repeat(starCount) + '☆'.repeat(5 - starCount);
      const reviewText = rev.review || rev.quote || '';
      const branchAndYear = [rev.branch, rev.year].filter(Boolean).join(' • ');

      return `
        <article class="review-card">
          <div class="review-card-stars" aria-label="${starCount} out of 5 stars">
            ${starString}
          </div>
          <p class="review-card-quote">&ldquo;${escapeHTML(reviewText)}&rdquo;</p>
          <div class="review-card-author">
            <div class="review-author-name">${escapeHTML(rev.name || 'Anonymous Student')}</div>
            <div class="review-author-branch">${escapeHTML(branchAndYear || 'Verified Student')}</div>
          </div>
        </article>
      `;
    }).join('');

    // Pagination: show or hide "More Reviews →" button
    if (moreReviewsWrap) {
      if (visibleReviewsCount >= allPublished.length) {
        moreReviewsWrap.style.display = 'none';
      } else {
        moreReviewsWrap.style.display = 'flex';
      }
    }

    updateAggregateRating(allPublished);
  }

  // Handle "More Reviews →" button click (reveals +4 reviews each time)
  if (moreReviewsBtn) {
    moreReviewsBtn.addEventListener('click', () => {
      visibleReviewsCount += 4;
      renderReviews();
    });
  }

  // Calculate dynamic overall rating and review count from published reviews only
  function updateAggregateRating(published) {
    const list = published || EcaSQLDB.getPublishedReviews();
    if (!list || list.length === 0) {
      if (avgRatingDisplay) avgRatingDisplay.textContent = '0.0';
      if (avgStarsDisplay) {
        avgStarsDisplay.textContent = '☆☆☆☆☆';
        avgStarsDisplay.setAttribute('aria-label', '0 out of 5 stars');
      }
      if (reviewCountDisplay) {
        reviewCountDisplay.textContent = 'No published reviews yet';
      }
      return;
    }

    const totalStars = list.reduce((sum, r) => sum + (Number(r.stars) || 5), 0);
    const avgNum = totalStars / list.length;
    const avgFormatted = (Math.round(avgNum * 10) / 10).toFixed(1);

    if (avgRatingDisplay) avgRatingDisplay.textContent = avgFormatted;

    const roundedStars = Math.round(avgNum);
    const starStr = '★'.repeat(Math.max(0, Math.min(5, roundedStars))) + '☆'.repeat(Math.max(0, 5 - roundedStars));
    if (avgStarsDisplay) {
      avgStarsDisplay.textContent = starStr;
      avgStarsDisplay.setAttribute('aria-label', `${avgFormatted} out of 5 stars`);
    }

    if (reviewCountDisplay) {
      reviewCountDisplay.textContent = `Based on ${list.length} verified student review${list.length === 1 ? '' : 's'}`;
    }
  }

  // Interactive 5-star selector with click and hover states
  function setStarRating(val) {
    selectedRatingValue = val;
    if (selectedRatingInput) selectedRatingInput.value = val;
    if (ratingError) ratingError.classList.remove('visible');

    starBtns.forEach(b => {
      const starVal = parseInt(b.getAttribute('data-rating') || b.getAttribute('data-value'), 10);
      b.classList.remove('hover');
      if (starVal <= val) {
        b.classList.add('active');
        b.classList.remove('inactive');
      } else {
        b.classList.remove('active');
        b.classList.add('inactive');
      }
    });
  }

  function highlightStars(hoverVal) {
    starBtns.forEach(b => {
      const starVal = parseInt(b.getAttribute('data-rating') || b.getAttribute('data-value'), 10);
      if (starVal <= hoverVal) {
        b.classList.add('hover');
      } else {
        b.classList.remove('hover');
      }
    });
  }

  starBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const val = parseInt(btn.getAttribute('data-rating') || btn.getAttribute('data-value'), 10);
      setStarRating(val);
    });

    btn.addEventListener('mouseenter', () => {
      const val = parseInt(btn.getAttribute('data-rating') || btn.getAttribute('data-value'), 10);
      highlightStars(val);
    });
  });

  if (starSelector) {
    starSelector.addEventListener('mouseleave', () => {
      setStarRating(selectedRatingValue);
    });
  }

  // Initialize default 5 stars active
  setStarRating(5);

  // Handle Review Submission (Saves to Pending for Owner Approval)
  if (ratingForm) {
    ratingForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('reviewerName');
      const branchInput = document.getElementById('reviewerBranch');
      const yearInput = document.getElementById('reviewerYear');
      const messageInput = document.getElementById('reviewerMessage');

      let isValid = true;

      // Rating validation (required)
      if (!selectedRatingValue || selectedRatingValue < 1 || selectedRatingValue > 5) {
        if (ratingError) ratingError.classList.add('visible');
        isValid = false;
      } else {
        if (ratingError) ratingError.classList.remove('visible');
      }

      // Name validation
      const nameVal = nameInput ? nameInput.value.trim() : '';
      const nameError = document.getElementById('nameError');
      if (!nameVal) {
        if (nameError) nameError.classList.add('visible');
        isValid = false;
      } else {
        if (nameError) nameError.classList.remove('visible');
      }

      // Branch validation
      const branchVal = branchInput ? branchInput.value.trim() : '';
      const branchError = document.getElementById('branchError');
      if (!branchVal) {
        if (branchError) branchError.classList.add('visible');
        isValid = false;
      } else {
        if (branchError) branchError.classList.remove('visible');
      }

      // Year validation
      const yearVal = yearInput ? yearInput.value.trim() : '';
      const yearError = document.getElementById('yearError');
      if (!yearVal) {
        if (yearError) yearError.classList.add('visible');
        isValid = false;
      } else {
        if (yearError) yearError.classList.remove('visible');
      }

      // Message validation
      const messageVal = messageInput ? messageInput.value.trim() : '';
      const messageError = document.getElementById('messageError');
      if (!messageVal) {
        if (messageError) messageError.classList.add('visible');
        isValid = false;
      } else {
        if (messageError) messageError.classList.remove('visible');
      }

      if (!isValid) return;

      const reviewPayload = {
        name: nameVal,
        branch: branchVal,
        year: yearVal,
        stars: selectedRatingValue,
        review: messageVal
      };

      try {
        await EcaAPI.submitReview(reviewPayload);
      } catch (err) {
        console.warn('Backend review submission failed, falling back to local DB:', err);
        if (typeof EcaSQLDB !== 'undefined') {
          EcaSQLDB.addPendingReview({
            id: 'rev-' + Date.now(),
            ...reviewPayload,
            status: 'pending',
            created_at: new Date().toLocaleString(),
            timestamp: Date.now()
          });
        }
      }

      // Reset form fields and reset stars to 5
      ratingForm.reset();
      setStarRating(5);

      // Show success feedback banner
      if (reviewSuccessBanner) {
        reviewSuccessBanner.style.display = 'block';
        setTimeout(() => {
          reviewSuccessBanner.style.display = 'none';
        }, 7000);
      }

      showToast('🎉 Review submitted! It has been sent to the Owner Portal for verification.');
    });
  }


  // =========================================================
  // 9. FILE UPLOAD & DRAG-AND-DROP (With IndexedDB Persistent Storage)
  // =========================================================
  if (uploadDropzone && fileUploadInput) {
    uploadDropzone.addEventListener('click', () => {
      fileUploadInput.click();
    });

    fileUploadInput.addEventListener('change', (e) => {
      handleFileSelected(e.target.files[0]);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      uploadDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadDropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      uploadDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadDropzone.classList.remove('dragover');
      });
    });

    uploadDropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt.files && dt.files.length > 0) {
        handleFileSelected(dt.files[0]);
      }
    });
  }

  function handleFileSelected(file) {
    if (!file) return;

    // Validate size (<= 4MB)
    const maxSize = 4 * 1024 * 1024;
    if (file.size > maxSize) {
      showFileError('File size must be 4 MB or less.');
      clearSelectedFile();
      return;
    }

    // Validate extension
    const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    const fileNameLower = file.name.toLowerCase();
    const isValidExt = validExtensions.some(ext => fileNameLower.endsWith(ext));

    if (!isValidExt) {
      showFileError('Invalid file type. Only PDF, JPG, PNG, DOC, and DOCX files are allowed.');
      clearSelectedFile();
      return;
    }

    hideFileError();
    stagedFile = file;

    if (dropzoneIdle && dropzoneSelected && selectedFileName && selectedFileSize) {
      selectedFileName.textContent = file.name;
      selectedFileSize.textContent = formatBytes(file.size);
      dropzoneIdle.style.display = 'none';
      dropzoneSelected.style.display = 'flex';
    }
  }

  if (removeFileBtn) {
    removeFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSelectedFile();
    });
  }

  function clearSelectedFile() {
    stagedFile = null;
    if (fileUploadInput) fileUploadInput.value = '';
    if (dropzoneIdle && dropzoneSelected) {
      dropzoneIdle.style.display = 'flex';
      dropzoneSelected.style.display = 'none';
    }
  }

  function showFileError(msg) {
    if (fileError) {
      fileError.textContent = msg;
      fileError.style.display = 'block';
    }
  }

  function hideFileError() {
    if (fileError) {
      fileError.style.display = 'none';
    }
  }

  function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }


  // =========================================================
  // 10. STUDENT CONTRIBUTION FORM SUBMIT
  // =========================================================
  if (contributeForm) {
    contributeForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('contribName');
      const email = document.getElementById('contribEmail');
      const year = document.getElementById('contribYear');
      const subject = document.getElementById('contribSubject');
      const type = document.getElementById('contribType');
      const title = document.getElementById('contribTitle');

      let isValid = true;

      // Validate required inputs
      const fields = [
        { el: name, err: 'contribNameError' },
        { el: subject, err: 'contribSubjectError' },
        { el: title, err: 'contribTitleError' }
      ];

      fields.forEach(({ el, err }) => {
        const errEl = document.getElementById(err);
        if (!el.value.trim()) {
          errEl?.classList.add('visible');
          isValid = false;
        } else {
          errEl?.classList.remove('visible');
        }
      });

      // Email validation
      const emailErr = document.getElementById('contribEmailError');
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email.value.trim() || !emailRegex.test(email.value.trim())) {
        emailErr?.classList.add('visible');
        isValid = false;
      } else {
        emailErr?.classList.remove('visible');
      }

      // Check file
      if (!stagedFile) {
        showFileError('Please attach your notes or document file.');
        isValid = false;
      } else if (stagedFile.size > 4 * 1024 * 1024) {
        showFileError('File size must be 4 MB or less.');
        isValid = false;
      }

      if (!isValid) return;

      const submitBtn = contributeForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Uploading...';
      }

      try {
        const formData = new FormData();
        formData.append('name', name.value.trim());
        formData.append('email', email.value.trim());
        formData.append('year', year.value);
        formData.append('branch', contribBranch ? contribBranch.value : 'All');
        formData.append('subject', subject.value.trim());
        formData.append('type', type.value);
        formData.append('title', title.value.trim());
        if (stagedFile) {
          formData.append('file', stagedFile);
        }

        await EcaAPI.uploadResource(formData);
      } catch (err) {
        console.warn('Backend upload failed, falling back to local DB/IndexedDB:', err);
        if (typeof EcaFileStore !== 'undefined' && stagedFile) {
          const resId = 'pend-' + Date.now();
          await EcaFileStore.saveFile(resId, stagedFile, stagedFile.name, stagedFile.type);
          if (typeof EcaSQLDB !== 'undefined') {
            EcaSQLDB.addPendingUpload({
              id: resId,
              title: title.value.trim(),
              author: name.value.trim(),
              email: email.value.trim(),
              year: year.value,
              subject: subject.value.trim(),
              type: type.value,
              file_name: stagedFile.name,
              file_size: formatBytes(stagedFile.size),
              file_type: stagedFile.type,
              has_real_file: true,
              status: 'pending',
              created_at: new Date().toLocaleString()
            });
          }
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Upload Material &rarr;';
        }
      }

      updatePendingBadges();

      // Show success feedback
      if (contribSuccessBanner) {
        contribSuccessBanner.style.display = 'block';
        setTimeout(() => {
          contribSuccessBanner.style.display = 'none';
        }, 6000);
      }

      showToast('🎉 Note uploaded successfully! Sent to the Owner for verification.');

      // Notify other components of potential new subject
      window.dispatchEvent(new CustomEvent('ecanotes_db_change'));
      try {
        localStorage.setItem('ecanotes_sync_trigger', Date.now().toString());
      } catch {}

      // Reset form
      contributeForm.reset();
      clearSelectedFile();
    });
  }


  // =========================================================
  // 11. RESOURCE MODAL & AUTHENTIC PDF DOWNLOAD/PREVIEW
  // =========================================================

  function openResourceModal(res) {
    activeModalResource = res;
    if (modalResourceTitle) modalResourceTitle.textContent = res.title;
    if (modalResourceType) modalResourceType.textContent = res.type;
    if (modalResourceMeta) modalResourceMeta.textContent = `${res.year} · ${res.subject} · By ${res.author}`;
    if (modalResourceDesc) modalResourceDesc.textContent = res.description;

    if (resourceModal) {
      resourceModal.classList.add('active');
      resourceModal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeResourceModal() {
    if (resourceModal) {
      resourceModal.classList.remove('active');
      resourceModal.setAttribute('aria-hidden', 'true');
      activeModalResource = null;
    }
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeResourceModal);
  if (modalDismissBtn) modalDismissBtn.addEventListener('click', closeResourceModal);
  if (resourceModal) {
    resourceModal.addEventListener('click', (e) => {
      if (e.target === resourceModal) closeResourceModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && resourceModal && resourceModal.classList.contains('active')) {
      closeResourceModal();
    }
  });

  if (modalPreviewBtn) {
    modalPreviewBtn.addEventListener('click', () => {
      if (activeModalResource) {
        previewResourceFile(activeModalResource);
      }
    });
  }

  if (modalDownloadBtn) {
    modalDownloadBtn.addEventListener('click', () => {
      if (activeModalResource) {
        downloadResourceFile(activeModalResource);
        closeResourceModal();
      }
    });
  }

  /**
   * Preview genuine PDF file in a new tab
   */
  async function previewResourceFile(res) {
    showToast(`Opening preview: ${res.title}...`);
    try {
      if (res.id) {
        const previewUrl = typeof EcaAPI !== 'undefined' ? EcaAPI.getPreviewUrl(res.id) : `/api/preview/${res.id}`;
        window.open(previewUrl, '_blank');
        return;
      }
      const stored = typeof EcaFileStore !== 'undefined' ? await EcaFileStore.getFile(res.id) : null;
      if (stored && stored.blob) {
        const url = URL.createObjectURL(stored.blob);
        window.open(url, '_blank');
      } else if (typeof PDFGenerator !== 'undefined') {
        const pdfBlob = PDFGenerator.generateResourcePDF(res);
        const url = URL.createObjectURL(pdfBlob);
        window.open(url, '_blank');
      }
    } catch (err) {
      console.error('Preview error:', err);
      showToast('Error generating preview.');
    }
  }

  /**
   * Download authentic PDF (or real uploaded file)
   */
  async function downloadResourceFile(res) {
    showToast(`Preparing download: ${res.title}...`);

    try {
      // Stream real PDF directly from backend API
      if (typeof EcaAPI !== 'undefined') {
        EcaAPI.downloadResource(res.id, res.file_name);
        const counterEl = document.getElementById(`dl-count-${res.id}`);
        if (counterEl) {
          const current = parseInt(counterEl.textContent.replace(/,/g, ''), 10) || 0;
          counterEl.textContent = (current + 1).toLocaleString();
        }
        showToast(`✅ Downloaded: ${res.file_name || res.title}`);
        return;
      }

      const stored = typeof EcaFileStore !== 'undefined' ? await EcaFileStore.getFile(res.id) : null;
      let blobToDownload = null;
      let targetFileName = res.file_name || `${res.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;

      if (stored && stored.blob) {
        blobToDownload = stored.blob;
        if (stored.fileName) targetFileName = stored.fileName;
      } else if (typeof PDFGenerator !== 'undefined') {
        blobToDownload = PDFGenerator.generateResourcePDF(res);
        if (!targetFileName.endsWith('.pdf')) targetFileName += '.pdf';
      }

      if (blobToDownload) {
        const link = document.createElement('a');
        const url = URL.createObjectURL(blobToDownload);
        link.href = url;
        link.download = targetFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }

      if (typeof EcaSQLDB !== 'undefined') {
        const newCount = EcaSQLDB.incrementDownloads(res.id);
        const counterEl = document.getElementById(`dl-count-${res.id}`);
        if (counterEl) counterEl.textContent = newCount.toLocaleString();
      }

      showToast(`✅ Downloaded: ${targetFileName}`);
    } catch (err) {
      console.error('Download error:', err);
      showToast('Error generating download file.');
    }
  }


  // =========================================================
  // 12. OWNER PENDING BADGE & CROSS-TAB SYNCHRONIZATION
  // =========================================================
  async function updatePendingBadges() {
    let count = 0;
    try {
      const stats = await EcaAPI.getAdminStats();
      if (stats) count = (stats.pending || 0) + (stats.pendingReviews || 0);
    } catch {}

    if (count === 0 && typeof EcaSQLDB !== 'undefined') {
      const pending = EcaSQLDB.getPendingUploads();
      count = pending.length;
    }

    if (ownerPendingBadge) {
      ownerPendingBadge.textContent = count;
      ownerPendingBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (mobilePendingBadge) {
      mobilePendingBadge.textContent = count;
      mobilePendingBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }
  }

  // Real-time synchronization across browser tabs
  window.addEventListener('storage', async (e) => {
    if (e.key === 'ecanotes_sync_trigger' || e.key === 'ecanotes_sql_db') {
      await updateSubjectFilterDropdown(currentFilters.year, true);
      if (contribYearSelect) await updateContribSubjectSuggestions(contribYearSelect.value);
      await renderResources();
      await renderReviews();
      await updatePendingBadges();
    }
  });

  window.addEventListener('ecanotes_db_change', async () => {
    await updateSubjectFilterDropdown(currentFilters.year, true);
    if (contribYearSelect) await updateContribSubjectSuggestions(contribYearSelect.value);
    await renderResources();
    await renderReviews();
    await updatePendingBadges();
  });


  // =========================================================
  // 13. TOAST & HELPERS
  // =========================================================
  function showToast(msg) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('visible'), 50);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
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

  // Initial renders
  updateSubjectFilterDropdown(currentFilters.year, false).then(() => {
    renderResources();
  });
  if (contribYearSelect) {
    updateContribSubjectSuggestions(contribYearSelect.value);
  }
  renderReviews();
  updatePendingBadges();

  // Copyright year
  const currentYearSpan = document.getElementById('currentYear');
  if (currentYearSpan) {
    currentYearSpan.textContent = new Date().getFullYear();
  }
});
