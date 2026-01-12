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

    // Combine all jobs for display (sustainability first, then AI)
    const allJobs = [...sustainabilityJobs, ...aiJobs];

    console.log(`Categorized: ${sustainabilityJobs.length} sustainability, ${aiJobs.length} AI jobs`);

    // Update stats
    updateStats(jobs, sustainabilityJobs, aiJobs);

    // Update last updated time
    updateLastUpdatedTime(data.metadata?.run_timestamp);

    // Render combined table
    renderCombinedJobTable(allJobs, sustainabilityJobs.length);
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

    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
            document.getElementById('lastUpdated').textContent = 'Invalid date';
            return;
        }
        
        const options = {
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
    window.open('https://github.com/thisiskartikey/Leads-Generator/actions/workflows/job-search.yml', '_blank');
}

/**
 * Render combined job table
 */
function renderCombinedJobTable(allJobs, sustainabilityCount) {
    const tbody = document.getElementById('jobsTableBody');
    tbody.innerHTML = '';

    if (allJobs.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="7" class="text-center text-muted py-4">
                <i class="bi bi-inbox display-6"></i>
                <p class="mt-2">No jobs found</p>
            </td>
        `;
        tbody.appendChild(row);
        return;
    }

    allJobs.forEach((job, index) => {
        const isSustainability = index < sustainabilityCount;
        const analysis = job.primary_path === 'ai' ? job.ai_analysis : job.sustainability_analysis;
        const fitScore = analysis?.fit_score || 0;
        const showAdvice = fitScore > 75;

        const row = document.createElement('tr');
        if (isSustainability) {
            row.classList.add('sustainability-row');
        }

        const justification = showAdvice ? (analysis?.justification || 'N/A') : '—';
        const advice = showAdvice ? (analysis?.positioning_advice || 'N/A') : '—';
        const rowId = `job-row-${index}`;
        
        row.setAttribute('id', rowId);
        row.innerHTML = `
            <td data-label="Job Title">
                <a href="${escapeHtml(job.url)}" target="_blank" class="job-title-link">
                    ${escapeHtml(job.title || 'N/A')}
                    <i class="bi bi-box-arrow-up-right"></i>
                </a>
            </td>
            <td data-label="Company">${escapeHtml(job.company || 'N/A')}</td>
            <td data-label="Location">${escapeHtml(job.location || 'N/A')}</td>
            <td data-label="Fit Score">${renderFitScoreBadge(fitScore)}</td>
            <td data-label="Freshness">${renderFreshnessBadge(job.days_old || 0)}</td>
            <td class="expandable-cell" data-label="Justification">
                ${renderExpandableText(justification, `${rowId}-justification`, 'justification')}
            </td>
            <td class="expandable-cell" data-label="Positioning Advice">
                ${renderExpandableText(advice, `${rowId}-advice`, 'advice')}
            </td>
        `;

        tbody.appendChild(row);
        
        // Attach event listeners after DOM insertion (with small delay to ensure DOM is ready)
        setTimeout(() => {
            attachExpandListeners(`${rowId}-justification`);
            attachExpandListeners(`${rowId}-advice`);
        }, 0);
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
 * Render expandable text with button
 */
function renderExpandableText(text, id, type) {
    if (text === '—' || !text || text === 'N/A') {
        return '<span class="text-muted">—</span>';
    }
    
    const escapedText = escapeHtml(text);
    const previewLength = 60; // Characters to show in preview
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

/**
 * Attach expand/collapse event listeners
 */
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
