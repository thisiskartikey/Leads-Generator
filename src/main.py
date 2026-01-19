"""
Job Radar - Main Orchestrator
Coordinates job search, scraping, and analysis pipeline
"""

import time
import argparse
from datetime import datetime
from typing import List, Dict, Any
import logging

from utils import (
    setup_logging,
    load_json_file,
    save_json_file,
    generate_job_id,
    load_yaml_config,
    load_optional_json
)
from searcher import JobSearcher
from scraper import JobScraper
from analyzer import JobAnalyzer


logger = logging.getLogger('job_radar.main')


class JobRadar:
    """Main orchestrator for job search and analysis"""

    def __init__(self, profile_name: str):
        """Initialize Job Radar system"""
        logger.info("Initializing Job Radar...")

        # Load configuration
        self.search_config = load_yaml_config("config/search_query.yaml")
        self.settings = load_yaml_config("config/settings.yaml")
        self.profile_keywords = load_optional_json("config/profile_keywords.json")
        self.profile_name = profile_name
        self.profile_display_name = self._get_profile_display_name()

        # Initialize components
        self.searcher = JobSearcher(profile_name=self.profile_name)
        self.scraper = JobScraper()
        self.analyzer = JobAnalyzer()

        # Load history
        self.history = load_json_file(self._history_path())

        # Results
        self.results = {
            'jobs': [],
            'metadata': {
                'profile': self.profile_name,
                'profile_display_name': self.profile_display_name,
                'run_timestamp': datetime.now().isoformat(),
                'total_searched': 0,
                'new_jobs_found': 0,
                'jobs_analyzed': 0,
                'jobs_skipped': 0
            }
        }

    def _get_profile_display_name(self) -> str:
        profiles = self.search_config.get('profiles', {})
        if self.profile_name in profiles:
            return profiles[self.profile_name].get('display_name', self.profile_name.title())
        return self.profile_name.title()

    def _history_path(self) -> str:
        return f"data/history_{self.profile_name}.json"

    def _results_path(self) -> str:
        return f"data/results_{self.profile_name}.json"

    def run(self) -> Dict[str, Any]:
        """
        Execute complete job search and analysis pipeline

        Returns:
            Results dictionary
        """
        logger.info(f"\n{'='*60}")
        logger.info("JOB RADAR - Starting Search Pipeline")
        logger.info(f"{'='*60}\n")

        try:
            # Step 1: Search Google for jobs
            logger.info("Step 1: Searching Google for job postings...")
            job_leads = self.searcher.search_jobs()
            self.results['metadata']['total_searched'] = len(job_leads)

            if not job_leads:
                logger.warning("No jobs found in search results")
                return self.results

            logger.info(f"Found {len(job_leads)} potential jobs\n")

            # Step 2: Filter out jobs we've seen before
            logger.info("Step 2: Filtering out previously seen jobs...")
            new_jobs = self._filter_new_jobs(job_leads)
            self.results['metadata']['new_jobs_found'] = len(new_jobs)

            if not new_jobs:
                logger.info("No new jobs found (all have been seen before)")
                return self.results

            logger.info(f"Found {len(new_jobs)} new jobs to analyze\n")

            # Step 3: Scrape each new job
            logger.info("Step 3: Scraping job details...")
            scraped_jobs = self._scrape_jobs(new_jobs)

            if not scraped_jobs:
                logger.warning("No jobs successfully scraped")
                return self.results

            logger.info(f"Successfully scraped {len(scraped_jobs)} jobs\n")

            # Step 4: Analyze each job with Claude
            logger.info("Step 4: Analyzing jobs with Claude AI...")
            analyzed_jobs = self._analyze_jobs(scraped_jobs)
            self.results['metadata']['jobs_analyzed'] = len(analyzed_jobs)

            logger.info(f"Analyzed {len(analyzed_jobs)} jobs\n")

            # Step 5: Filter by minimum fit score
            logger.info("Step 5: Filtering by minimum fit score...")
            filtered_jobs = self._filter_by_fit_score(analyzed_jobs)

            logger.info(f"Found {len(filtered_jobs)} jobs meeting minimum fit score\n")

            # Step 6: Save results
            logger.info("Step 6: Saving results...")
            self.results['jobs'] = filtered_jobs
            self._save_results()

            # Print summary
            self._print_summary()

            return self.results

        except Exception as e:
            logger.error(f"Error in pipeline: {e}")
            raise

    def _filter_new_jobs(self, job_leads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Filter out jobs that have been seen before

        Args:
            job_leads: List of job leads from search

        Returns:
            List of new job leads
        """
        new_jobs = []
        seen_jobs = self.history.get('jobs', {})

        for job in job_leads:
            # Generate unique ID for this job
            job_id = generate_job_id(job['url'], job['title'], '')

            # Check if we've seen this job before
            if job_id not in seen_jobs:
                new_jobs.append(job)
                logger.debug(f"New job: {job['title']}")
            else:
                logger.debug(f"Already seen: {job['title']}")
                self.results['metadata']['jobs_skipped'] += 1

        return new_jobs

    def _scrape_jobs(self, job_leads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Scrape full details for each job

        Args:
            job_leads: List of job leads with URLs

        Returns:
            List of scraped job details
        """
        scraped_jobs = []
        delay = self.settings['scraping']['delay_between_requests']

        for i, job in enumerate(job_leads, 1):
            logger.info(f"[{i}/{len(job_leads)}] Scraping: {job['title']}")

            # Scrape job details
            job_data = self.scraper.scrape_job(job['url'], job['source'])

            if job_data:
                # Preserve title from search if scraped title is N/A
                if (job_data.get('title') == 'N/A' or not job_data.get('title')) and job.get('title'):
                    job_data['title'] = job['title']
                
                # Merge search result data with scraped data
                job_data.update({
                    'search_snippet': job.get('snippet', ''),
                    'search_title': job.get('title', '')  # Preserve original search title
                })
                scraped_jobs.append(job_data)
            else:
                logger.warning(f"Failed to scrape: {job['url']}")

            # Be polite to servers
            if i < len(job_leads):
                time.sleep(delay)

        return scraped_jobs

    def _analyze_jobs(self, scraped_jobs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Analyze each job against both resumes

        Args:
            scraped_jobs: List of scraped job details

        Returns:
            List of jobs with analysis results
        """
        analyzed_jobs = []

        for i, job in enumerate(scraped_jobs, 1):
            logger.info(f"[{i}/{len(scraped_jobs)}] Analyzing: {job['title']} at {job['company']}")

            # Use description if available, otherwise fallback to search snippet
            description = job.get('description', '').strip()
            if not description and job.get('search_snippet'):
                description = job['search_snippet']
                logger.debug(f"Using search snippet as description for {job.get('title', 'N/A')}")
            
            if self.profile_name == 'kartikey':
                # Analyze with both resumes
                analysis_results = self.analyzer.analyze_job_dual(
                    description or job.get('title', 'Job'),
                    job['title']
                )
                # Merge analysis into job data
                job.update(analysis_results)
            else:
                analysis = self.analyzer.analyze_job(
                    description or job.get('title', 'Job'),
                    self.profile_name
                )
                if analysis:
                    job[f'{self.profile_name}_analysis'] = analysis
                else:
                    job[f'{self.profile_name}_analysis'] = {
                        'fit_score': 0,
                        'category': 'Unknown',
                        'justification': 'Analysis failed',
                        'positioning_advice': 'Could not analyze this job'
                    }
            
            # Extract job title from analysis if available and title is N/A
            if job.get('title') == 'N/A' or not job.get('title') or job.get('title').strip() == '':
                # Priority 1: Use search title from Google search results (most reliable)
                if job.get('search_title') and job.get('search_title') != 'N/A' and job.get('search_title').strip():
                    job['title'] = job['search_title'].strip()
                    logger.info(f"Using search title: {job['title']}")
                # Priority 2: Try to get from Claude analysis (extracted_title)
                elif job.get('ai_analysis', {}).get('extracted_title'):
                    job['title'] = job['ai_analysis']['extracted_title']
                    logger.info(f"Extracted title from AI analysis: {job['title']}")
                elif job.get('sustainability_analysis', {}).get('extracted_title'):
                    job['title'] = job['sustainability_analysis']['extracted_title']
                    logger.info(f"Extracted title from sustainability analysis: {job['title']}")
                elif job.get(f'{self.profile_name}_analysis', {}).get('extracted_title'):
                    job['title'] = job[f'{self.profile_name}_analysis']['extracted_title']
                    logger.info(f"Extracted title from {self.profile_name} analysis: {job['title']}")
                # Priority 3: Fallback to search snippet title (first line usually contains title)
                elif job.get('search_snippet'):
                    snippet = job['search_snippet']
                    # Try to extract title from snippet (usually first line before period/dash)
                    title_part = snippet.split('.')[0].split('—')[0].split('|')[0].split('\n')[0].strip()
                    if title_part and len(title_part) < 100 and len(title_part) > 3:  # Reasonable title length
                        job['title'] = title_part
                        logger.info(f"Extracted title from snippet: {job['title']}")
                # Final fallback: use 'N/A'
                if not job.get('title') or job.get('title').strip() == '':
                    job['title'] = 'N/A'
                    logger.warning(f"Could not extract title for job at {job.get('url', 'unknown URL')}")

            # Generate unique job ID
            job['job_id'] = generate_job_id(job['url'], job['title'], job['company'])

            # Calculate days old (always 0 since we just found it)
            job['days_old'] = 0

            analyzed_jobs.append(job)

            # Add to history
            self._add_to_history(job)

        return analyzed_jobs

    def _filter_by_fit_score(self, jobs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Filter jobs by minimum fit score

        Args:
            jobs: List of analyzed jobs

        Returns:
            Filtered list of jobs
        """
        min_score = self.search_config.get('min_fit_score_to_show', 60)

        filtered = []
        for job in jobs:
            if self.profile_name == 'kartikey':
                # Get the higher of the two fit scores
                ai_score = job.get('ai_analysis', {}).get('fit_score', 0)
                sus_score = job.get('sustainability_analysis', {}).get('fit_score', 0)
                max_score = max(ai_score, sus_score)
            else:
                max_score = job.get(f'{self.profile_name}_analysis', {}).get('fit_score', 0)

            if max_score >= min_score:
                filtered.append(job)
                logger.debug(f"✓ {job['title']}: {max_score}% (kept)")
            else:
                logger.debug(f"✗ {job['title']}: {max_score}% (filtered)")

        return filtered

    def _add_to_history(self, job: Dict[str, Any]) -> None:
        """
        Add job to history to avoid re-analyzing

        Args:
            job: Job data dict
        """
        if 'jobs' not in self.history:
            self.history['jobs'] = {}

        history_entry = {
            'url': job['url'],
            'title': job['title'],
            'company': job['company'],
            'first_seen': datetime.now().isoformat()
        }

        if self.profile_name == 'kartikey':
            history_entry['ai_fit_score'] = job.get('ai_analysis', {}).get('fit_score', 0)
            history_entry['sustainability_fit_score'] = job.get('sustainability_analysis', {}).get('fit_score', 0)
        else:
            history_entry['fit_score'] = job.get(f'{self.profile_name}_analysis', {}).get('fit_score', 0)

        self.history['jobs'][job['job_id']] = history_entry

    def _save_results(self) -> None:
        """Save results and history to files"""
        # Save results
        results_path = self._results_path()
        save_json_file(results_path, self.results)
        logger.info(f"✓ Saved results to {results_path}")

        # Update and save history
        self.history['last_updated'] = datetime.now().isoformat()
        history_path = self._history_path()
        save_json_file(history_path, self.history)
        logger.info(f"✓ Saved history to {history_path}")

    def _print_summary(self) -> None:
        """Print execution summary"""
        metadata = self.results['metadata']

        logger.info(f"\n{'='*60}")
        logger.info("JOB RADAR - Execution Summary")
        logger.info(f"{'='*60}")
        logger.info(f"Timestamp: {metadata['run_timestamp']}")
        logger.info(f"Total searched: {metadata['total_searched']}")
        logger.info(f"New jobs found: {metadata['new_jobs_found']}")
        logger.info(f"Jobs analyzed: {metadata['jobs_analyzed']}")
        logger.info(f"Jobs skipped (seen before): {metadata['jobs_skipped']}")
        logger.info(f"Jobs in results: {len(self.results['jobs'])}")

        # Print Claude API stats
        self.analyzer.print_stats()

        # Print top jobs
        if self.results['jobs']:
            logger.info("Top Jobs by Fit Score:")
            logger.info(f"{'-'*60}")

            # Sort by highest fit score
            if self.profile_name == 'kartikey':
                sorted_jobs = sorted(
                    self.results['jobs'],
                    key=lambda j: max(
                        j.get('ai_analysis', {}).get('fit_score', 0),
                        j.get('sustainability_analysis', {}).get('fit_score', 0)
                    ),
                    reverse=True
                )
            else:
                sorted_jobs = sorted(
                    self.results['jobs'],
                    key=lambda j: j.get(f'{self.profile_name}_analysis', {}).get('fit_score', 0),
                    reverse=True
                )

            for i, job in enumerate(sorted_jobs[:5], 1):
                if self.profile_name == 'kartikey':
                    ai_score = job.get('ai_analysis', {}).get('fit_score', 0)
                    sus_score = job.get('sustainability_analysis', {}).get('fit_score', 0)
                    max_score = max(ai_score, sus_score)
                    score_note = f" (AI: {ai_score}%, Sus: {sus_score}%)"
                else:
                    max_score = job.get(f'{self.profile_name}_analysis', {}).get('fit_score', 0)
                    score_note = ""

                logger.info(f"{i}. {job['title']} at {job['company']}")
                logger.info(f"   Fit Score: {max_score}%{score_note}")
                logger.info(f"   URL: {job['url']}")
                logger.info("")

        logger.info(f"{'='*60}\n")


def main():
    """Main entry point"""
    # Setup logging
    setup_logging("INFO")

    try:
        parser = argparse.ArgumentParser(description="Job Radar runner")
        parser.add_argument("--profile", help="Profile name to run")
        parser.add_argument("--all-profiles", action="store_true", help="Run all profiles")
        args = parser.parse_args()

        search_config = load_yaml_config("config/search_query.yaml")
        profile_keywords = load_optional_json("config/profile_keywords.json")

        profiles_from_keywords = list(profile_keywords.get('profiles', {}).keys())
        profiles_from_config = list(search_config.get('profiles', {}).keys())

        if args.all_profiles:
            profiles = profiles_from_keywords or profiles_from_config
            if not profiles:
                raise ValueError("No profiles found to run")

            for profile_name in profiles:
                radar = JobRadar(profile_name)
                results = radar.run()
                if results['metadata']['jobs_analyzed'] > 0:
                    logger.info(f"✓ Job Radar completed for {profile_name}!")
                else:
                    logger.warning("? No new jobs found or analyzed for {0}" -f profile_name)
            return 0

        profile_name = args.profile or search_config.get('active_profile')
        if not profile_name:
            raise ValueError("No profile specified and no active_profile set")

        radar = JobRadar(profile_name)
        results = radar.run()

        if results['metadata']['jobs_analyzed'] > 0:
            logger.info("✓ Job Radar completed successfully!")
            return 0
        logger.warning("? No new jobs found or analyzed")
        return 0  # Not an error, just no new jobs

    except Exception as e:
        logger.error("? Job Radar failed: {0}" -f e)
        return 1


if __name__ == "__main__":
    exit(main())

