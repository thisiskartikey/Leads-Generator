/**
 * Job Radar - Dashboard JavaScript
 * Loads and displays job data from results.json
 */

// Configuration
// Use absolute path for GitHub Pages compatibility
const DATA_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? '../data/results.json'  // Local development
    : 'https://raw.githubusercontent.com/thisiskartikey/Leads-Generator/main/data/results.json?t=' + Date.now(); // GitHub Pages (with cache busting)
const REFRESH_INTERVAL = 300000; // 5 minutes

// State
let jobsData = null;

/**
 * Initialize dashboard
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('Job Radar Dashboard initialized');
    loadJobData();

    // Auto-refresh every 5 minutes
    setInterval(loadJobData, REFRESH_INTERVAL);
});

/**
 * Load job data from JSON file
 */
async function loadJobData() {
    try {
        showLoadingState();

        const response = await fetch(DATA_URL);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        jobsData = data;

        console.log('Loaded job data:', data);

        // Check if we have jobs
        if (!data.jobs || data.jobs.length === 0) {
            showNoDataState();
            return;
        }

        // Process and display jobs
        processAndDisplayJobs(data);

        // Hide loading, show tables
        hideLoadingState();
        showJobTables();

    } catch (error) {
        console.error('Error loading job data:', error);
        showErrorState(error.message);
    }
}

/**
 * Process jobs and categorize them
 */
function processAndDisplayJobs(data) {
    const jobs = data.jobs;

    // Categorize jobs into AI vs Sustainability
    const aiJobs = [];
    const sustainabilityJobs = [];

    jobs.forEach(job => {
        const aiScore = job.ai_analysis?.fit_score || 0;
        const susScore = job.sustainability_analysis?.fit_score || 0;

        // Assign to category with higher fit score
        if (aiScore >= susScore && aiScore > 0) {
            aiJobs.push({ ...job, primary_path: 'ai', fit_score: aiScore });
        } else if (susScore > 0) {
            sustainabilityJobs.push({ ...job, primary_path: 'sustainability', fit_score: susScore });
        }
    });

    // Sort by fit score (highest first)
    aiJobs.sort((a, b) => b.fit_score - a.fit_score);
    sustainabilityJobs.sort((a, b) => b.fit_score - a.fit_score);

    console.log(`Categorized: ${sustainabilityJobs.length} sustainability, ${aiJobs.length} AI jobs`);

    // Update stats
    updateStats(jobs, sustainabilityJobs, aiJobs);

    // Update last updated time
    updateLastUpdatedTime(data.metadata?.run_timestamp);

    // Render tables
    renderJobTable('sustainabilityTableBody', sustainabilityJobs, 'sustainability');
    renderJobTable('aiTableBody', aiJobs, 'ai');

    // Update counts
    document.getElementById('sustainabilityCount').textContent = sustainabilityJobs.length;
    document.getElementById('aiCount').textContent = aiJobs.length;
}

/**
 * Update stats cards
 */
function updateStats(allJobs, sustainabilityJobs, aiJobs) {
    // Total jobs
    document.getElementById('totalJobs').textContent = allJobs.length;

    // AI jobs
    document.getElementById('aiJobs').textContent = aiJobs.length;

    // Sustainability jobs
    document.getElementById('sustainabilityJobs').textContent = sustainabilityJobs.length;

    // High fit jobs (90+)
    const highFitJobs = allJobs.filter(job => {
        const aiScore = job.ai_analysis?.fit_score || 0;
        const susScore = job.sustainability_analysis?.fit_score || 0;
        return Math.max(aiScore, susScore) >= 90;
    });
    document.getElementById('highFitJobs').textContent = highFitJobs.length;
}

/**
 * Update last updated timestamp
 */
function updateLastUpdatedTime(timestamp) {
    if (!timestamp) {
        document.getElementById('lastUpdated').textContent = 'Unknown';
        return;
    }

    const date = new Date(timestamp);
    const options = {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };

    document.getElementById('lastUpdated').textContent = date.toLocaleString('en-US', options);
}

/**
 * Render job table
 */
function renderJobTable(tableBodyId, jobs, pathType) {
    const tbody = document.getElementById(tableBodyId);
    tbody.innerHTML = '';

    if (jobs.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="7" class="text-center text-muted py-4">
                <i class="bi bi-inbox display-6"></i>
                <p class="mt-2">No jobs found in this category</p>
            </td>
        `;
        tbody.appendChild(row);
        return;
    }

    jobs.forEach(job => {
        const analysis = pathType === 'ai' ? job.ai_analysis : job.sustainability_analysis;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <a href="${escapeHtml(job.url)}" target="_blank" class="job-title-link">
                    ${escapeHtml(job.title)}
                    <i class="bi bi-box-arrow-up-right"></i>
                </a>
            </td>
            <td>${escapeHtml(job.company)}</td>
            <td>${escapeHtml(job.location)}</td>
            <td>${renderFitScoreBadge(analysis?.fit_score || 0)}</td>
            <td>${renderFreshnessBadge(job.days_old || 0)}</td>
            <td><span class="justification-text">${escapeHtml(analysis?.justification || 'N/A')}</span></td>
            <td><span class="advice-text">${escapeHtml(analysis?.positioning_advice || 'N/A')}</span></td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Render fit score badge
 */
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

/**
 * Render freshness badge
 */
function renderFreshnessBadge(daysOld) {
    let badgeClass = 'freshness-older';
    let icon = '🟠';
    let label = 'Older';

    if (daysOld <= 2) {
        badgeClass = 'freshness-new';
        icon = '🟢';
        label = 'New';
    } else if (daysOld <= 5) {
        badgeClass = 'freshness-recent';
        icon = '🟡';
        label = 'Recent';
    }

    return `<span class="freshness-badge ${badgeClass}">${icon} ${label}</span>`;
}

/**
 * Escape HTML to prevent XSS
 */
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

/**
 * Show loading state
 */
function showLoadingState() {
    document.getElementById('loadingState').classList.remove('d-none');
    document.getElementById('errorState').classList.add('d-none');
    document.getElementById('noDataState').classList.add('d-none');
    document.getElementById('jobTables').classList.add('d-none');
}

/**
 * Hide loading state
 */
function hideLoadingState() {
    document.getElementById('loadingState').classList.add('d-none');
}

/**
 * Show error state
 */
function showErrorState(message) {
    hideLoadingState();
    document.getElementById('errorState').classList.remove('d-none');
    document.getElementById('errorMessage').textContent = message || 'Unknown error occurred';
}

/**
 * Show no data state
 */
function showNoDataState() {
    hideLoadingState();
    document.getElementById('noDataState').classList.remove('d-none');
}

/**
 * Show job tables
 */
function showJobTables() {
    document.getElementById('jobTables').classList.remove('d-none');
}

/**
 * Handle refresh button click (if added in future)
 */
function refreshData() {
    console.log('Manual refresh triggered');
    loadJobData();
}

// Export for console debugging
window.JobRadar = {
    refresh: refreshData,
    getData: () => jobsData,
    version: '1.0.0'
};

console.log('Job Radar v1.0.0 loaded. Use JobRadar.refresh() to manually refresh data.');
