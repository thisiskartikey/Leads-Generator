"""
Job Radar - Main Orchestrator
Coordinates job search, scraping, and analysis pipeline
"""

import time
from datetime import datetime
from typing import List, Dict, Any
import logging

from utils import (
    setup_logging,
    load_json_file,
    save_json_file,
    generate_job_id,
    load_yaml_config
)
from searcher import JobSearcher
from scraper import JobScraper
from analyzer import JobAnalyzer


logger = logging.getLogger('job_radar.main')


class JobRadar:
    """Main orchestrator for job search and analysis"""

    def __init__(self):
        """Initialize Job Radar system"""
        logger.info("Initializing Job Radar...")

        # Load configuration
        self.search_config = load_yaml_config("config/search_query.yaml")
        self.settings = load_yaml_config("config/settings.yaml")

        # Initialize components
        self.searcher = JobSearcher()
        self.scraper = JobScraper()
        self.analyzer = JobAnalyzer()

        # Load history
        self.history = load_json_file("data/history.json")

        # Results
        self.results = {
            'jobs': [],
            'metadata': {
                'run_timestamp': datetime.now().isoformat(),
                'total_searched': 0,
                'new_jobs_found': 0,
                'jobs_analyzed': 0,
                'jobs_skipped': 0
            }
        }

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
                # Merge search result data with scraped data
                job_data.update({
                    'search_snippet': job.get('snippet', '')
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

            # Analyze with both resumes
            analysis_results = self.analyzer.analyze_job_dual(
                job['description'],
                job['title']
            )

            # Merge analysis into job data
            job.update(analysis_results)

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
            # Get the higher of the two fit scores
            ai_score = job.get('ai_analysis', {}).get('fit_score', 0)
            sus_score = job.get('sustainability_analysis', {}).get('fit_score', 0)
            max_score = max(ai_score, sus_score)

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

        self.history['jobs'][job['job_id']] = {
            'url': job['url'],
            'title': job['title'],
            'company': job['company'],
            'first_seen': datetime.now().isoformat(),
            'ai_fit_score': job.get('ai_analysis', {}).get('fit_score', 0),
            'sustainability_fit_score': job.get('sustainability_analysis', {}).get('fit_score', 0)
        }

    def _save_results(self) -> None:
        """Save results and history to files"""
        # Save results
        save_json_file("data/results.json", self.results)
        logger.info("✓ Saved results to data/results.json")

        # Update and save history
        self.history['last_updated'] = datetime.now().isoformat()
        save_json_file("data/history.json", self.history)
        logger.info("✓ Saved history to data/history.json")

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
            sorted_jobs = sorted(
                self.results['jobs'],
                key=lambda j: max(
                    j.get('ai_analysis', {}).get('fit_score', 0),
                    j.get('sustainability_analysis', {}).get('fit_score', 0)
                ),
                reverse=True
            )

            for i, job in enumerate(sorted_jobs[:5], 1):
                ai_score = job.get('ai_analysis', {}).get('fit_score', 0)
                sus_score = job.get('sustainability_analysis', {}).get('fit_score', 0)
                max_score = max(ai_score, sus_score)

                logger.info(f"{i}. {job['title']} at {job['company']}")
                logger.info(f"   Fit Score: {max_score}% (AI: {ai_score}%, Sus: {sus_score}%)")
                logger.info(f"   URL: {job['url']}")
                logger.info("")

        logger.info(f"{'='*60}\n")


def main():
    """Main entry point"""
    # Setup logging
    setup_logging("INFO")

    try:
        # Create and run Job Radar
        radar = JobRadar()
        results = radar.run()

        # Exit code based on results
        if results['metadata']['jobs_analyzed'] > 0:
            logger.info("✓ Job Radar completed successfully!")
            return 0
        else:
            logger.warning("⚠ No new jobs found or analyzed")
            return 0  # Not an error, just no new jobs

    except Exception as e:
        logger.error(f"✗ Job Radar failed: {e}")
        return 1


if __name__ == "__main__":
    exit(main())
