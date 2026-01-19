/**
 * Job Radar - Dashboard JavaScript
 * Loads and displays job data from results files
 */

// Configuration
const REPO_OWNER = 'thisiskartikey';
const REPO_NAME = 'Leads-Generator';
const REPO_BRANCH = 'main';
const PROFILE_CONFIG_PATH = 'config/profile_keywords.json';
const SEARCH_RUNS_PREFIX = 'data/search_runs_';
const REFRESH_INTERVAL = 300000; // 5 minutes

const PROFILE_STORAGE_KEY = 'jobRadar.activeProfile';
const VIEWED_STORAGE_PREFIX = 'jobRadar.viewed.';
const APPLIED_STORAGE_PREFIX = 'jobRadar.applied.';
const STATUS_PREFIX = 'data/status_';
const TOKEN_STORAGE_KEY = 'jobRadar.githubToken';
const KEYWORD_MODE_STORAGE_KEY = 'jobRadar.keywordMode';

// State
let jobsData = null;
let searchRunsData = null;
let profileKeywords = null;
let activeProfile = null;
let activeFilter = 'all';
let workflowRunning = false;
let workflowStartTime = null;
let workflowCheckInterval = null;
let progressUpdateInterval = null;

/**
 * Initialize dashboard
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('Job Radar Dashboard initialized');
    initDashboard();

    setInterval(() => loadJobData(activeProfile), REFRESH_INTERVAL);
});

async function initDashboard() {
    profileKeywords = await loadProfileKeywords();
    setupProfileToggle();
    setupKeywordEditor();

    const storedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
    activeProfile = storedProfile || getDefaultProfile();
    setActiveProfile(activeProfile);
}

function getDefaultProfile() {
    const profiles = Object.keys(profileKeywords?.profiles || {});
    return profiles.includes('kartikey') ? 'kartikey' : (profiles[0] || 'kartikey');
}

function getDataUrl(profile) {
    const fileName = `results_${profile}.json`;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `../data/${fileName}`;
    }
    return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/data/${fileName}?t=${Date.now()}`;
}

function getSearchRunsUrl(profile) {
    const fileName = `${SEARCH_RUNS_PREFIX}${profile}.json`;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `../${fileName}`;
    }
    return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${fileName}?t=${Date.now()}`;
}

function getStatusPath(profile) {
    return `${STATUS_PREFIX}${profile}.json`;
}

function getStatusUrl(profile) {
    const fileName = getStatusPath(profile);
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `../${fileName}`;
    }
    return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${fileName}?t=${Date.now()}`;
}

function getProfileConfigUrl() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `../${PROFILE_CONFIG_PATH}`;
    }
    return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${PROFILE_CONFIG_PATH}?t=${Date.now()}`;
}

async function loadProfileKeywords() {
    try {
        const response = await fetch(getProfileConfigUrl());
        if (!response.ok) {
            throw new Error(`Profile config not found: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.warn('Failed to load profile keywords, using defaults.', error);
        return { profiles: { kartikey: {}, anvesha: {} } };
    }
}

async function loadSearchRuns(profile) {
    try {
        const response = await fetch(getSearchRunsUrl(profile));
        if (!response.ok) {
            return { runs: [] };
        }
        return await response.json();
    } catch (error) {
        console.warn('Failed to load search runs.', error);
        return { runs: [] };
    }
}

async function loadAppliedStatus(profile) {
    try {
        const response = await fetch(getStatusUrl(profile));
        if (!response.ok) {
            return { applied: {} };
        }
        return await response.json();
    } catch (error) {
        console.warn('Failed to load applied status.', error);
        return { applied: {} };
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
    activeFilter = 'all';
    localStorage.setItem(PROFILE_STORAGE_KEY, profile);
    updateProfileUI(profile);
    loadJobData(profile);
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

    const aiLabel = document.getElementById('aiJobsLabel');
    const susLabel = document.getElementById('sustainabilityJobsLabel');
    if (profile === 'anvesha') {
        if (aiLabel) aiLabel.textContent = 'Design Roles';
        if (susLabel) susLabel.textContent = 'Research Roles';
    } else {
        if (aiLabel) aiLabel.textContent = 'AI/Tech Jobs';
        if (susLabel) susLabel.textContent = 'Sustainability Jobs';
    }
}

/**
 * Load job data for profile
 */
async function loadJobData(profile) {
    if (!profile) return;

    try {
        showLoadingState();

        const response = await fetch(getDataUrl(profile));
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        jobsData = data;
        searchRunsData = await loadSearchRuns(profile);
        await syncAppliedFromStatus(profile);

        if (!data.jobs || data.jobs.length === 0) {
            showNoDataState();
            return;
        }

        processAndDisplayJobs(data, profile);

        hideLoadingState();
        showJobTables();
    } catch (error) {
        console.error('Error loading job data:', error);
        showErrorState(error.message);
    }
}

function processAndDisplayJobs(data, profile) {
    const jobs = data.jobs || [];
    const allJobs = jobs.map(job => {
        if (profile === 'anvesha') {
            const fitScore = job.anvesha_analysis?.fit_score || 0;
            const category = classifyAnveshaJob(job);
            return { ...job, primary_path: category, fit_score: fitScore };
        }

        const aiScore = job.ai_analysis?.fit_score || 0;
        const susScore = job.sustainability_analysis?.fit_score || 0;

        if (susScore > aiScore && susScore > 0) {
            return { ...job, primary_path: 'sustainability', fit_score: susScore };
        } else if (aiScore > 0) {
            return { ...job, primary_path: 'ai', fit_score: aiScore };
        }
        return { ...job, primary_path: 'ai', fit_score: 0 };
    });

    allJobs.sort((a, b) => b.fit_score - a.fit_score);

    const aiJobs = allJobs.filter(job => job.primary_path === 'ai');
    const sustainabilityJobs = allJobs.filter(job => job.primary_path === 'sustainability');
    const designJobs = allJobs.filter(job => job.primary_path === 'design');
    const researchJobs = allJobs.filter(job => job.primary_path === 'research');

    updateStats(allJobs, sustainabilityJobs, aiJobs, designJobs, researchJobs, profile);
    updateLastUpdatedTime(data.metadata?.run_timestamp);
    renderCombinedJobTable(applyFilter(allJobs, profile), profile);
}

function classifyAnveshaJob(job) {
    const text = `${job.title || ''} ${job.search_snippet || ''} ${job.description || ''}`.toLowerCase();
    if (text.includes('research') || text.includes('researcher')) {
        return 'research';
    }
    return 'design';
}

function applyFilter(allJobs, profile) {
    if (activeFilter === 'high_fit') {
        return allJobs.filter(job => job.fit_score >= 90);
    }

    if (profile === 'anvesha') {
        if (activeFilter === 'design' || activeFilter === 'research') {
            return allJobs.filter(job => job.primary_path === activeFilter);
        }
        return allJobs;
    }

    if (activeFilter === 'ai' || activeFilter === 'sustainability') {
        return allJobs.filter(job => job.primary_path === activeFilter);
    }
    return allJobs;
}

function updateStats(allJobs, sustainabilityJobs, aiJobs, designJobs, researchJobs, profile) {
    document.getElementById('totalJobs').textContent = allJobs.length;

    if (profile === 'anvesha') {
        document.getElementById('aiJobs').textContent = designJobs.length;
        document.getElementById('sustainabilityJobs').textContent = researchJobs.length;
    } else {
        document.getElementById('aiJobs').textContent = aiJobs.length;
        document.getElementById('sustainabilityJobs').textContent = sustainabilityJobs.length;
    }

    const highFitJobs = allJobs.filter(job => job.fit_score >= 90);
    document.getElementById('highFitJobs').textContent = highFitJobs.length;

    wireStatCardFilters(profile);
}

function wireStatCardFilters(profile) {
    const cards = document.querySelectorAll('.stats-card');
    const filters = profile === 'anvesha'
        ? ['all', 'design', 'research', 'high_fit']
        : ['all', 'ai', 'sustainability', 'high_fit'];

    cards.forEach((card, index) => {
        const filter = filters[index] || 'all';
        card.dataset.filter = filter;
        card.classList.toggle('stats-card--active', activeFilter === filter);
        card.onclick = () => {
            activeFilter = filter;
            cards.forEach(c => c.classList.remove('stats-card--active'));
            card.classList.add('stats-card--active');
            if (jobsData) {
                processAndDisplayJobs(jobsData, activeProfile);
            }
        };
    });
}

function updateLastUpdatedTime(timestamp) {
    if (!timestamp) {
        document.getElementById('lastUpdated').textContent = 'Unknown';
        return;
    }

    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
            document.getElementById('lastUpdated').textContent = 'Invalid date';
            return;
        }

        const options = {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };

        document.getElementById('lastUpdated').textContent = date.toLocaleString('en-US', options);
    } catch (e) {
        document.getElementById('lastUpdated').textContent = 'Error';
        console.error('Error parsing timestamp:', e);
    }
}

/**
 * Trigger GitHub Actions workflow (opens GitHub Actions page)
 */
function triggerWorkflow() {
    window.open(`https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/workflows/job-search.yml`, '_blank');
    startWorkflowProgress();
}

function startWorkflowProgress() {
    workflowRunning = true;
    workflowStartTime = Date.now();

    if (jobsData && jobsData.metadata && jobsData.metadata.run_timestamp) {
        localStorage.setItem('lastKnownTimestamp', new Date(jobsData.metadata.run_timestamp).getTime().toString());
    }

    showWorkflowProgress();
    updateWorkflowProgress();

    if (progressUpdateInterval) {
        clearInterval(progressUpdateInterval);
    }
    progressUpdateInterval = setInterval(() => {
        if (!workflowRunning) {
            clearInterval(progressUpdateInterval);
            return;
        }
        updateWorkflowProgress();
    }, 1000);

    if (workflowCheckInterval) {
        clearInterval(workflowCheckInterval);
    }
    workflowCheckInterval = setInterval(async () => {
        if (!workflowRunning) {
            clearInterval(workflowCheckInterval);
            if (progressUpdateInterval) clearInterval(progressUpdateInterval);
            return;
        }

        try {
            await loadJobData(activeProfile);
            if (jobsData && jobsData.metadata && jobsData.metadata.run_timestamp) {
                const newTimestamp = new Date(jobsData.metadata.run_timestamp).getTime();
                const lastKnownTimestamp = localStorage.getItem('lastKnownTimestamp');

                if (!lastKnownTimestamp || newTimestamp > parseInt(lastKnownTimestamp, 10)) {
                    if (progressUpdateInterval) clearInterval(progressUpdateInterval);
                    stopWorkflowProgress();
                    localStorage.setItem('lastKnownTimestamp', newTimestamp.toString());
                }
            }
        } catch (err) {
            console.log('Workflow still running...');
        }
    }, 30000);

    setTimeout(() => {
        if (workflowRunning) {
            if (progressUpdateInterval) clearInterval(progressUpdateInterval);
            stopWorkflowProgress();
            console.log('Workflow progress timeout');
        }
    }, 1200000);
}

function showWorkflowProgress() {
    const progressContainer = document.getElementById('workflowProgress');
    if (progressContainer) {
        progressContainer.classList.remove('d-none');
        updateWorkflowProgress();
    }
}

function updateWorkflowProgress() {
    if (!workflowRunning || !workflowStartTime) return;

    const elapsedSeconds = Math.floor((Date.now() - workflowStartTime) / 1000);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const elapsedSecondsRemainder = elapsedSeconds % 60;

    const progressText = document.getElementById('workflowProgressText');
    const progressBar = document.getElementById('workflowProgressBar');

    if (progressText) {
        const estimatedMinutes = 7.5;
        const progressPercent = Math.min((elapsedMinutes / estimatedMinutes) * 100, 95);
        progressText.textContent = `Running search... (${elapsedMinutes}m ${elapsedSecondsRemainder}s elapsed, ~${Math.max(0, Math.ceil(estimatedMinutes - elapsedMinutes))}m remaining)`;

        if (progressBar) {
            progressBar.style.width = `${progressPercent}%`;
            progressBar.setAttribute('aria-valuenow', progressPercent);
        }
    }
}

function stopWorkflowProgress() {
    workflowRunning = false;
    workflowStartTime = null;

    const progressContainer = document.getElementById('workflowProgress');
    if (progressContainer) {
        progressContainer.classList.add('d-none');
    }

    if (workflowCheckInterval) {
        clearInterval(workflowCheckInterval);
        workflowCheckInterval = null;
    }

    if (progressUpdateInterval) {
        clearInterval(progressUpdateInterval);
        progressUpdateInterval = null;
    }

    loadJobData(activeProfile);
}

function formatShortDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTriggerLabel(trigger) {
    if (!trigger) return 'manual';
    if (trigger === 'schedule') return 'scheduled';
    return 'manual';
}

function getSearchRunStats(jobId) {
    const runs = searchRunsData?.runs || [];
    let appearances = 0;
    let lastRun = null;

    runs.forEach(run => {
        if (!run?.job_ids || !jobId) return;
        if (run.job_ids.includes(jobId)) {
            appearances += 1;
            if (!lastRun || new Date(run.timestamp) > new Date(lastRun.timestamp)) {
                lastRun = run;
            }
        }
    });

    return { appearances, lastRun };
}

function buildSearchRunMeta(jobId) {
    const stats = getSearchRunStats(jobId);
    if (!stats.appearances) return '';

    const timesLabel = stats.appearances === 1 ? 'search' : 'searches';
    let meta = `Appeared in ${stats.appearances} ${timesLabel}`;

    if (stats.lastRun) {
        const triggerLabel = formatTriggerLabel(stats.lastRun.trigger);
        const dateLabel = formatShortDate(stats.lastRun.timestamp);
        const details = [triggerLabel, dateLabel].filter(Boolean).join(' · ');
        if (details) {
            meta += ` · Last: ${details}`;
        }
    }

    return meta;
}

function renderCombinedJobTable(allJobs, profile) {
    const tbody = document.getElementById('jobsTableBody');
    tbody.innerHTML = '';

    if (allJobs.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="5" class="text-center text-muted py-4">
                <i class="bi bi-inbox display-6"></i>
                <p class="mt-2">No jobs found</p>
            </td>
        `;
        tbody.appendChild(row);
        return;
    }

    allJobs.forEach((job, index) => {
        const analysis = profile === 'anvesha'
            ? job.anvesha_analysis
            : (job.primary_path === 'ai' ? job.ai_analysis : job.sustainability_analysis);
        const fitScore = analysis?.fit_score || 0;
        const showAdvice = fitScore > 75;
        const viewed = isJobViewed(profile, job.job_id);
        const applied = isJobApplied(profile, job.job_id);

        const row = document.createElement('tr');
        if (job.primary_path === 'sustainability' && profile === 'kartikey') {
            row.classList.add('sustainability-row');
        }
        if (viewed) {
            row.classList.add('viewed-row');
        }
        if (applied) {
            row.classList.add('applied-row');
        }

        const justification = showAdvice ? (analysis?.justification || 'N/A') : '-';
        const advice = showAdvice ? (analysis?.positioning_advice || 'N/A') : '-';
        const rowId = `job-row-${index}`;
        const viewedBadge = viewed ? '<span class="badge bg-secondary ms-2">Viewed</span>' : '';
        const appliedToggle = renderAppliedToggle(job.job_id, applied);
        const runMeta = buildSearchRunMeta(job.job_id);
        const runMetaLine = runMeta ? `<div class="job-meta">${escapeHtml(runMeta)}</div>` : '';

        row.setAttribute('id', rowId);
        row.innerHTML = `
            <td data-label="Job Title">
                <a href="${escapeHtml(job.url)}" target="_blank" class="job-title-link" data-job-id="${escapeHtml(job.job_id)}">
                    ${escapeHtml(job.title || 'N/A')}
                    <i class="bi bi-box-arrow-up-right"></i>
                </a>
                <div class="job-status">
                    ${viewedBadge}
                    ${appliedToggle}
                </div>
                ${runMetaLine}
            </td>
            <td data-label="Company">
                <div class="company-name">${escapeHtml(job.company || 'N/A')}</div>
                <div class="job-location">${escapeHtml(job.location || 'N/A')}</div>
            </td>
            <td data-label="Fit Score">${renderFitScoreBadge(fitScore)}</td>
            <td class="expandable-cell" data-label="Justification">
                ${renderExpandableText(justification, `${rowId}-justification`, 'justification')}
            </td>
            <td class="expandable-cell" data-label="Positioning Advice">
                ${renderExpandableText(advice, `${rowId}-advice`, 'advice')}
            </td>
        `;

        tbody.appendChild(row);

        setTimeout(() => {
            attachExpandListeners(`${rowId}-justification`);
            attachExpandListeners(`${rowId}-advice`);
        }, 0);
    });

    attachViewedListeners(profile);
    attachAppliedListeners(profile);
}

function renderFitScoreBadge(score) {
    let badgeClass = 'fit-weak';
    let label = 'Weak';

    if (score >= 90) {
        badgeClass = 'fit-exceptional';
        label = 'Exceptional';
    } else if (score >= 75) {
        badgeClass = 'fit-strong';
        label = 'Strong';
    } else if (score >= 60) {
        badgeClass = 'fit-moderate';
        label = 'Moderate';
    }

    return `<span class="fit-badge ${badgeClass}" title="${label} Fit">${score}%</span>`;
}

function attachViewedListeners(profile) {
    const links = document.querySelectorAll('.job-title-link');
    links.forEach(link => {
        link.addEventListener('click', () => {
            const jobId = link.getAttribute('data-job-id');
            if (!jobId) return;
            markJobViewed(profile, jobId, link);
        });
    });
}

function renderAppliedToggle(jobId, applied) {
    const checked = applied ? 'checked' : '';
    const stateClass = applied ? 'applied-toggle--on' : '';
    return `
        <label class="applied-toggle ${stateClass}">
            <input type="checkbox" class="applied-toggle-input" data-job-id="${escapeHtml(jobId)}" ${checked} aria-label="Mark job as applied">
            <span class="applied-toggle-label">Applied</span>
        </label>
    `;
}

function attachAppliedListeners(profile) {
    const toggles = document.querySelectorAll('.applied-toggle-input');
    toggles.forEach(toggle => {
        toggle.addEventListener('change', async () => {
            const jobId = toggle.getAttribute('data-job-id');
            if (!jobId) return;
            setJobApplied(profile, jobId, toggle.checked);

            const row = toggle.closest('tr');
            if (row) {
                row.classList.toggle('applied-row', toggle.checked);
            }
            const wrapper = toggle.closest('.applied-toggle');
            if (wrapper) {
                wrapper.classList.toggle('applied-toggle--on', toggle.checked);
            }

            await persistAppliedStatus(profile);
        });
    });
}

function getViewedMap(profile) {
    const raw = localStorage.getItem(`${VIEWED_STORAGE_PREFIX}${profile}`);
    if (!raw) return {};
    try {
        return JSON.parse(raw) || {};
    } catch {
        return {};
    }
}

function isJobViewed(profile, jobId) {
    const viewed = getViewedMap(profile);
    return Boolean(viewed[jobId]);
}

function markJobViewed(profile, jobId, link) {
    const viewed = getViewedMap(profile);
    viewed[jobId] = new Date().toISOString();
    localStorage.setItem(`${VIEWED_STORAGE_PREFIX}${profile}`, JSON.stringify(viewed));

    const row = link.closest('tr');
    if (row) {
        row.classList.add('viewed-row');
        if (!row.querySelector('.badge.bg-secondary')) {
            link.insertAdjacentHTML('afterend', '<span class="badge bg-secondary ms-2">Viewed</span>');
        }
    }
}

function getAppliedMap(profile) {
    const raw = localStorage.getItem(`${APPLIED_STORAGE_PREFIX}${profile}`);
    if (!raw) return {};
    try {
        return JSON.parse(raw) || {};
    } catch {
        return {};
    }
}

function isJobApplied(profile, jobId) {
    const applied = getAppliedMap(profile);
    return Boolean(applied[jobId]);
}

function setJobApplied(profile, jobId, isApplied) {
    const applied = getAppliedMap(profile);
    if (isApplied) {
        applied[jobId] = new Date().toISOString();
    } else {
        delete applied[jobId];
    }
    localStorage.setItem(`${APPLIED_STORAGE_PREFIX}${profile}`, JSON.stringify(applied));
}

function mergeAppliedMaps(baseMap, nextMap) {
    const merged = { ...baseMap };
    Object.entries(nextMap || {}).forEach(([jobId, timestamp]) => {
        if (!merged[jobId]) {
            merged[jobId] = timestamp;
            return;
        }
        const existing = new Date(merged[jobId]).getTime();
        const incoming = new Date(timestamp).getTime();
        if (Number.isNaN(existing) || incoming > existing) {
            merged[jobId] = timestamp;
        }
    });
    return merged;
}

async function syncAppliedFromStatus(profile) {
    const status = await loadAppliedStatus(profile);
    const remoteApplied = status?.applied || {};
    const localApplied = getAppliedMap(profile);
    const merged = mergeAppliedMaps(remoteApplied, localApplied);
    localStorage.setItem(`${APPLIED_STORAGE_PREFIX}${profile}`, JSON.stringify(merged));
}

async function persistAppliedStatus(profile) {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) return;

    const status = await loadAppliedStatus(profile);
    const remoteApplied = status?.applied || {};
    const localApplied = getAppliedMap(profile);
    const merged = mergeAppliedMaps(remoteApplied, localApplied);

    const payload = {
        profile,
        applied: merged,
        last_updated: new Date().toISOString()
    };

    try {
        await updateGitHubFile(
            getStatusPath(profile),
            JSON.stringify(payload, null, 2),
            token,
            `Update applied status for ${profile}`
        );
    } catch (error) {
        console.warn('Failed to sync applied status.', error);
    }
}

function normalizeKeywordList(list) {
    return Array.from(new Set(list.map(item => item.trim()).filter(Boolean)));
}

function setupKeywordEditor() {
    const editBtn = document.getElementById('editKeywordsBtn');
    if (!editBtn) return;

    editBtn.addEventListener('click', () => {
        openKeywordsModal();
    });

    const saveBtn = document.getElementById('saveKeywordsBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveKeywordsToGitHub);
    }
}

function openKeywordsModal() {
    const modalElement = document.getElementById('keywordsModal');
    if (!modalElement) return;

    const focusInput = document.getElementById('keywordsFocus');
    const rolesInput = document.getElementById('keywordsRoles');
    const tokenInput = document.getElementById('githubToken');
    const errorBox = document.getElementById('keywordsError');
    const successBox = document.getElementById('keywordsSuccess');

    if (errorBox) errorBox.classList.add('d-none');
    if (successBox) successBox.classList.add('d-none');

    const current = profileKeywords?.profiles?.[activeProfile]?.keywords || {};
    const focusList = activeProfile === 'kartikey'
        ? (current.ai_focus || [])
        : (current.focus || []);
    const rolesList = current.roles || [];

    if (focusInput) focusInput.value = focusList.join('\n');
    if (rolesInput) rolesInput.value = rolesList.join('\n');

    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
    if (tokenInput && storedToken) tokenInput.value = storedToken;

    const replaceToggle = document.getElementById('keywordModeReplace');
    const appendToggle = document.getElementById('keywordModeAppend');
    const storedMode = localStorage.getItem(KEYWORD_MODE_STORAGE_KEY) || 'replace';
    if (replaceToggle && appendToggle) {
        replaceToggle.checked = storedMode !== 'append';
        appendToggle.checked = storedMode === 'append';
    }

    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}

async function saveKeywordsToGitHub() {
    const focusInput = document.getElementById('keywordsFocus');
    const rolesInput = document.getElementById('keywordsRoles');
    const tokenInput = document.getElementById('githubToken');
    const errorBox = document.getElementById('keywordsError');
    const successBox = document.getElementById('keywordsSuccess');

    if (errorBox) errorBox.classList.add('d-none');
    if (successBox) successBox.classList.add('d-none');

    const rawFocusKeywords = focusInput?.value.split('\n').map(line => line.trim()).filter(Boolean) || [];
    const rawRoleKeywords = rolesInput?.value.split('\n').map(line => line.trim()).filter(Boolean) || [];
    const token = tokenInput?.value.trim() || localStorage.getItem(TOKEN_STORAGE_KEY);
    const appendToggle = document.getElementById('keywordModeAppend');
    const keywordMode = appendToggle?.checked ? 'append' : 'replace';

    if (!token) {
        if (errorBox) {
            errorBox.textContent = 'GitHub token required to update the config.';
            errorBox.classList.remove('d-none');
        }
        return;
    }

    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(KEYWORD_MODE_STORAGE_KEY, keywordMode);

    const updated = JSON.parse(JSON.stringify(profileKeywords || { profiles: {} }));
    if (!updated.profiles[activeProfile]) {
        updated.profiles[activeProfile] = { keywords: {} };
    }

    const current = profileKeywords?.profiles?.[activeProfile]?.keywords || {};
    const existingFocus = activeProfile === 'kartikey'
        ? (current.ai_focus || [])
        : (current.focus || []);
    const existingRoles = current.roles || [];

    let focusKeywords = normalizeKeywordList(rawFocusKeywords);
    let roleKeywords = normalizeKeywordList(rawRoleKeywords);

    if (keywordMode === 'append') {
        focusKeywords = normalizeKeywordList([...existingFocus, ...focusKeywords]);
        roleKeywords = normalizeKeywordList([...existingRoles, ...roleKeywords]);
    }

    if (activeProfile === 'kartikey') {
        updated.profiles[activeProfile].keywords.ai_focus = focusKeywords;
    } else {
        updated.profiles[activeProfile].keywords.focus = focusKeywords;
    }
    updated.profiles[activeProfile].keywords.roles = roleKeywords;

    try {
        await updateGitHubFile(
            PROFILE_CONFIG_PATH,
            JSON.stringify(updated, null, 2),
            token,
            `Update keywords for ${activeProfile}`
        );
        profileKeywords = updated;
        if (successBox) successBox.classList.remove('d-none');
    } catch (error) {
        if (errorBox) {
            errorBox.textContent = error.message || 'Failed to update keywords.';
            errorBox.classList.remove('d-none');
        }
    }
}

async function updateGitHubFile(path, content, token, message) {
    const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
    };

    const existingResponse = await fetch(`${apiUrl}?ref=${REPO_BRANCH}`, { headers });
    let existingData = null;
    if (existingResponse.status !== 404) {
        if (!existingResponse.ok) {
            throw new Error(`Failed to load config from GitHub (${existingResponse.status})`);
        }
        existingData = await existingResponse.json();
    }
    const encoded = btoa(unescape(encodeURIComponent(content)));

    const requestBody = {
        message: message || `Update keywords for ${activeProfile}`,
        content: encoded,
        branch: REPO_BRANCH
    };
    if (existingData?.sha) {
        requestBody.sha = existingData.sha;
    }

    const updateResponse = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(requestBody)
    });

    if (!updateResponse.ok) {
        const errorData = await updateResponse.json();
        throw new Error(errorData.message || 'GitHub update failed');
    }
}

/**
 * Render expandable text with button
 */
function renderExpandableText(text, id, type) {
    if (text === '-' || !text || text === 'N/A') {
        return '<span class="text-muted">-</span>';
    }

    const escapedText = escapeHtml(text);
    const previewLength = 60;
    const isLong = escapedText.length > previewLength;
    const preview = isLong ? escapedText.substring(0, previewLength) + '...' : escapedText;
    const fullText = escapedText;

    if (!isLong) {
        return `<span class="expandable-content ${type}-text">${fullText}</span>`;
    }

    return `
        <div class="expandable-text-container">
            <span class="expandable-content ${type}-text" id="${id}-content">${preview}</span>
            <button type="button" class="btn-expand-text" data-target="${id}" aria-label="Expand ${type}">
                <i class="bi bi-chevron-down"></i> Show more
            </button>
            <span class="expandable-full ${type}-text" id="${id}-full" style="display: none;">${fullText}</span>
            <button type="button" class="btn-collapse-text" data-target="${id}" style="display: none;" aria-label="Collapse ${type}">
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
            e.stopPropagation();
            content.style.display = 'none';
            full.style.display = 'inline';
            expandBtn.style.display = 'none';
            collapseBtn.style.display = 'inline-block';
        });

        collapseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            content.style.display = 'inline';
            full.style.display = 'none';
            expandBtn.style.display = 'inline-block';
            collapseBtn.style.display = 'none';
        });
    }
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

function showLoadingState() {
    document.getElementById('loadingState').classList.remove('d-none');
    document.getElementById('errorState').classList.add('d-none');
    document.getElementById('noDataState').classList.add('d-none');
    document.getElementById('jobTables').classList.add('d-none');
}

function hideLoadingState() {
    document.getElementById('loadingState').classList.add('d-none');
}

function showErrorState(message) {
    hideLoadingState();
    document.getElementById('errorState').classList.remove('d-none');
    document.getElementById('errorMessage').textContent = message || 'Unknown error occurred';
}

function showNoDataState() {
    hideLoadingState();
    document.getElementById('noDataState').classList.remove('d-none');
}

function showJobTables() {
    document.getElementById('jobTables').classList.remove('d-none');
}

function refreshData() {
    console.log('Manual refresh triggered');
    loadJobData(activeProfile);
}

window.JobRadar = {
    refresh: refreshData,
    getData: () => jobsData,
    version: '2.0.0'
};
