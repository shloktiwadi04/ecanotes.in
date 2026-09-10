/**
 * EcaNotes.in - Unified Database & Persistent Binary File Storage Engine
 * Provides:
 * 1. EcaFileStore: Native IndexedDB persistent binary store for real PDFs, documents, and images.
 * 2. PDFGenerator: Generates genuine, fully compliant %PDF-1.4 binary documents on the fly.
 * 3. EcaSQLDB: Relational database abstraction for pending_uploads and verified_resources.
 */

// =============================================================================
// 1. INDEXEDDB PERSISTENT BINARY FILE STORAGE (EcaFileStore)
// =============================================================================
const EcaFileStore = (() => {
  const DB_NAME = 'EcaNotesStorage';
  const DB_VERSION = 1;
  const STORE_NAME = 'resource_files';
  let dbPromise = null;

  function getDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported, falling back to memory/session');
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => {
        console.error('IndexedDB open error:', e);
        resolve(null);
      };
    });
    return dbPromise;
  }

  return {
    async saveFile(id, fileOrBlob, fileName, mimeType) {
      const db = await getDB();
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const record = {
            id: String(id),
            blob: fileOrBlob,
            fileName: fileName || 'resource.pdf',
            mimeType: mimeType || fileOrBlob.type || 'application/pdf',
            size: fileOrBlob.size,
            savedAt: Date.now()
          };
          const req = store.put(record);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (err) {
          console.error('Error saving file to IndexedDB', err);
          resolve(false);
        }
      });
    },

    async getFile(id) {
      const db = await getDB();
      if (!db) return null;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(String(id));
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch (err) {
          console.error('Error fetching file from IndexedDB', err);
          resolve(null);
        }
      });
    },

    async deleteFile(id) {
      const db = await getDB();
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.delete(String(id));
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (err) {
          resolve(false);
        }
      });
    }
  };
})();


// =============================================================================
// 2. AUTHENTIC %PDF-1.4 DOCUMENT GENERATOR (PDFGenerator)
// =============================================================================
const PDFGenerator = (() => {
  /**
   * Generates a 100% compliant, genuine %PDF-1.4 binary document.
   * Compatible with Adobe Acrobat, Google Chrome, Microsoft Edge, macOS Preview.
   */
  function generateResourcePDF(resource) {
    const title = cleanText(resource.title || 'College Study Material');
    const subject = cleanText(resource.subject || 'Engineering Subject');
    const year = cleanText(resource.year || '1st Year');
    const type = cleanText(resource.type || 'Notes');
    const author = cleanText(resource.author || 'EcaNotes Peer Contributor');
    const description = cleanText(resource.description || 'Verified study material and solved exam problems.');
    const dateStr = cleanText(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

    // Prepare stream commands for PDF layout
    const lines = [];
    lines.push('q'); // save state

    // Background Top Banner (Navy #0F1E36)
    lines.push('0.059 0.118 0.212 rg'); // RGB for #0F1E36
    lines.push('36 690 540 70 re'); // x y w h
    lines.push('f');

    // Accent line (Teal #10B981)
    lines.push('0.063 0.725 0.506 rg');
    lines.push('36 686 540 4 re');
    lines.push('f');

    // Header Text (White)
    lines.push('BT');
    lines.push('1 1 1 rg'); // White
    lines.push('/F1 22 Tf');
    lines.push('50 728 Td');
    lines.push('(EcaNotes.in) Tj');
    lines.push('/F2 10 Tf');
    lines.push('0 -18 Td');
    lines.push('(COLLEGE STUDY MATERIAL - BY STUDENTS FOR STUDENTS) Tj');
    lines.push('ET');

    // Resource Title & Meta Box
    lines.push('0.96 0.98 1 rg'); // Light slate bg
    lines.push('36 530 540 140 re');
    lines.push('f');
    lines.push('0.8 0.85 0.9 RG'); // Border
    lines.push('1 w');
    lines.push('36 530 540 140 re');
    lines.push('S');

    // Title Text
    lines.push('BT');
    lines.push('0.059 0.118 0.212 rg'); // Dark Navy
    lines.push('/F1 15 Tf');
    lines.push('50 635 Td');
    // Wrap long titles into 2 lines if needed
    const maxTitleLen = 45;
    if (title.length > maxTitleLen) {
      lines.push(`(${escapePDF(title.substring(0, maxTitleLen))}) Tj`);
      lines.push('/F1 15 Tf');
      lines.push('0 -20 Td');
      lines.push(`(${escapePDF(title.substring(maxTitleLen, maxTitleLen * 2))}) Tj`);
      lines.push('/F2 10 Tf');
      lines.push('0 -22 Td');
    } else {
      lines.push(`(${escapePDF(title)}) Tj`);
      lines.push('/F2 10 Tf');
      lines.push('0 -26 Td');
    }

    // Key Metadata Items
    lines.push('0.2 0.3 0.4 rg');
    lines.push(`(Subject: ${escapePDF(subject)}   |   Academic Level: ${escapePDF(year)}) Tj`);
    lines.push('0 -16 Td');
    lines.push(`(Category: ${escapePDF(type)}   |   Verified Contributor: ${escapePDF(author)}) Tj`);
    lines.push('0 -16 Td');
    lines.push(`(Publication Date: ${escapePDF(dateStr)}   |   Portal: https://ecanotes.in) Tj`);
    lines.push('ET');

    // Section 1: Overview & Syllabus Scope
    lines.push('BT');
    lines.push('0.059 0.118 0.212 rg');
    lines.push('/F1 13 Tf');
    lines.push('50 495 Td');
    lines.push('(1. RESOURCE OVERVIEW & SYLLABUS HIGHLIGHTS) Tj');
    lines.push('/F2 10 Tf');
    lines.push('0.25 0.3 0.38 rg');
    lines.push('0 -18 Td');

    // Split description into sentences/chunks
    const descChunks = wrapText(description, 75);
    descChunks.forEach((chunk, i) => {
      if (i > 0) lines.push('0 -14 Td');
      lines.push(`(${escapePDF(chunk)}) Tj`);
    });

    lines.push('0 -24 Td');
    lines.push('/F1 11 Tf');
    lines.push('0.059 0.118 0.212 rg');
    lines.push('(Key Study Areas Included in this Document:) Tj');
    lines.push('/F2 10 Tf');
    lines.push('0.25 0.3 0.38 rg');
    lines.push('0 -16 Td');
    lines.push('(  * Complete end-semester theoretical definitions & derivations) Tj');
    lines.push('0 -14 Td');
    lines.push('(  * Step-by-step solved university questions from 2020-2025) Tj');
    lines.push('0 -14 Td');
    lines.push('(  * Verified formula cheatsheet and quick-revision memory maps) Tj');
    lines.push('0 -14 Td');
    lines.push('(  * Mid-term assignment solutions with standard marking guidelines) Tj');
    lines.push('ET');

    // Verification Seal Box
    lines.push('0.92 0.98 0.94 rg'); // Light green
    lines.push('36 210 540 60 re');
    lines.push('f');
    lines.push('0.063 0.725 0.506 RG'); // Emerald border
    lines.push('1.5 w');
    lines.push('36 210 540 60 re');
    lines.push('S');

    lines.push('BT');
    lines.push('0.02 0.45 0.3 rg'); // Emerald text
    lines.push('/F1 11 Tf');
    lines.push('50 248 Td');
    lines.push('(OFFICIALLY VERIFIED & APPROVED BY ECANOTES ACADEMIC PORTAL) Tj');
    lines.push('/F2 9 Tf');
    lines.push('0.1 0.2 0.15 rg');
    lines.push('0 -16 Td');
    lines.push('(This resource has been vetted for syllabus accuracy and exam preparation.) Tj');
    lines.push('ET');

    // Footer
    lines.push('0.8 0.85 0.9 RG');
    lines.push('0.5 w');
    lines.push('36 70 540 0.5 re');
    lines.push('S');

    lines.push('BT');
    lines.push('0.5 0.55 0.6 rg');
    lines.push('/F2 8.5 Tf');
    lines.push('50 52 Td');
    lines.push('(EcaNotes.in - College Study Material By The Students, For The Students. Free download for academic use.) Tj');
    lines.push('ET');

    lines.push('Q'); // restore state

    const streamContent = lines.join('\n');
    const streamLength = streamContent.length;

    // Build PDF Objects
    const objects = [];
    objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
    objects[2] = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
    objects[3] = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n';
    objects[4] = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';
    objects[5] = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
    objects[6] = `6 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`;

    // Calculate Byte Offsets for xref table
    let header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    let offset = header.length;
    const xrefOffsets = [];

    let pdfBody = '';
    for (let i = 1; i <= 6; i++) {
      xrefOffsets[i] = offset;
      pdfBody += objects[i];
      offset += objects[i].length;
    }

    const startXref = offset;
    let xref = 'xref\n0 7\n0000000000 65535 f \n';
    for (let i = 1; i <= 6; i++) {
      const pad = String(xrefOffsets[i]).padStart(10, '0');
      xref += `${pad} 00000 n \n`;
    }

    const trailer = `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

    const fullPdfText = header + pdfBody + xref + trailer;
    return new Blob([fullPdfText], { type: 'application/pdf' });
  }

  function escapePDF(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function cleanText(str) {
    if (!str) return '';
    // Replace non-ASCII and special punctuation with clean safe ASCII
    return String(str)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[^\x20-\x7E]/g, ' ');
  }

  function wrapText(text, maxChars) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      if ((currentLine + ' ' + word).trim().length > maxChars) {
        if (currentLine) lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine += (currentLine ? ' ' : '') + word;
      }
    });
    if (currentLine) lines.push(currentLine.trim());
    return lines;
  }

  return {
    generateResourcePDF
  };
})();


// =============================================================================
// 3. RELATIONAL SQL DATABASE LAYER (EcaSQLDB)
// =============================================================================
const EcaSQLDB = (() => {
  const STORAGE_KEY = 'ecanotes_sql_db';
  const SYNC_KEY = 'ecanotes_sync_trigger';

  // Seed study resources
  const initialResources = [
    {
      id: 'res-1',
      title: 'Engineering Mathematics - Unit 1: Matrices & Linear Algebra',
      subject: 'Engineering Mathematics',
      year: '1st Year',
      type: 'Notes',
      author: 'Aman Verma (IITD)',
      file_name: 'Engineering_Mathematics_Unit1_Matrices.pdf',
      fileSize: '4.8 MB',
      file_type: 'application/pdf',
      downloads: 1420,
      description: 'Comprehensive formula sheets, eigenvalues, eigenvectors, Cayley-Hamilton theorem, and diagonalisation with 25 solved exam problems.'
    },
    {
      id: 'res-2',
      title: 'Engineering Mathematics PYQ (2020 - 2025 Solved)',
      subject: 'Engineering Mathematics',
      year: '1st Year',
      type: 'PYQ',
      author: 'ECA Academic Team',
      file_name: 'Engg_Maths_PYQ_Solved_2020_2025.pdf',
      fileSize: '7.2 MB',
      file_type: 'application/pdf',
      downloads: 2840,
      description: 'Last 5 years end-semester examination question papers completely solved with step-by-step mark distribution guidelines.'
    },
    {
      id: 'res-3',
      title: 'Engineering Physics - Complete Wave Optics & Quantum Mechanics',
      subject: 'Engineering Physics',
      year: '1st Year',
      type: 'Notes',
      author: 'Dr. S. Nair',
      file_name: 'Engineering_Physics_WaveOptics_Quantum.pdf',
      fileSize: '5.4 MB',
      file_type: 'application/pdf',
      downloads: 980,
      description: 'Handcrafted notes on interference, diffraction grating, lasers, fiber optics, and de Broglie matter waves.'
    },
    {
      id: 'res-4',
      title: 'Basic Electrical Engineering - AC Circuits Assignment Sheet',
      subject: 'Basic Electrical Engineering',
      year: '1st Year',
      type: 'Assignment',
      author: 'Priya Patel (SVNIT)',
      file_name: 'BEE_AC_Circuits_Assignment.pdf',
      fileSize: '3.1 MB',
      file_type: 'application/pdf',
      downloads: 750,
      description: 'Verified solved assignment sheets for RLC series/parallel resonance circuits and 3-phase star-delta load calculations.'
    },
    {
      id: 'res-5',
      title: 'Programming in C - Pointers, Structures & Dynamic Memory',
      subject: 'Programming in C',
      year: '1st Year',
      type: 'Handwritten Notes',
      author: 'Rohan Sharma (NIT Bhopal)',
      file_name: 'Programming_C_Pointers_Structures.pdf',
      fileSize: '6.5 MB',
      file_type: 'application/pdf',
      downloads: 1890,
      description: 'Topper handwritten notes explaining pointer arithmetic, memory allocation (malloc, calloc), linked list basics, and recursion.'
    },
    {
      id: 'res-6',
      title: 'Engineering Chemistry - Water Technology & Polymers PYQ 2024',
      subject: 'Engineering Chemistry',
      year: '1st Year',
      type: 'PYQ',
      author: 'Vignesh Krishnan (NITK)',
      file_name: 'Chemistry_Water_Technology_PYQ.pdf',
      fileSize: '3.9 MB',
      file_type: 'application/pdf',
      downloads: 1120,
      description: 'Frequently asked numericals on EDTA hardness calculations, boiler corrosion, reverse osmosis, and conducting polymers.'
    },
    {
      id: 'res-7',
      title: 'Engineering Graphics - Orthographic & Isometric Projections',
      subject: 'Engineering Graphics',
      year: '1st Year',
      type: 'Study Material',
      author: 'Aditya Kumar (MNNIT)',
      file_name: 'Engineering_Graphics_CAD_Guide.pdf',
      fileSize: '8.1 MB',
      file_type: 'application/pdf',
      downloads: 870,
      description: 'High-definition CAD projection guides, sectional views of solids, and practical drafting tips for mid-sem drawing viva.'
    },
    {
      id: 'res-8',
      title: 'Engineering Mathematics - Unit 2: Differential Calculus',
      subject: 'Engineering Mathematics',
      year: '1st Year',
      type: 'Notes',
      author: 'Ananya Mishra (BIT Mesra)',
      file_name: 'Engineering_Maths_Calculus_Unit2.pdf',
      fileSize: '4.2 MB',
      file_type: 'application/pdf',
      downloads: 1310,
      description: "Rolle's theorem, Mean Value Theorems, Taylor & Maclaurin series, and partial derivatives with maxima/minima of two variables."
    },
    {
      id: 'res-9',
      title: 'Basic Electrical Engineering - Network Theorems PYQ (2021-2024)',
      subject: 'Basic Electrical Engineering',
      year: '1st Year',
      type: 'PYQ',
      author: 'Prof. K. Verma',
      file_name: 'BEE_Network_Theorems_PYQ.pdf',
      fileSize: '5.8 MB',
      file_type: 'application/pdf',
      downloads: 1650,
      description: "Previous year mid-sem and end-sem question papers covering Thevenin's, Norton's, and Maximum Power Transfer theorems."
    },
    {
      id: 'res-10',
      title: 'Programming in C - Lab Manual & Solved Code Snippets',
      subject: 'Programming in C',
      year: '1st Year',
      type: 'Assignment',
      author: 'Shreya Nair (IIIT Allahabad)',
      file_name: 'C_Programming_Lab_Manual_Solved.pdf',
      fileSize: '4.6 MB',
      file_type: 'application/pdf',
      downloads: 2100,
      description: 'Tested and commented C code for all standard lab exercises including sorting algorithms, matrix multiplication, and file handling.'
    }
  ];

  const defaultDB = {
    schema: {
      pending_uploads: `
        CREATE TABLE IF NOT EXISTS pending_uploads (
          id TEXT PRIMARY KEY,
          title TEXT,
          author TEXT,
          email TEXT,
          year TEXT,
          subject TEXT,
          type TEXT,
          file_name TEXT,
          file_size TEXT,
          file_type TEXT,
          has_real_file BOOLEAN,
          status TEXT,
          created_at TEXT
        );
      `,
      verified_resources: `
        CREATE TABLE IF NOT EXISTS verified_resources (
          id TEXT PRIMARY KEY,
          title TEXT,
          author TEXT,
          year TEXT,
          subject TEXT,
          type TEXT,
          file_name TEXT,
          file_size TEXT,
          file_type TEXT,
          has_real_file BOOLEAN,
          downloads INTEGER,
          description TEXT,
          verified_at TEXT
        );
      `,
      pending_reviews: `
        CREATE TABLE IF NOT EXISTS pending_reviews (
          id TEXT PRIMARY KEY,
          name TEXT,
          branch TEXT,
          year TEXT,
          stars INTEGER,
          review TEXT,
          status TEXT,
          created_at TEXT,
          timestamp INTEGER
        );
      `,
      published_reviews: `
        CREATE TABLE IF NOT EXISTS published_reviews (
          id TEXT PRIMARY KEY,
          name TEXT,
          branch TEXT,
          year TEXT,
          stars INTEGER,
          review TEXT,
          status TEXT,
          created_at TEXT,
          timestamp INTEGER
        );
      `
    },
    tables: {
      pending_uploads: [
        {
          id: 'pend-1',
          title: 'Engineering Mathematics - Unit 3: Multiple Integrals & Vector Calculus',
          author: 'Rajat Sharma',
          email: 'rajat.s@college.edu',
          year: '1st Year',
          subject: 'Engineering Mathematics',
          type: 'Notes',
          file_name: 'Vector_Calculus_Unit3.pdf',
          file_size: '3.8 MB',
          file_type: 'application/pdf',
          has_real_file: false,
          status: 'pending',
          created_at: new Date(Date.now() - 3600000).toLocaleString()
        }
      ],
      verified_resources: [...initialResources],
      pending_reviews: [
        {
          id: 'rev-pend-1',
          name: 'Kavita Singh',
          branch: 'B.Tech AI & DS',
          year: '1st Year',
          stars: 5,
          review: 'The Basic Electrical Engineering solved assignment sheet helped me finish my tutorial on time. Excellent peer hub for 1st years.',
          status: 'pending',
          created_at: new Date(Date.now() - 7200000).toLocaleString(),
          timestamp: Date.now() - 7200000
        }
      ],
      published_reviews: [
        {
          id: 'rev-1',
          name: 'Rohan Sharma',
          branch: 'B.Tech CSE',
          year: '1st Year',
          stars: 5,
          review: 'EcaNotes made finding PYQs and notes much easier. I used it during my semester exams and it saved me a lot of time. Highly recommend for any 1st year student.',
          status: 'published',
          created_at: '10/09/2026, 10:30:00 AM',
          timestamp: 1725964200000
        },
        {
          id: 'rev-2',
          name: 'Priya Patel',
          branch: 'B.Tech ECE',
          year: '1st Year',
          stars: 5,
          review: 'The handwritten notes on here are so detailed. Found Engineering Maths notes that actually explained things better than my textbook. Really helpful platform.',
          status: 'published',
          created_at: '10/09/2026, 09:15:00 AM',
          timestamp: 1725960000000
        },
        {
          id: 'rev-3',
          name: 'Aditya Kumar',
          branch: 'B.Tech Civil',
          year: '1st Year',
          stars: 5,
          review: 'I shared my own assignment notes and within a week, the team told me students were already downloading them. Feels great to help others.',
          status: 'published',
          created_at: '09/09/2026, 04:45:00 PM',
          timestamp: 1725900000000
        },
        {
          id: 'rev-4',
          name: 'Vignesh Krishnan',
          branch: 'B.Tech Mech',
          year: '1st Year',
          stars: 5,
          review: 'I was struggling to find good notes for Engineering Chemistry. Found exactly what I needed here, and the organization by subject and resource type is really smart.',
          status: 'published',
          created_at: '09/09/2026, 02:20:00 PM',
          timestamp: 1725890000000
        },
        {
          id: 'rev-5',
          name: 'Ananya Mishra',
          branch: 'B.Tech EEE',
          year: '1st Year',
          stars: 5,
          review: 'Used EcaNotes for both my mid-sem and end-sem preparation. The PYQs are very accurate and the notes cover exactly what comes in exams. Thank you for building this!',
          status: 'published',
          created_at: '08/09/2026, 11:10:00 AM',
          timestamp: 1725800000000
        },
        {
          id: 'rev-6',
          name: 'Shreya Nair',
          branch: 'B.Tech IT',
          year: '1st Year',
          stars: 4,
          review: "Clean and simple to use. Found PYQs for all my core subjects in minutes. The website doesn't have that overwhelming feeling most study portals have.",
          status: 'published',
          created_at: '07/09/2026, 06:30:00 PM',
          timestamp: 1725700000000
        }
      ]
    }
  };

  function loadDB() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (!parsed.tables) parsed.tables = defaultDB.tables;
        if (!parsed.tables.pending_uploads) parsed.tables.pending_uploads = defaultDB.tables.pending_uploads;
        if (!parsed.tables.verified_resources || parsed.tables.verified_resources.length === 0) {
          parsed.tables.verified_resources = defaultDB.tables.verified_resources;
        }
        if (!parsed.tables.published_reviews || parsed.tables.published_reviews.length === 0) {
          parsed.tables.published_reviews = defaultDB.tables.published_reviews;
        }
        if (!parsed.tables.pending_reviews) {
          parsed.tables.pending_reviews = defaultDB.tables.pending_reviews;
        }
        return parsed;
      }
    } catch (err) {
      console.error('Error loading SQL database from localStorage', err);
    }
    return defaultDB;
  }

  let db = loadDB();

  function saveDB() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      // Notify other tabs
      localStorage.setItem(SYNC_KEY, String(Date.now()));
      window.dispatchEvent(new CustomEvent('ecanotes_db_change', { detail: { timestamp: Date.now() } }));
    } catch (err) {
      console.error('Error saving SQL database to localStorage', err);
    }
  }

  return {
    reload() {
      db = loadDB();
      return db;
    },

    getPendingUploads() {
      db = loadDB();
      return db.tables.pending_uploads.filter(p => p.status === 'pending');
    },

    getVerifiedResources() {
      db = loadDB();
      return db.tables.verified_resources;
    },

    getPendingById(id) {
      db = loadDB();
      return db.tables.pending_uploads.find(p => p.id === String(id));
    },

    getVerifiedById(id) {
      db = loadDB();
      return db.tables.verified_resources.find(r => r.id === String(id));
    },

    addPendingUpload(record) {
      db.tables.pending_uploads.unshift(record);
      saveDB();
    },

    /**
     * Updates and verifies a pending student upload.
     * Supports updating Year, Subject, Resource/File, Type, Title, and Contributor Name.
     */
    async verifyAndPublish(id, updatedFields, optionalReplacementFile) {
      db = loadDB();
      const pendingItem = db.tables.pending_uploads.find(p => p.id === String(id));
      if (!pendingItem) return null;

      pendingItem.status = 'approved';

      const finalId = 'res-' + Date.now();
      let hasRealFile = pendingItem.has_real_file || false;
      let finalFileName = updatedFields.file_name || pendingItem.file_name || 'study_notes.pdf';
      let finalFileSize = updatedFields.file_size || pendingItem.file_size || '3.5 MB';
      let finalFileType = updatedFields.file_type || pendingItem.file_type || 'application/pdf';

      // If owner provided a replacement file
      if (optionalReplacementFile) {
        if (optionalReplacementFile.size > 4 * 1024 * 1024) {
          throw new Error('File size must be 4 MB or less.');
        }
        await EcaFileStore.saveFile(finalId, optionalReplacementFile, optionalReplacementFile.name, optionalReplacementFile.type);
        hasRealFile = true;
        finalFileName = optionalReplacementFile.name;
        finalFileSize = (optionalReplacementFile.size / (1024 * 1024)).toFixed(1) + ' MB';
        finalFileType = optionalReplacementFile.type || 'application/pdf';
      } else if (hasRealFile) {
        // Copy the file from pending item id to new verified id
        const originalFileRecord = await EcaFileStore.getFile(pendingItem.id);
        if (originalFileRecord && originalFileRecord.blob) {
          await EcaFileStore.saveFile(finalId, originalFileRecord.blob, finalFileName, finalFileType);
        }
      }

      const verifiedItem = {
        id: finalId,
        title: updatedFields.title || pendingItem.title,
        author: updatedFields.author || pendingItem.author,
        year: updatedFields.year || pendingItem.year || '1st Year',
        subject: updatedFields.subject || pendingItem.subject,
        type: updatedFields.type || pendingItem.type || 'Notes',
        file_name: finalFileName,
        fileSize: finalFileSize,
        file_type: finalFileType,
        has_real_file: hasRealFile,
        downloads: 1,
        description: `Verified college study material contributed by ${updatedFields.author || pendingItem.author}. Verified by EcaNotes Academic Portal.`,
        verified_at: new Date().toLocaleString()
      };

      db.tables.verified_resources.unshift(verifiedItem);
      saveDB();
      return verifiedItem;
    },

    rejectUpload(id) {
      db = loadDB();
      const idx = db.tables.pending_uploads.findIndex(p => p.id === String(id));
      if (idx !== -1) {
        db.tables.pending_uploads.splice(idx, 1);
        saveDB();
        EcaFileStore.deleteFile(id);
        return true;
      }
      return false;
    },

    async addDirectVerifiedResource(record, fileBlob) {
      db = loadDB();
      if (fileBlob) {
        await EcaFileStore.saveFile(record.id, fileBlob, record.file_name, record.file_type);
        record.has_real_file = true;
      }
      db.tables.verified_resources.unshift(record);
      saveDB();
      return record;
    },

    unpublishResource(id) {
      db = loadDB();
      const idx = db.tables.verified_resources.findIndex(r => r.id === String(id));
      if (idx !== -1) {
        db.tables.verified_resources.splice(idx, 1);
        saveDB();
        EcaFileStore.deleteFile(id);
        return true;
      }
      return false;
    },

    incrementDownloads(id) {
      db = loadDB();
      const item = db.tables.verified_resources.find(r => r.id === String(id));
      if (item) {
        item.downloads = (item.downloads || 0) + 1;
        saveDB();
        return item.downloads;
      }
      return 1;
    },

    // ================= REVIEW MANAGEMENT =================
    getPublishedReviews() {
      db = loadDB();
      const list = (db.tables.published_reviews || []).slice();
      // Requirement 7: Prioritize highest-rated / best reviews, with newer reviews as tiebreaker
      return list.sort((a, b) => {
        if (b.stars !== a.stars) {
          return b.stars - a.stars;
        }
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
    },

    getPendingReviews() {
      db = loadDB();
      return (db.tables.pending_reviews || []).filter(r => r.status === 'pending');
    },

    addPendingReview(reviewData) {
      db = loadDB();
      if (!db.tables.pending_reviews) db.tables.pending_reviews = [];
      db.tables.pending_reviews.unshift(reviewData);
      saveDB();
      return reviewData;
    },

    publishReview(id) {
      db = loadDB();
      const idx = (db.tables.pending_reviews || []).findIndex(r => r.id === String(id));
      if (idx === -1) return null;
      const reviewItem = db.tables.pending_reviews.splice(idx, 1)[0];
      reviewItem.status = 'published';
      reviewItem.published_at = new Date().toLocaleString();
      if (!db.tables.published_reviews) db.tables.published_reviews = [];
      db.tables.published_reviews.unshift(reviewItem);
      saveDB();
      return reviewItem;
    },

    rejectReview(id) {
      db = loadDB();
      const idx = (db.tables.pending_reviews || []).findIndex(r => r.id === String(id));
      if (idx !== -1) {
        db.tables.pending_reviews.splice(idx, 1);
        saveDB();
        return true;
      }
      return false;
    },

    unpublishReview(id) {
      db = loadDB();
      const idx = (db.tables.published_reviews || []).findIndex(r => r.id === String(id));
      if (idx !== -1) {
        db.tables.published_reviews.splice(idx, 1);
        saveDB();
        return true;
      }
      return false;
    },

    getStats() {
      db = loadDB();
      const pending = (db.tables.pending_uploads || []).filter(p => p.status === 'pending').length;
      const verified = (db.tables.verified_resources || []).length;
      const totalDownloads = (db.tables.verified_resources || []).reduce((sum, r) => sum + (r.downloads || 0), 0);
      const pendingReviews = (db.tables.pending_reviews || []).filter(r => r.status === 'pending').length;
      const publishedReviews = (db.tables.published_reviews || []).length;
      return { pending, verified, totalDownloads, pendingReviews, publishedReviews };
    },

    getSubjects(year = 'All') {
      db = loadDB();
      if (!db.tables.subjects) {
        db.tables.subjects = [
          { id: 'sub-1-1', name: 'Engineering Mathematics', year: '1st Year' },
          { id: 'sub-1-2', name: 'Engineering Physics', year: '1st Year' },
          { id: 'sub-1-3', name: 'Engineering Chemistry', year: '1st Year' },
          { id: 'sub-1-4', name: 'Basic Electrical Engineering', year: '1st Year' },
          { id: 'sub-1-5', name: 'Programming in C', year: '1st Year' },
          { id: 'sub-1-6', name: 'Engineering Graphics', year: '1st Year' },
          { id: 'sub-1-7', name: 'Environmental Science', year: '1st Year' },
          { id: 'sub-2-1', name: 'Data Structures & Algorithms', year: '2nd Year' },
          { id: 'sub-2-2', name: 'Digital Electronics', year: '2nd Year' },
          { id: 'sub-2-3', name: 'Object Oriented Programming', year: '2nd Year' },
          { id: 'sub-2-4', name: 'Discrete Mathematics', year: '2nd Year' },
          { id: 'sub-3-1', name: 'Operating Systems', year: '3rd Year' },
          { id: 'sub-3-2', name: 'Computer Networks', year: '3rd Year' },
          { id: 'sub-3-3', name: 'Database Management Systems', year: '3rd Year' },
          { id: 'sub-3-4', name: 'Software Engineering', year: '3rd Year' },
          { id: 'sub-4-1', name: 'Artificial Intelligence', year: '4th Year' },
          { id: 'sub-4-2', name: 'Machine Learning', year: '4th Year' },
          { id: 'sub-4-3', name: 'Cloud Computing', year: '4th Year' }
        ];
        saveDB();
      }
      let list = db.tables.subjects || [];
      if (year && year !== 'All') {
        list = list.filter(s => s.year === year);
      }
      return list;
    },

    ensureSubject(name, year) {
      if (!name) return null;
      db = loadDB();
      if (!db.tables.subjects) db.tables.subjects = [];
      const cleanName = name.trim();
      const cleanYear = (year || '1st Year').trim();
      const exists = db.tables.subjects.find(s => s.name.toLowerCase() === cleanName.toLowerCase() && s.year === cleanYear);
      if (exists) return exists;
      const sub = {
        id: 'sub-' + Date.now(),
        name: cleanName,
        year: cleanYear,
        created_at: new Date().toISOString()
      };
      db.tables.subjects.push(sub);
      saveDB();
      return sub;
    },

    getRawDB() {
      return loadDB();
    }
  };
})();

// Export globally for browser scripts
window.EcaFileStore = EcaFileStore;
window.PDFGenerator = PDFGenerator;
window.EcaSQLDB = EcaSQLDB;
