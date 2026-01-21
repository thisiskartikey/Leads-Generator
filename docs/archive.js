/**
 * Job Radar - Archive JavaScript
 * Loads searchable job snapshots and applied counts
 */

const REPO_OWNER = 'thisiskartikey';
const REPO_NAME = 'Leads-Generator';
const REPO_BRANCH = 'main';
const SNAPSHOT_PREFIX = 'data/job_snapshots_';
const HISTORY_PREFIX = 'data/history_';
const DESCRIPTION_PREFIX = 'data/job_descriptions_';
const STATUS_PREFIX = 'data/status_';

const PROFILE_STORAGE_KEY = 'jobRadar.activeProfile';

let activeProfile = null;
let archiveItems = [];
let appliedMap = {};

document.addEventListener('DOMContentLoaded', () => {
    initArchive();
});

function initArchive() {
    setupProfileToggle();
    const storedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
    activeProfile = storedProfile || 'kartikey';
    setActiveProfile(activeProfile);

    const searchInput = document.getElementById('archiveSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            applyArchiveSearch(searchInput.value);
        });
    }

    const archiveList = document.getElementById('archiveList');
    if (archiveList) {
        archiveList.addEventListener('click', (event) => {
            const button = event.target.closest('.archive-desc-toggle');
            if (!button) return;
            toggleArchiveDescription(button);
        });
    }
}

function setupProfileToggle() {
    const toggle = document.getElementById('profileToggle');
    if (!toggle) return;

    toggle.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-profile]');
        if (!button) return;
        const profile = button.getAttribute('data-profile');
        setActiveProfile(profile);
    });
}

function setActiveProfile(profile) {
    activeProfile = profile;
    localStorage.setItem(PROFILE_STORAGE_KEY, profile);
    updateProfileUI(profile);
    loadArchiveData(profile);
}

function updateProfileUI(profile) {
    const activeProfileLabel = document.getElementById('activeProfile');
    if (activeProfileLabel) {
        activeProfileLabel.textContent = profile === 'anvesha' ? 'Anvesha' : 'Kartikey';
    }

    document.querySelectorAll('#profileToggle button').forEach((button) => {
        const isActive = button.getAttribute('data-profile') === profile;
        button.classList.toggle('btn-primary', isActive);
        button.classList.toggle('btn-outline-primary', !isActive);
    });
}

function getSnapshotUrl(profile) {
    const fileName = `${SNAPSHOT_PREFIX}${profile}.json`;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `../${fileName}`;
    }
    return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${fileName}?t=${Date.now()}`;
}

function getDescriptionUrl(profile, jobId) {
    const fileName = `${DESCRIPTION_PREFIX}${profile}/${jobId}.txt`;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `../${fileName}`;
    }
    return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${fileName}?t=${Date.now()}`;
}

function getHistoryUrl(profile) {
    const fileName = `${HISTORY_PREFIX}${profile}.json`;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `../${fileName}`;
    }
    return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${fileName}?t=${Date.now()}`;
}

function getStatusUrl(profile) {
    const fileName = `${STATUS_PREFIX}${profile}.json`;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `../${fileName}`;
    }
    return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${fileName}?t=${Date.now()}`;
}

async function loadArchiveData(profile) {
    showArchiveLoading();
    try {
        const [snapshots, status] = await Promise.all([
            loadSnapshots(profile),
            loadStatus(profile)
        ]);

        appliedMap = status?.applied || {};
        updateAppliedCount(appliedMap);

        const jobs = snapshots?.jobs || {};
        archiveItems = Object.entries(jobs).map(([jobId, job]) => ({
            job_id: jobId,
            ...job
        })).sort((a, b) => new Date(b.last_seen || 0) - new Date(a.last_seen || 0));

        renderArchiveList(archiveItems);
        showArchiveList();
    } catch (error) {
        showArchiveError(error.message);
    }
}

async function loadSnapshots(profile) {
    const response = await fetch(getSnapshotUrl(profile));
    if (response.ok) {
        return await response.json();
    }
    const historyResponse = await fetch(getHistoryUrl(profile));
    if (!historyResponse.ok) {
        throw new Error('Archive data not found yet. Run the workflow to generate it.');
    }
    const history = await historyResponse.json();
    return normalizeHistoryToSnapshots(history);
}

function normalizeHistoryToSnapshots(history) {
    const jobs = history?.jobs || {};
    const normalizedJobs = {};

    Object.entries(jobs).forEach(([jobId, job]) => {
        normalizedJobs[jobId] = {
            url: job.url || '',
            title: job.title || '',
            company: job.company || '',
            location: job.location || '',
            description: job.description || '',
            last_seen: job.last_seen || job.first_seen || history?.last_updated || ''
        };
    });

    return { jobs: normalizedJobs, last_updated: history?.last_updated || null };
}

async function loadStatus(profile) {
    try {
        const response = await fetch(getStatusUrl(profile));
        if (!response.ok) {
            return { applied: {} };
        }
        return await response.json();
    } catch (error) {
        return { applied: {} };
    }
}

function updateAppliedCount(map) {
    const countEl = document.getElementById('appliedCount');
    if (!countEl) return;
    countEl.textContent = Object.keys(map || {}).length;
}

function applyArchiveSearch(query) {
    const normalized = (query || '').trim().toLowerCase();
    if (!normalized) {
        renderArchiveList(archiveItems);
        return;
    }

    const filtered = archiveItems.filter(item => {
        const haystack = [
            item.title,
            item.company,
            item.location,
            item.description
        ].join(' ').toLowerCase();
        return haystack.includes(normalized);
    });

    renderArchiveList(filtered);
}

function renderArchiveList(items) {
    const list = document.getElementById('archiveList');
    if (!list) return;
    list.innerHTML = '';

    if (!items || items.length === 0) {
        list.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="bi bi-inbox display-6"></i>
                <p class="mt-2">No matching roles found.</p>
            </div>
        `;
        return;
    }

    items.forEach((item, index) => {
        const applied = Boolean(appliedMap?.[item.job_id]);
        const appliedBadge = applied ? '<span class="badge bg-success">Applied</span>' : '';
        const lastSeen = formatShortDate(item.last_seen);
        const metaLine = [item.company, item.location, lastSeen].filter(Boolean).join(' · ');
        const descId = `archive-desc-${index}`;
        const hasInlineDescription = Boolean(item.description && item.description.trim());
        const toggleLabel = hasInlineDescription ? 'View job description' : 'Load job description';
        const inlineDescription = hasInlineDescription
            ? `<div class="archive-desc-text">${escapeHtml(item.description)}</div>`
            : `<div class="archive-desc-text text-muted">Description will load on demand.</div>`;

        const card = document.createElement('div');
        card.className = 'card archive-entry';
        card.innerHTML = `
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start gap-3">
                    <div>
                        <h3 class="archive-title">
                            <a href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener" class="job-title-link">
                                ${escapeHtml(item.title || 'Untitled role')}
                                <i class="bi bi-box-arrow-up-right"></i>
                            </a>
                        </h3>
                        <div class="archive-meta">${escapeHtml(metaLine)}</div>
                    </div>
                    ${appliedBadge}
                </div>
                <div class="archive-description">
                    <button type="button"
                            class="btn btn-sm btn-outline-secondary archive-desc-toggle"
                            data-target="${descId}"
                            data-job-id="${escapeHtml(item.job_id || '')}"
                            aria-expanded="false">
                        <i class="bi bi-file-text"></i> ${toggleLabel}
                    </button>
                    <div class="archive-desc-panel" id="${descId}" data-loaded="${hasInlineDescription}" style="display: none;">
                        ${inlineDescription}
                    </div>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

async function toggleArchiveDescription(button) {
    const targetId = button.getAttribute('data-target');
    const jobId = button.getAttribute('data-job-id');
    if (!targetId || !jobId) return;

    const panel = document.getElementById(targetId);
    if (!panel) return;

    const isOpen = panel.style.display !== 'none';
    if (isOpen) {
        panel.style.display = 'none';
        button.setAttribute('aria-expanded', 'false');
        button.innerHTML = '<i class="bi bi-file-text"></i> View job description';
        return;
    }

    if (panel.dataset.loaded !== 'true') {
        const descriptionText = await loadJobDescription(activeProfile, jobId);
        if (descriptionText) {
            panel.innerHTML = `<div class="archive-desc-text">${escapeHtml(descriptionText)}</div>`;
        } else {
            panel.innerHTML = '<div class="archive-desc-text text-muted">No description captured.</div>';
        }
        panel.dataset.loaded = 'true';
    }

    panel.style.display = 'block';
    button.setAttribute('aria-expanded', 'true');
    button.innerHTML = '<i class="bi bi-chevron-up"></i> Hide description';
}

async function loadJobDescription(profile, jobId) {
    try {
        const response = await fetch(getDescriptionUrl(profile, jobId));
        if (!response.ok) return '';
        return await response.text();
    } catch (error) {
        return '';
    }
}

function renderExpandableText(text, id) {
    if (!text) {
        return '<span class="text-muted">No description captured.</span>';
    }

    const escapedText = escapeHtml(text);
    const previewLength = 200;
    const isLong = escapedText.length > previewLength;
    const preview = isLong ? `${escapedText.substring(0, previewLength)}...` : escapedText;

    if (!isLong) {
        return `<span class="archive-text">${preview}</span>`;
    }

    return `
        <div class="expandable-text-container">
            <span class="archive-text" id="${id}-content">${preview}</span>
            <button type="button" class="btn-expand-text" data-target="${id}" aria-label="Expand description">
                <i class="bi bi-chevron-down"></i> Show more
            </button>
            <span class="archive-text" id="${id}-full" style="display: none;">${escapedText}</span>
            <button type="button" class="btn-collapse-text" data-target="${id}" style="display: none;" aria-label="Collapse description">
                <i class="bi bi-chevron-up"></i> Show less
            </button>
        </div>
    `;
}

function attachExpandListeners(id) {
    const expandBtn = document.querySelector(`button[data-target="${id}"].btn-expand-text`);
    const collapseBtn = document.querySelector(`button[data-target="${id}"].btn-collapse-text`);
    const content = document.getElementById(`${id}-content`);
    const full = document.getElementById(`${id}-full`);

    if (expandBtn && collapseBtn && content && full) {
        expandBtn.addEventListener('click', (e) => {
            e.preventDefault();
            content.style.display = 'none';
            full.style.display = 'inline';
            expandBtn.style.display = 'none';
            collapseBtn.style.display = 'inline-block';
        });

        collapseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            content.style.display = 'inline';
            full.style.display = 'none';
            expandBtn.style.display = 'inline-block';
            collapseBtn.style.display = 'none';
        });
    }
}

function formatShortDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
}

function showArchiveLoading() {
    document.getElementById('archiveLoadingState')?.classList.remove('d-none');
    document.getElementById('archiveErrorState')?.classList.add('d-none');
    document.getElementById('archiveList')?.classList.add('d-none');
}

function showArchiveList() {
    document.getElementById('archiveLoadingState')?.classList.add('d-none');
    document.getElementById('archiveErrorState')?.classList.add('d-none');
    document.getElementById('archiveList')?.classList.remove('d-none');
}

function showArchiveError(message) {
    document.getElementById('archiveLoadingState')?.classList.add('d-none');
    const errorState = document.getElementById('archiveErrorState');
    if (errorState) {
        errorState.classList.remove('d-none');
        const messageEl = document.getElementById('archiveErrorMessage');
        if (messageEl) messageEl.textContent = message || 'Unknown error occurred';
    }
}
