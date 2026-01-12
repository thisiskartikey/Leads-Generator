# Job Radar - Complete Setup Guide

This guide will walk you through setting up your Job Radar system step-by-step.

## Prerequisites

Before you begin, make sure you have:

1. ✅ GitHub account (free)
2. ✅ Anthropic API key (get from [console.anthropic.com](https://console.anthropic.com))
3. ✅ SerpAPI key (get free tier from [serpapi.com](https://serpapi.com))
4. ✅ Git installed on your computer (optional, for local testing)
5. ✅ Python 3.11+ installed (optional, for local testing)

---

## Step 1: Create GitHub Repository

### Option A: Using GitHub Web Interface

1. Go to [github.com](https://github.com) and log in
2. Click the "+" icon in top right → "New repository"
3. Fill in:
   - **Repository name**: `job-radar`
   - **Description**: "Automated job search assistant powered by AI"
   - **Visibility**: Choose "Public" (for free GitHub Pages) or "Private" (requires paid plan for Pages)
4. **Do NOT** check "Add README" (we already have one)
5. Click "Create repository"

### Option B: Using Command Line (if you prefer)

```bash
# Navigate to your project folder
cd "C:\Users\Kartikey Shukla\Claude\Job Tracker Project"

# Initialize git
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial commit - Job Radar setup"

# Add remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/job-radar.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## Step 2: Add API Keys to GitHub Secrets

🔒 **Important**: Never commit API keys directly to your code!

1. Go to your GitHub repository webpage
2. Click **Settings** tab (top navigation)
3. In left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret** button
5. Add **ANTHROPIC_API_KEY**:
   - Name: `ANTHROPIC_API_KEY`
   - Secret: Paste your Anthropic API key (starts with `sk-ant-...`)
   - Click "Add secret"
6. Click **New repository secret** again
7. Add **SERPAPI_KEY**:
   - Name: `SERPAPI_KEY`
   - Secret: Paste your SerpAPI key
   - Click "Add secret"

✅ You should now see both secrets listed (values are hidden)

---

## Step 3: Enable GitHub Actions

1. In your repository, click the **Actions** tab
2. If prompted, click **"I understand my workflows, go ahead and enable them"**
3. You should see "Job Radar Search & Analysis" workflow listed

---

## Step 4: Enable GitHub Pages

1. Go to **Settings** tab → **Pages** (in left sidebar)
2. Under "Source":
   - Select **Deploy from a branch**
3. Under "Branch":
   - Branch: **main**
   - Folder: **/web**
4. Click **Save**

⏳ Wait 1-2 minutes for GitHub Pages to deploy

Your dashboard will be available at:
```
https://YOUR_USERNAME.github.io/job-radar/
```

---

## Step 5: Run Your First Job Search

### Manual Trigger (Recommended for first run)

1. Go to **Actions** tab
2. Click **"Job Radar Search & Analysis"** workflow
3. Click **"Run workflow"** dropdown (right side)
4. Click green **"Run workflow"** button
5. ⏳ Wait 2-5 minutes for workflow to complete

### Monitor Progress

1. Click on the running workflow (yellow dot → green checkmark or red X)
2. Click **"search-and-analyze"** to see logs
3. Expand steps to see detailed output

### Check Results

1. Go to your dashboard: `https://YOUR_USERNAME.github.io/job-radar/`
2. Refresh the page after workflow completes
3. You should see job tables populated!

---

## Step 6: Customize Your Search (Optional)

### Update Search Keywords

1. Go to your repository on GitHub
2. Navigate to `config/search_query.yaml`
3. Click the pencil icon (✏️) to edit
4. Modify keywords:
   ```yaml
   keywords:
     must_have:
       - sustainable
       - ESG
       - "renewable energy"  # Add your keywords
   ```
5. Scroll down → **Commit changes**

### Update Your Resumes

1. Navigate to `resumes/ai_resume.txt`
2. Click pencil icon to edit
3. Replace with your updated resume
4. Commit changes
5. Repeat for `resumes/sustainability_resume.txt`

After updating config or resumes, trigger a new workflow run to re-analyze jobs.

---

## Step 7: Verify Scheduled Runs

The workflow is scheduled to run automatically every **Tuesday and Saturday at 8:00 AM UTC**.

To verify:
1. Wait until next Tuesday or Saturday
2. Check **Actions** tab to see if workflow ran automatically
3. Check your dashboard for new results

### Adjust Schedule Time

To change the schedule (e.g., different timezone):

1. Edit `.github/workflows/job-search.yml`
2. Find the cron line:
   ```yaml
   - cron: '0 8 * * 2,6'  # 8am UTC on Tue(2) and Sat(6)
   ```
3. Adjust time:
   - `'0 12 * * 2,6'` = 12pm UTC (7am EST)
   - `'0 16 * * 2,6'` = 4pm UTC (11am EST)
   - `'30 10 * * 1,4'` = 10:30am UTC on Mon & Thu
4. Commit changes

Cron format: `minute hour day-of-month month day-of-week`

---

## Troubleshooting

### Workflow Fails

**Check Logs:**
1. Go to Actions tab → Failed workflow
2. Click failed job → Expand red steps
3. Look for error messages

**Common Issues:**

| Error | Solution |
|-------|----------|
| `ANTHROPIC_API_KEY not set` | Add secret in Settings → Secrets → Actions |
| `SERPAPI_KEY not set` | Add secret in Settings → Secrets → Actions |
| `Module not found` | Check `requirements.txt` is correct |
| `Permission denied (push)` | Check workflow has `contents: write` permission |
| `No jobs found` | Search query might be too specific, broaden keywords |

### Dashboard Shows "Loading..."

**Check:**
1. Did workflow complete successfully? (green checkmark in Actions)
2. Was `data/results.json` committed to repository?
3. Is GitHub Pages enabled correctly?
4. Try hard refresh: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)

### No New Jobs Found

This is normal if:
- All jobs have been seen before (check `data/history.json`)
- No new jobs posted in the last 7 days matching your criteria
- Job boards aren't currently listing relevant positions

**Solutions:**
- Broaden search keywords in `config/search_query.yaml`
- Increase `search_timeframe_days` from 7 to 14 days
- Check if search works on Google manually with your query

### Scraper Errors

Job boards occasionally change their HTML structure.

**Symptoms:**
- Workflow logs show "Failed to scrape" messages
- Job description field is empty or says "N/A"

**Solutions:**
1. Check if specific board is failing (Greenhouse, Ashby, Lever, Workable)
2. Test the URL manually in browser - does page load?
3. The scraper may need updating (create GitHub Issue)
4. Temporary fix: Remove failing board from `config/search_query.yaml`

### Cost Concerns

**Monitor costs:**
1. Check Claude API usage at [console.anthropic.com](https://console.anthropic.com)
2. Check SerpAPI usage at [serpapi.com/dashboard](https://serpapi.com/dashboard)

**Reduce costs:**
- Decrease `max_results_per_search` in `config/search_query.yaml`
- Increase `min_fit_score_to_show` to filter more aggressively
- Run less frequently (change schedule to once per week)
- Narrow search keywords to find fewer jobs

**Expected costs:**
- SerpAPI: FREE (within 100 searches/month)
- Claude API: ~$6-10/month (analyzing 400-600 jobs)
- GitHub: FREE

---

## Local Testing (Optional)

To test Job Radar on your local computer before deploying:

### Setup

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/job-radar.git
cd job-radar

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables (Windows)
set ANTHROPIC_API_KEY=your-key-here
set SERPAPI_KEY=your-key-here

# Set environment variables (Mac/Linux)
export ANTHROPIC_API_KEY=your-key-here
export SERPAPI_KEY=your-key-here
```

### Run Job Search

```bash
cd src
python main.py
```

### View Dashboard Locally

```bash
# Start local web server
cd web
python -m http.server 8000

# Open browser to: http://localhost:8000
```

---

## Maintenance

### Weekly
- Check dashboard for new high-fit jobs
- Monitor GitHub Actions for any failures

### Monthly
- Review API costs (Claude + SerpAPI)
- Update resumes if your experience changes
- Check if scrapers are working (job descriptions loading correctly)

### As Needed
- Adjust search keywords based on results quality
- Update fit score thresholds if needed
- Fix scrapers if job boards change HTML

---

## Advanced Configuration

### Change Fit Score Calculation

Edit `src/analyzer.py` prompt template to adjust scoring criteria.

### Add More Job Boards

1. Identify new job board domain (e.g., `jobvite.com`)
2. Add to `config/search_query.yaml` under `job_boards`
3. Inspect HTML structure of job pages
4. Add scraper method in `src/scraper.py`
5. Update `_identify_job_board` method

### Email Notifications

Future enhancement - can integrate with:
- GitHub Actions + SendGrid
- AWS SES
- Mailgun

Would require adding email sending logic after job analysis.

---

## Getting Help

### Resources
- 📖 [Main README](README.md)
- 📋 [Implementation Plan](.claude/plans/lovely-mixing-kernighan.md)
- 🐛 [Report Issues](https://github.com/YOUR_USERNAME/job-radar/issues)

### Common Questions

**Q: Can I search job boards besides the 4 supported?**
A: Yes, but you'll need to add custom scrapers. LinkedIn, Indeed are more complex (require authentication).

**Q: Can I deploy this somewhere other than GitHub?**
A: Yes! Can deploy to AWS Lambda, Heroku, Railway, etc. with modifications.

**Q: Will this work in regions outside USA?**
A: Update `locations` in search config to your target countries. Job boards must have listings in those regions.

**Q: How accurate are the fit scores?**
A: Claude is very good at analysis. Scores should be directionally correct. Fine-tune by adjusting the prompt in `analyzer.py`.

**Q: Can I add more resume versions?**
A: Yes, modify `analyzer.py` to load additional resumes and analyze jobs against all versions.

---

## Success Checklist

After setup, verify:

- [ ] Repository created and code pushed to GitHub
- [ ] API keys added to GitHub Secrets
- [ ] GitHub Actions enabled
- [ ] GitHub Pages enabled and accessible
- [ ] First workflow run completed successfully
- [ ] Dashboard displays jobs correctly
- [ ] Jobs are categorized (AI vs Sustainability)
- [ ] Fit scores appear reasonable
- [ ] Scheduled runs working (check after Tue/Sat)

---

## Next Steps

1. **Use it!** Check your dashboard regularly for new opportunities
2. **Refine search** - Adjust keywords based on results quality
3. **Track applications** - Note which jobs you apply to
4. **Iterate** - Update resumes and re-run to see score changes
5. **Contribute** - Improve scrapers, add features, share with others

---

🎉 **Congratulations!** Your Job Radar is now operational and will automatically find and analyze jobs for you twice a week.

Happy job hunting! 🚀
