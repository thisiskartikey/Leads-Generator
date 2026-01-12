# Job Radar 🎯

Automated job search assistant that finds, analyzes, and ranks job opportunities tailored to your profile using AI.

## What It Does

Job Radar automatically:
1. **Searches** Google for relevant jobs on major job boards (Greenhouse, Ashby, Lever, Workable)
2. **Analyzes** each job against your resume using Claude AI
3. **Scores** fit percentage (0-100%) with detailed justification
4. **Displays** results in a web dashboard with two tables (AI/Tech jobs & Sustainability jobs)
5. **Tracks** history to avoid showing duplicates

## Features

- 🤖 **AI-Powered Analysis**: Claude API evaluates job fit for two career paths
- 🔄 **Automated Schedule**: Runs Tuesday & Saturday mornings automatically
- 🎯 **Manual Trigger**: Run search anytime from GitHub Actions
- 📊 **Clean Dashboard**: Mobile-friendly web interface
- ⚙️ **Easy Config**: Edit search criteria via YAML files
- 💰 **Cost Effective**: ~$6-10/month with free hosting

## Tech Stack

- **Backend**: Python 3.11+ (anthropic, beautifulsoup4, serpapi)
- **Frontend**: HTML/CSS/JavaScript (Bootstrap)
- **Hosting**: GitHub Actions + GitHub Pages (free)
- **APIs**: Anthropic Claude API, SerpAPI

## Quick Start

### Prerequisites

1. **Anthropic API Key**: Get from [console.anthropic.com](https://console.anthropic.com)
2. **SerpAPI Key**: Get free tier from [serpapi.com](https://serpapi.com) (100 searches/month)
3. **GitHub Account**: For hosting and automation

### Setup

1. **Clone this repository**
   ```bash
   git clone https://github.com/yourusername/job-radar.git
   cd job-radar
   ```

2. **Install dependencies** (for local testing)
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure search criteria**
   - Edit `config/search_query.yaml` to define what jobs you want
   - Edit `resumes/ai_resume.txt` and `resumes/sustainability_resume.txt`

4. **Add API keys to GitHub Secrets**
   - Go to repo Settings → Secrets → Actions
   - Add `ANTHROPIC_API_KEY`
   - Add `SERPAPI_KEY`

5. **Enable GitHub Actions & Pages**
   - Go to Actions tab → Enable workflows
   - Go to Settings → Pages → Deploy from branch `main`, folder `/web`

6. **Trigger first run**
   - Go to Actions tab → "Job Radar Search" → "Run workflow"
   - Wait 2-3 minutes
   - Visit `https://yourusername.github.io/job-radar/`

## Usage

### View Dashboard
Visit: `https://yourusername.github.io/job-radar/`

### Manual Search
1. Go to GitHub repo → Actions tab
2. Select "Job Radar Search" workflow
3. Click "Run workflow"
4. Refresh dashboard after 2-3 minutes

### Update Search Criteria
1. Edit `config/search_query.yaml` in GitHub
2. Commit changes
3. Next run will use new criteria

### Update Resumes
1. Edit resume files in `resumes/` folder
2. Commit changes
3. Trigger manual run to re-analyze jobs

## Configuration

### Search Query (`config/search_query.yaml`)
```yaml
keywords:
  must_have:
    - sustainable
    - ESG
    - climate
  roles:
    - consultant
    - analyst
    - "program manager"
```

### Settings (`config/settings.yaml`)
```yaml
claude:
  model: "claude-sonnet-4-5-20250929"
  temperature: 0.3

scraping:
  delay_between_requests: 2
  max_retries: 3
```

## File Structure

```
job-radar/
├── .github/workflows/     # GitHub Actions automation
├── config/                # Search & system configuration
├── resumes/               # Your resume files
├── src/                   # Python source code
├── data/                  # Results and history (generated)
├── web/                   # Dashboard (HTML/CSS/JS)
└── requirements.txt       # Python dependencies
```

## Cost Estimate

### Monthly Costs
- **SerpAPI**: FREE (100 searches/month tier)
- **Claude API**: ~$6-10 (analyzing 400-600 jobs/month)
- **GitHub Actions**: FREE (within 2,000 minutes/month)
- **GitHub Pages**: FREE

**Total**: ~$6-10/month

## Troubleshooting

### No jobs found
- Check if search query is too specific
- Verify SerpAPI key is valid
- Check GitHub Actions logs for errors

### Scraper errors
- Job board may have changed HTML structure
- Update scraper logic in `src/scraper.py`
- Check `max_retries` in settings

### Dashboard not updating
- Verify workflow ran successfully (green checkmark)
- GitHub Pages updates 30-60 seconds after commit
- Try force refresh (Ctrl+Shift+R)

### API errors
- Check API key is correct in GitHub Secrets
- Verify you have API credits (console.anthropic.com)
- Check rate limits

## Development

### Run locally
```bash
# Set environment variables
export ANTHROPIC_API_KEY="your-key"
export SERPAPI_KEY="your-key"

# Run search
python src/main.py

# Start local web server
python -m http.server 8000 --directory web
# Visit http://localhost:8000
```

### Test components
```bash
# Test search
python src/searcher.py

# Test scraper
python src/scraper.py

# Test analyzer
python src/analyzer.py
```

## Roadmap

### MVP (Current)
- ✅ Google search integration
- ✅ Job board scrapers (4 boards)
- ✅ Claude AI analysis
- ✅ Dual resume scoring
- ✅ Web dashboard
- ✅ GitHub Actions automation
- ✅ History tracking

### Phase 2 (Future)
- [ ] Enhanced UI (Tailwind CSS)
- [ ] Advanced filtering/sorting
- [ ] Email notifications
- [ ] Application tracking
- [ ] Analytics dashboard

### Phase 3 (Ideas)
- [ ] LinkedIn integration
- [ ] Auto resume tailoring
- [ ] Interview prep suggestions
- [ ] Salary data integration

## Contributing

This is a personal project, but feel free to fork and adapt for your needs!

## License

MIT License - feel free to use and modify.

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review GitHub Actions logs
3. Check the plan file in `.claude/plans/` for detailed implementation notes

## Acknowledgments

Built with:
- [Anthropic Claude API](https://www.anthropic.com/)
- [SerpAPI](https://serpapi.com/)
- [GitHub Actions](https://github.com/features/actions)
- [Bootstrap](https://getbootstrap.com/)

---

Happy job hunting! 🚀
