"""
Job Radar - Google Search Module
Searches Google for job postings using SerpAPI
"""

import os
import time
from typing import List, Dict, Any, Optional
from serpapi import GoogleSearch
import logging

from utils import (
    load_yaml_config,
    get_date_n_days_ago,
    format_date_for_search,
    get_api_key,
    setup_logging,
    load_optional_json
)


logger = logging.getLogger('job_radar.searcher')


class JobSearcher:
    """Handles Google search for job postings via SerpAPI"""

    def __init__(self, config_path: str = "config/search_query.yaml",
                 settings_path: str = "config/settings.yaml",
                 profile_name: Optional[str] = None):
        """
        Initialize job searcher

        Args:
            config_path: Path to search query configuration
            settings_path: Path to system settings
        """
        self.search_config = load_yaml_config(config_path)
        self.settings = load_yaml_config(settings_path)
        self.profile_keywords = load_optional_json("config/profile_keywords.json")
        self.api_key = get_api_key("SERPAPI_KEY")

        if not self.api_key:
            raise ValueError("SERPAPI_KEY environment variable not set")

        self.profile_name = profile_name or self.search_config.get('active_profile')
        if not self.profile_name:
            raise ValueError("No profile specified and no active_profile set")

    def _get_keywords_config(self) -> Dict[str, Any]:
        """
        Get keyword configuration for the active profile.

        Order of precedence:
        1) config/profile_keywords.json
        2) config/search_query.yaml (profiles.<name>.keywords)
        3) config/search_query.yaml (keywords) for backward compatibility
        """
        profiles = self.profile_keywords.get('profiles', {})
        if self.profile_name in profiles:
            return profiles[self.profile_name].get('keywords', {})

        yaml_profiles = self.search_config.get('profiles', {})
        if self.profile_name in yaml_profiles:
            return yaml_profiles[self.profile_name].get('keywords', {})

        return self.search_config.get('keywords', {})

    def build_search_query(self) -> str:
        """
        Build Google search query from config

        Returns:
            Complete Google search query string

        Example output:
            (AI OR "artificial intelligence" OR sustainable) AND (consultant OR analyst)
            (site:greenhouse.io OR site:ashby.com) ("United States" OR remote)
        """
        keywords = self._get_keywords_config()
        boards = self.search_config['job_boards']
        locations = self.search_config['locations']

        keyword_parts = []

        # Build AI + Sustainability combined focus (primary keywords)
        # AI OR sustainability - at least one must be present
        focus_terms = []

        if 'ai_focus' in keywords:
            focus_terms.extend([f'"{kw}"' if ' ' in kw else kw
                              for kw in keywords['ai_focus']])

        if 'sustainability_focus' in keywords:
            focus_terms.extend([f'"{kw}"' if ' ' in kw else kw
                              for kw in keywords['sustainability_focus']])

        if focus_terms:
            focus_query = ' OR '.join(focus_terms)
            keyword_parts.append(f"({focus_query})")

        # Generic focus bucket (e.g., design roles)
        elif 'focus' in keywords:
            focus_query = ' OR '.join([f'"{kw}"' if ' ' in kw else kw
                                      for kw in keywords['focus']])
            keyword_parts.append(f"({focus_query})")

        # Backward compatibility for old 'must_have' format
        elif 'must_have' in keywords:
            must_have = ' OR '.join([f'"{kw}"' if ' ' in kw else kw
                                     for kw in keywords['must_have']])
            keyword_parts.append(f"({must_have})")

        # Build role part (role OR role OR ...)
        if 'roles' in keywords:
            roles = ' OR '.join([f'"{role}"' if ' ' in role else role
                                for role in keywords['roles']])
            keyword_parts.append(f"({roles})")

        # Build site part (site:board OR site:board OR ...)
        site_parts = ' OR '.join([f'site:{board}' for board in boards])
        keyword_parts.append(f"({site_parts})")

        # Build location part ("location" OR "location" OR ...)
        location_parts = ' OR '.join([f'"{loc}"' for loc in locations])
        keyword_parts.append(f"({location_parts})")

        # Combine all parts with AND
        query = ' AND '.join(keyword_parts)

        logger.info(f"Built search query: {query}")
        return query

    def search_jobs(self, max_results: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Search Google for jobs using SerpAPI

        Args:
            max_results: Maximum number of results to return (default from config)

        Returns:
            List of job results with url, title, snippet
        """
        query = self.build_search_query()

        if max_results is None:
            max_results = self.search_config.get('max_results_per_search', 50)

        # Add date filter (last N days)
        days_back = self.search_config.get('search_timeframe_days', 7)
        date_filter = get_date_n_days_ago(days_back)
        date_str = format_date_for_search(date_filter)

        # Add date restriction to query
        query_with_date = f"{query} after:{date_str}"

        logger.info(f"Searching Google for jobs (last {days_back} days)")
        logger.info(f"Max results: {max_results}")

        all_results = []
        results_per_page = self.settings['serpapi'].get('results_per_page', 10)

        # Calculate how many pages we need
        pages_needed = (max_results + results_per_page - 1) // results_per_page

        for page in range(pages_needed):
            try:
                # Build search params
                params = {
                    "q": query_with_date,
                    "api_key": self.api_key,
                    "num": results_per_page,
                    "start": page * results_per_page
                }

                # Execute search
                search = GoogleSearch(params)
                results = search.get_dict()

                # Extract organic results
                organic_results = results.get('organic_results', [])

                if not organic_results:
                    logger.info(f"No more results found on page {page + 1}")
                    break

                # Parse results
                for result in organic_results:
                    url = result.get('link', '')
                    source = self._identify_job_board(url)

                    job_data = {
                        'url': url,
                        'title': result.get('title', ''),
                        'snippet': result.get('snippet', ''),
                        'source': source
                    }

                    # Only include if from one of our target job boards
                    if job_data['source']:
                        all_results.append(job_data)
                    else:
                        # DEBUG: Log rejected URLs to identify the issue
                        logger.warning(f"Rejected URL (not from target job boards): {url}")

                logger.info(f"Page {page + 1}: Found {len(organic_results)} results, {len([r for r in organic_results if self._identify_job_board(r.get('link', ''))])} matched job boards")

                # Check if we have enough results
                if len(all_results) >= max_results:
                    all_results = all_results[:max_results]
                    break

                # Be polite to API (rate limiting)
                if page < pages_needed - 1:
                    time.sleep(1)

            except Exception as e:
                logger.error(f"Error searching page {page + 1}: {e}")
                break

        logger.info(f"Total jobs found: {len(all_results)}")
        return all_results

    def _identify_job_board(self, url: str) -> Optional[str]:
        """
        Identify which job board a URL belongs to

        Args:
            url: Job posting URL

        Returns:
            Job board name or None if not recognized
        """
        if not url:
            return None

        url_lower = url.lower()

        if 'greenhouse.io' in url_lower:
            return 'greenhouse'
        elif 'ashbyhq.com' in url_lower:
            return 'ashby'
        elif 'lever.co' in url_lower:
            return 'lever'
        elif 'workable.com' in url_lower:
            return 'workable'
        else:
            return None


def main():
    """Test the searcher module"""
    setup_logging("INFO")
    logger.info("Testing Job Searcher")

    try:
        searcher = JobSearcher()
        jobs = searcher.search_jobs(max_results=10)

        logger.info(f"\n{'='*60}")
        logger.info(f"Found {len(jobs)} jobs")
        logger.info(f"{'='*60}\n")

        for i, job in enumerate(jobs, 1):
            logger.info(f"{i}. {job['title']}")
            logger.info(f"   Source: {job['source']}")
            logger.info(f"   URL: {job['url']}")
            logger.info(f"   Snippet: {job['snippet'][:100]}...")
            logger.info("")

    except Exception as e:
        logger.error(f"Error: {e}")
        raise


if __name__ == "__main__":
    main()
