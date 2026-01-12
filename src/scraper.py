"""
Job Radar - Job Board Scraper Module
Extracts job details from various job board platforms
"""

import time
import requests
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional
from datetime import datetime
import logging
import re

from utils import load_yaml_config, setup_logging


logger = logging.getLogger('job_radar.scraper')


class JobScraper:
    """Base class for scraping job boards"""

    def __init__(self, settings_path: str = "config/settings.yaml"):
        """
        Initialize scraper with settings

        Args:
            settings_path: Path to settings config
        """
        self.settings = load_yaml_config(settings_path)
        self.scraping_config = self.settings['scraping']
        self.user_agent = self.scraping_config['user_agent']
        self.timeout = self.scraping_config['timeout']
        self.max_retries = self.scraping_config['max_retries']
        self.delay = self.scraping_config['delay_between_requests']
        
        # Create a session for cookie handling and connection reuse
        self.session = requests.Session()
        
        # Set default headers to mimic a real browser
        self.session.headers.update({
            'User-Agent': self.user_agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
        })

    def scrape_job(self, url: str, source: str) -> Optional[Dict[str, Any]]:
        """
        Scrape job details from URL

        Args:
            url: Job posting URL
            source: Job board name (greenhouse, ashby, lever, workable)

        Returns:
            Dict with job details or None if failed
        """
        logger.info(f"Scraping {source}: {url}")

        # Route to appropriate scraper
        if source == 'greenhouse':
            return self.scrape_greenhouse(url)
        elif source == 'ashby':
            return self.scrape_ashby(url)
        elif source == 'lever':
            return self.scrape_lever(url)
        elif source == 'workable':
            return self.scrape_workable(url)
        else:
            logger.warning(f"Unknown source: {source}")
            return None

    def _fetch_page(self, url: str, allow_redirects: bool = True) -> Optional[BeautifulSoup]:
        """
        Fetch webpage with retries

        Args:
            url: URL to fetch
            allow_redirects: Whether to follow redirects (default: True)

        Returns:
            BeautifulSoup object or None if failed
        """
        for attempt in range(self.max_retries):
            try:
                # Add Referer header if this is a retry (helps with some bot protection)
                if attempt > 0:
                    self.session.headers['Referer'] = url
                
                response = self.session.get(url, timeout=self.timeout, allow_redirects=allow_redirects)
                response.raise_for_status()

                return BeautifulSoup(response.content, 'lxml')

            except requests.exceptions.HTTPError as e:
                # Handle 403 errors specifically
                if e.response.status_code == 403:
                    logger.warning(f"Attempt {attempt + 1} failed: 403 Forbidden - {url}")
                    # For 403 errors, try with different approach on last attempt
                    if attempt == self.max_retries - 1:
                        # Try one more time with minimal headers (sometimes works)
                        try:
                            minimal_headers = {'User-Agent': self.user_agent}
                            response = requests.get(url, headers=minimal_headers, timeout=self.timeout, allow_redirects=allow_redirects)
                            response.raise_for_status()
                            logger.info(f"Successfully fetched with minimal headers: {url}")
                            return BeautifulSoup(response.content, 'lxml')
                        except Exception:
                            pass
                else:
                    logger.warning(f"Attempt {attempt + 1} failed: {e}")
                
                # Wait before retry if not last attempt
                if attempt < self.max_retries - 1:
                    wait_time = 2 ** attempt  # Exponential backoff
                    time.sleep(wait_time)
                else:
                    logger.error(f"Failed to fetch {url} after {self.max_retries} attempts")
                    return None
                    
            except requests.RequestException as e:
                logger.warning(f"Attempt {attempt + 1} failed: {e}")
                # Wait before retry if not last attempt
                if attempt < self.max_retries - 1:
                    wait_time = 2 ** attempt  # Exponential backoff
                    time.sleep(wait_time)
                else:
                    logger.error(f"Failed to fetch {url} after {self.max_retries} attempts")
                    return None

        return None

    def _extract_text(self, soup: BeautifulSoup, selector: str,
                     attribute: Optional[str] = None) -> str:
        """
        Extract text from HTML using CSS selector

        Args:
            soup: BeautifulSoup object
            selector: CSS selector
            attribute: Optional attribute to extract instead of text

        Returns:
            Extracted text or 'N/A' if not found
        """
        try:
            element = soup.select_one(selector)
            if element:
                if attribute:
                    return element.get(attribute, 'N/A')
                return element.get_text(strip=True)
        except Exception as e:
            logger.warning(f"Error extracting with selector '{selector}': {e}")

        return 'N/A'

    def _clean_text(self, text: str) -> str:
        """Clean and normalize text"""
        if not text or text == 'N/A':
            return text

        # Remove extra whitespace
        text = ' '.join(text.split())

        # Remove non-printable characters
        text = ''.join(char for char in text if char.isprintable() or char == '\n')

        return text.strip()

    def scrape_greenhouse(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Scrape Greenhouse job board

        Args:
            url: Greenhouse job URL

        Returns:
            Job details dict
        """
        soup = self._fetch_page(url)
        if not soup:
            return None

        try:
            # Title - try multiple selectors for Greenhouse
            title = self._extract_text(soup, 'h1')
            if title == 'N/A':
                title = self._extract_text(soup, 'h1.app-title')
            if title == 'N/A':
                title = self._extract_text(soup, '.job-title')
            if title == 'N/A':
                # Try finding h1 with text
                h1 = soup.find('h1')
                if h1:
                    title = h1.get_text(strip=True)

            # Company
            company = self._extract_text(soup, '.company-name')
            if company == 'N/A':
                # Extract from URL
                match = re.search(r'boards\.greenhouse\.io/([^/]+)', url)
                company = match.group(1).replace('-', ' ').title() if match else 'N/A'

            # Location
            location = self._extract_text(soup, '.location')

            # Description - try multiple selectors for Greenhouse
            description = ''
            # Try common Greenhouse selectors
            for selector in [
                '#content', 
                '.job-description', 
                '.content',
                '[id*="content"]',
                '[class*="description"]',
                'main',
                'article'
            ]:
                desc_elem = soup.select_one(selector)
                if desc_elem:
                    text = desc_elem.get_text(separator='\n', strip=True)
                    # Only use if we got substantial content (at least 100 chars)
                    if len(text) > 100:
                        description = text
                        break
            
            # If still no description, try to get body text
            if not description:
                body = soup.find('body')
                if body:
                    # Remove script and style tags
                    for script in body(["script", "style", "nav", "header", "footer"]):
                        script.decompose()
                    text = body.get_text(separator='\n', strip=True)
                    if len(text) > 100:
                        description = text

            # Posted date - Greenhouse doesn't always show this
            posted_date = datetime.now().isoformat()

            job_data = {
                'title': self._clean_text(title),
                'company': self._clean_text(company),
                'location': self._clean_text(location),
                'description': self._clean_text(description),
                'url': url,
                'source': 'greenhouse',
                'posted_date': posted_date,
                'scraped_at': datetime.now().isoformat()
            }

            logger.info(f"✓ Scraped Greenhouse: {job_data['title']} at {job_data['company']}")
            return job_data

        except Exception as e:
            logger.error(f"Error scraping Greenhouse job: {e}")
            return None

    def scrape_ashby(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Scrape Ashby job board

        Args:
            url: Ashby job URL

        Returns:
            Job details dict
        """
        soup = self._fetch_page(url)
        if not soup:
            return None

        try:
            # Title - try multiple selectors for Ashby
            title = self._extract_text(soup, 'h1')
            if title == 'N/A':
                title = self._extract_text(soup, '.job-title')
            if title == 'N/A':
                title = self._extract_text(soup, '[data-testid="job-title"]')
            if title == 'N/A':
                # Try finding h1 with text
                h1 = soup.find('h1')
                if h1:
                    title = h1.get_text(strip=True)

            # Company - extract from URL
            match = re.search(r'jobs\.ashbyhq\.com/([^/]+)', url)
            company = match.group(1).replace('-', ' ').title() if match else 'N/A'

            # Location
            location = self._extract_text(soup, '.location')
            if location == 'N/A':
                location = self._extract_text(soup, '[class*="location"]')

            # Description - try multiple selectors for Ashby
            description = ''
            # Try to find description elements
            for selector in [
                '[class*="description"]',
                'main',
                'article',
                '[data-testid*="description"]',
                '.job-details',
                '.job-content'
            ]:
                desc_elem = soup.select_one(selector)
                if desc_elem:
                    text = desc_elem.get_text(separator='\n', strip=True)
                    # Only use if we got substantial content (at least 100 chars)
                    if len(text) > 100:
                        description = text
                        break
            
            # Fallback: get all text from main content
            if not description:
                main = soup.find('main')
                if main:
                    # Remove script and style tags
                    for script in main(["script", "style", "nav", "header", "footer"]):
                        script.decompose()
                    text = main.get_text(separator='\n', strip=True)
                    if len(text) > 100:
                        description = text

            # Posted date
            posted_date = datetime.now().isoformat()

            job_data = {
                'title': self._clean_text(title),
                'company': self._clean_text(company),
                'location': self._clean_text(location),
                'description': self._clean_text(description),
                'url': url,
                'source': 'ashby',
                'posted_date': posted_date,
                'scraped_at': datetime.now().isoformat()
            }

            logger.info(f"✓ Scraped Ashby: {job_data['title']} at {job_data['company']}")
            return job_data

        except Exception as e:
            logger.error(f"Error scraping Ashby job: {e}")
            return None

    def scrape_lever(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Scrape Lever job board

        Args:
            url: Lever job URL

        Returns:
            Job details dict
        """
        soup = self._fetch_page(url)
        if not soup:
            return None

        try:
            # Title
            title = self._extract_text(soup, 'h2')
            if title == 'N/A':
                title = self._extract_text(soup, '.posting-headline h2')

            # Company - extract from URL or page
            company = self._extract_text(soup, '.main-header-text-primary')
            if company == 'N/A':
                match = re.search(r'jobs\.lever\.co/([^/]+)', url)
                company = match.group(1).replace('-', ' ').title() if match else 'N/A'

            # Location
            location = self._extract_text(soup, '.posting-categories .location')
            if location == 'N/A':
                location = self._extract_text(soup, '.workplaceTypes')

            # Description
            description = ''
            desc_elem = soup.select_one('.posting-description')
            if desc_elem:
                description = desc_elem.get_text(separator='\n', strip=True)

            # Posted date
            posted_date = datetime.now().isoformat()

            job_data = {
                'title': self._clean_text(title),
                'company': self._clean_text(company),
                'location': self._clean_text(location),
                'description': self._clean_text(description),
                'url': url,
                'source': 'lever',
                'posted_date': posted_date,
                'scraped_at': datetime.now().isoformat()
            }

            logger.info(f"✓ Scraped Lever: {job_data['title']} at {job_data['company']}")
            return job_data

        except Exception as e:
            logger.error(f"Error scraping Lever job: {e}")
            return None

    def scrape_workable(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Scrape Workable job board

        Args:
            url: Workable job URL

        Returns:
            Job details dict
        """
        soup = self._fetch_page(url)
        if not soup:
            return None

        try:
            # Title
            title = self._extract_text(soup, 'h1')
            if title == 'N/A':
                title = self._extract_text(soup, '[data-ui="job-title"]')

            # Company - extract from page or URL
            company = self._extract_text(soup, '.company-name')
            if company == 'N/A':
                match = re.search(r'apply\.workable\.com/([^/]+)', url)
                company = match.group(1).replace('-', ' ').title() if match else 'N/A'

            # Location
            location = self._extract_text(soup, '.job-location')
            if location == 'N/A':
                location = self._extract_text(soup, '[data-ui="job-location"]')

            # Description
            description = ''
            desc_elem = soup.select_one('.description')
            if not desc_elem:
                desc_elem = soup.select_one('[data-ui="job-description"]')
            if desc_elem:
                description = desc_elem.get_text(separator='\n', strip=True)

            # Posted date
            posted_date = datetime.now().isoformat()

            job_data = {
                'title': self._clean_text(title),
                'company': self._clean_text(company),
                'location': self._clean_text(location),
                'description': self._clean_text(description),
                'url': url,
                'source': 'workable',
                'posted_date': posted_date,
                'scraped_at': datetime.now().isoformat()
            }

            logger.info(f"✓ Scraped Workable: {job_data['title']} at {job_data['company']}")
            return job_data

        except Exception as e:
            logger.error(f"Error scraping Workable job: {e}")
            return None


def main():
    """Test the scraper module"""
    setup_logging("INFO")
    logger.info("Testing Job Scraper")

    # Test URLs for each board (you'll need real URLs to test)
    test_urls = {
        'greenhouse': 'https://boards.greenhouse.io/example/jobs/123',
        'ashby': 'https://jobs.ashbyhq.com/example/abc',
        'lever': 'https://jobs.lever.co/example/xyz',
        'workable': 'https://apply.workable.com/example/j/ABC123/',
    }

    scraper = JobScraper()

    for source, url in test_urls.items():
        logger.info(f"\n{'='*60}")
        logger.info(f"Testing {source} scraper")
        logger.info(f"{'='*60}")

        job = scraper.scrape_job(url, source)

        if job:
            logger.info(f"✓ Title: {job['title']}")
            logger.info(f"✓ Company: {job['company']}")
            logger.info(f"✓ Location: {job['location']}")
            logger.info(f"✓ Description length: {len(job['description'])} chars")
        else:
            logger.error(f"✗ Failed to scrape {source}")

        time.sleep(2)  # Be polite


if __name__ == "__main__":
    main()
