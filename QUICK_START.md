# Job Radar - Quick Start Guide

Get your Job Radar running in 10 minutes!

## Prerequisites

- GitHub account
- Anthropic API key ([get here](https://console.anthropic.com))
- SerpAPI key ([get free tier](https://serpapi.com))

---

## 5-Minute Setup

### 1. Push to GitHub

```bash
cd "C:\Users\Kartikey Shukla\Claude\Job Tracker Project"

# Already completed! ✅
# Your code is at: https://github.com/thisiskartikey/Leads-Generator
```

### 2. Add API Keys

1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add two secrets:
   - Name: `ANTHROPIC_API_KEY` → Value: your Claude API key
   - Name: `SERPAPI_KEY` → Value: your SerpAPI key

### 3. Enable GitHub Pages

1. **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main**, Folder: **/web**
4. Click **Save**

### 4. Run First Search

1. Go to **Actions** tab
2. Click **"Job Radar Search & Analysis"**
3. Click **"Run workflow"** → **"Run workflow"**
4. Wait 3-5 minutes

### 5. View Results

Open: `https://thisiskartikey.github.io/Leads-Generator/`

---

## That's It!

Your Job Radar will now run automatically every **Tuesday & Saturday at 8am UTC**.

Check your dashboard anytime to see new opportunities!

---

## Quick Customization

### Change Search Keywords

Edit `config/search_query.yaml` → Commit → Run workflow again

### Update Your Resume

Edit `resumes/ai_resume.txt` or `resumes/sustainability_resume.txt` → Commit

### Change Schedule

Edit `.github/workflows/job-search.yml` cron line:
- `0 8 * * 2,6` = Tuesday & Saturday at 8am UTC
- `0 12 * * 1,4` = Monday & Thursday at 12pm UTC

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Workflow fails | Check API keys in Secrets |
| Dashboard blank | Wait for first workflow to complete |
| No jobs found | Broaden search keywords |
| Can't access dashboard | Verify Pages enabled with `/web` folder |

---

## Need More Help?

See full [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed instructions.

---

**Dashboard URL:** `https://thisiskartikey.github.io/Leads-Generator/`

**Next run:** Every Tuesday & Saturday at 8am UTC

Happy job hunting! 🎯
