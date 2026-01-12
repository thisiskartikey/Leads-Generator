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
let workflowRunning = false;
let workflowStartTime = null;
let workflowCheckInterval = null;
let progressUpdateInterval = null;

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

    // Categorize jobs and calculate fit scores
    const allJobs = jobs.map(job => {
        const aiScore = job.ai_analysis?.fit_score || 0;
        const susScore = job.sustainability_analysis?.fit_score || 0;
        
        // Assign to category with higher fit score
        if (susScore > aiScore && susScore > 0) {
            return { ...job, primary_path: 'sustainability', fit_score: susScore };
        } else if (aiScore > 0) {
            return { ...job, primary_path: 'ai', fit_score: aiScore };
        } else {
            // If no scores, default to AI
            return { ...job, primary_path: 'ai', fit_score: 0 };
        }
    });

    // Sort ALL jobs by fit score (highest first)
    allJobs.sort((a, b) => b.fit_score - a.fit_score);

    const aiJobs = allJobs.filter(job => job.primary_path === 'ai');
    const sustainabilityJobs = allJobs.filter(job => job.primary_path === 'sustainability');
    
    console.log(`Categorized: ${sustainabilityJobs.length} sustainability, ${aiJobs.length} AI jobs`);

    // Update stats
    updateStats(allJobs, sustainabilityJobs, aiJobs);

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
        
        // Use browser's local timezone (automatically converts UTC to user's timezone)
        // For Boston (EST/EDT), this will automatically display in the correct timezone
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
    // Open GitHub Actions page
    window.open('https://github.com/thisiskartikey/Leads-Generator/actions/workflows/job-search.yml', '_blank');
    
    // Show progress indicator
    startWorkflowProgress();
}

/**
 * Start workflow progress tracking
 */
function startWorkflowProgress() {
    workflowRunning = true;
    workflowStartTime = Date.now();
    
    // Store current timestamp for comparison
    if (jobsData && jobsData.metadata && jobsData.metadata.run_timestamp) {
        localStorage.setItem('lastKnownTimestamp', new Date(jobsData.metadata.run_timestamp).getTime().toString());
    }
    
    // Show progress bar
    showWorkflowProgress();
    
    // Update progress immediately
    updateWorkflowProgress();
    
    // Update progress every second for smooth animation
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
    
    // Check for updates more frequently (every 30 seconds) while workflow is running
    if (workflowCheckInterval) {
        clearInterval(workflowCheckInterval);
    }
    
    workflowCheckInterval = setInterval(async () => {
        if (!workflowRunning) {
            clearInterval(workflowCheckInterval);
            if (progressUpdateInterval) clearInterval(progressUpdateInterval);
            return;
        }
        
        // Try to reload data to see if workflow completed
        try {
            await loadJobData();
            // Check if we got new data (timestamp changed)
            if (jobsData && jobsData.metadata && jobsData.metadata.run_timestamp) {
                const newTimestamp = new Date(jobsData.metadata.run_timestamp).getTime();
                const lastKnownTimestamp = localStorage.getItem('lastKnownTimestamp');
                
                if (!lastKnownTimestamp || newTimestamp > parseInt(lastKnownTimestamp)) {
                    // Workflow completed!
                    if (progressUpdateInterval) clearInterval(progressUpdateInterval);
                    stopWorkflowProgress();
                    localStorage.setItem('lastKnownTimestamp', newTimestamp.toString());
                }
            }
        } catch (err) {
            console.log('Workflow still running...');
        }
    }, 30000); // Check every 30 seconds
    
    // Stop after 20 minutes (safety timeout)
    setTimeout(() => {
        if (workflowRunning) {
            if (progressUpdateInterval) clearInterval(progressUpdateInterval);
            stopWorkflowProgress();
            console.log('Workflow progress timeout');
        }
    }, 1200000); // 20 minutes
}

/**
 * Show workflow progress indicator
 */
function showWorkflowProgress() {
    const progressContainer = document.getElementById('workflowProgress');
    if (progressContainer) {
        progressContainer.classList.remove('d-none');
        updateWorkflowProgress();
    }
}

/**
 * Update workflow progress display
 */
function updateWorkflowProgress() {
    if (!workflowRunning || !workflowStartTime) return;
    
    const elapsedSeconds = Math.floor((Date.now() - workflowStartTime) / 1000);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const elapsedSecondsRemainder = elapsedSeconds % 60;
    
    const progressText = document.getElementById('workflowProgressText');
    const progressBar = document.getElementById('workflowProgressBar');
    
    if (progressText) {
        // Estimated time: 5-10 minutes, so we'll show progress based on that
        const estimatedMinutes = 7.5; // Average
        const progressPercent = Math.min((elapsedMinutes / estimatedMinutes) * 100, 95);
        
        progressText.textContent = `Running search... (${elapsedMinutes}m ${elapsedSecondsRemainder}s elapsed, ~${Math.max(0, Math.ceil(estimatedMinutes - elapsedMinutes))}m remaining)`;
        
        if (progressBar) {
            progressBar.style.width = `${progressPercent}%`;
            progressBar.setAttribute('aria-valuenow', progressPercent);
        }
    }
}

/**
 * Stop workflow progress tracking
 */
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
    
    // Reload data to show latest results
    loadJobData();
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
            <td colspan="6" class="text-center text-muted py-4">
                <i class="bi bi-inbox display-6"></i>
                <p class="mt-2">No jobs found</p>
            </td>
        `;
        tbody.appendChild(row);
        return;
    }

    allJobs.forEach((job, index) => {
        const isSustainability = job.primary_path === 'sustainability';
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
