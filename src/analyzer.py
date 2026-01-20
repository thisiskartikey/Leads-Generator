"""
Job Radar - Claude AI Analyzer Module
Analyzes job fit using Anthropic's Claude API
"""

import json
import logging
from typing import Dict, Any, Optional
from anthropic import Anthropic

from utils import (
    load_yaml_config,
    load_text_file,
    get_api_key,
    setup_logging
)


logger = logging.getLogger('job_radar.analyzer')


class JobAnalyzer:
    """Analyzes job postings against resumes using Claude API"""

    def __init__(self, settings_path: str = "config/settings.yaml"):
        """
        Initialize analyzer with Claude API

        Args:
            settings_path: Path to settings config
        """
        self.settings = load_yaml_config(settings_path)
        self.claude_config = self.settings['claude']

        # Initialize Anthropic client
        api_key = get_api_key("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable not set")

        self.client = Anthropic(api_key=api_key)

        # Load resumes
        self.resumes = {
            'ai': load_text_file("resumes/ai_resume.txt"),
            'sustainability': load_text_file("resumes/sustainability_resume.txt"),
            'anvesha': load_text_file("resumes/anvesha_resume.txt")
        }

        # Stats tracking
        self.stats = {
            'total_analyses': 0,
            'total_input_tokens': 0,
            'total_output_tokens': 0,
            'total_cost_usd': 0.0
        }

    def analyze_job(self, job_description: str, resume_type: str) -> Optional[Dict[str, Any]]:
        """
        Analyze a single job against a resume

        Args:
            job_description: Full job description text
            resume_type: Either 'ai' or 'sustainability'

        Returns:
            Dict with fit_score, category, justification, positioning_advice
        """
        if resume_type not in self.resumes:
            raise ValueError(f"Invalid resume type: {resume_type}")

        resume_text = self.resumes[resume_type]

        # Build prompt
        prompt = self._build_prompt(job_description, resume_text, resume_type)

        try:
            # Call Claude API
            response = self.client.messages.create(
                model=self.claude_config['model'],
                max_tokens=self.claude_config['max_tokens'],
                temperature=self.claude_config['temperature'],
                messages=[{"role": "user", "content": prompt}]
            )

            # Track usage
            self.stats['total_analyses'] += 1
            self.stats['total_input_tokens'] += response.usage.input_tokens
            self.stats['total_output_tokens'] += response.usage.output_tokens

            # Calculate cost (Claude Sonnet 4.5 pricing: $3/MTok input, $15/MTok output)
            cost = (response.usage.input_tokens / 1_000_000 * 3.0) + \
                   (response.usage.output_tokens / 1_000_000 * 15.0)
            self.stats['total_cost_usd'] += cost

            # Parse response
            analysis = self._parse_response(response.content[0].text)

            if analysis:
                logger.info(f"✓ Analyzed for {resume_type}: Score {analysis['fit_score']}")
                return analysis
            else:
                logger.error("Failed to parse Claude response")
                return None

        except Exception as e:
            logger.error(f"Error calling Claude API: {e}")
            return None

    def analyze_job_dual(self, job_description: str, job_title: str = "Job") -> Dict[str, Any]:
        """
        Analyze job against both resumes

        Args:
            job_description: Full job description
            job_title: Job title for logging

        Returns:
            Dict with 'ai_analysis' and 'sustainability_analysis' keys
        """
        logger.info(f"Analyzing: {job_title}")

        results = {}

        for resume_type in ['ai', 'sustainability']:
            analysis = self.analyze_job(job_description, resume_type)
            if analysis:
                results[f'{resume_type}_analysis'] = analysis
            else:
                # Fallback if analysis fails
                results[f'{resume_type}_analysis'] = {
                    'fit_score': 0,
                    'category': 'Unknown',
                    'justification': 'Analysis failed',
                    'positioning_advice': 'Could not analyze this job'
                }

        return results

    def analyze_location(
        self,
        job_description: str,
        job_title: str = "Job",
        scraped_location: str = "",
        search_snippet: str = ""
    ) -> Optional[Dict[str, Any]]:
        """
        Analyze job location and determine if it is US-based.

        Args:
            job_description: Full job description text
            job_title: Job title
            scraped_location: Location from scraper (if available)
            search_snippet: Search snippet (if available)

        Returns:
            Dict with location_text, country, region, is_us, confidence, evidence
        """
        prompt = self._build_location_prompt(job_description, job_title, scraped_location, search_snippet)

        try:
            response = self.client.messages.create(
                model=self.claude_config['model'],
                max_tokens=min(self.claude_config.get('max_tokens', 1000), 500),
                temperature=0.1,
                messages=[{"role": "user", "content": prompt}]
            )

            self.stats['total_analyses'] += 1
            self.stats['total_input_tokens'] += response.usage.input_tokens
            self.stats['total_output_tokens'] += response.usage.output_tokens

            cost = (response.usage.input_tokens / 1_000_000 * 3.0) + \
                   (response.usage.output_tokens / 1_000_000 * 15.0)
            self.stats['total_cost_usd'] += cost

            analysis = self._parse_location_response(response.content[0].text)
            if analysis:
                logger.info(
                    f"û Location classified: {analysis.get('location_text', 'N/A')} "
                    f"(US={analysis.get('is_us')}, conf={analysis.get('confidence')})"
                )
            return analysis

        except Exception as e:
            logger.error(f"Error calling Claude API for location: {e}")
            return None

    def _build_prompt(self, job_description: str, resume_text: str, resume_type: str) -> str:
        """
        Build analysis prompt for Claude

        Args:
            job_description: Job posting text
            resume_text: Resume text
            resume_type: ai or sustainability

        Returns:
            Formatted prompt string
        """
        prompt = f"""You are a career advisor analyzing job fit for a candidate with expertise in {resume_type.upper()} and related fields.

JOB POSTING:
{job_description[:10000]}

CANDIDATE RESUME ({resume_type.upper()} Focus):
{resume_text}

Analyze this job posting and provide a structured assessment in JSON format.

Consider:
1. **Skills Match**: How well do the required skills align with candidate's experience?
2. **Experience Level**: Does the seniority level match (entry/mid/senior/director)?
3. **Domain Relevance**: Is this in the candidate's target domain (AI/Tech or Sustainability)?
4. **Impact Potential**: Would this role leverage the candidate's strengths?
5. **Career Growth**: Does this advance the candidate's career goals?

Respond ONLY with valid JSON in this exact format:
{{
  "fit_score": <integer 0-100>,
  "category": "<AI/Tech OR Sustainability OR Hybrid>",
  "justification": "<one concise sentence explaining the score, max 20 words>",
  "positioning_advice": "<1 concise sentence (max 15 words) on how to position experience for this role>",
  "job_title": "<extract the job title from the job posting if clearly stated>"
}}

Scoring guide:
- 90-100: Exceptional fit, top priority - nearly perfect skills/experience match
- 75-89: Strong fit, definitely apply - good alignment with most requirements
- 60-74: Moderate fit, consider applying - some relevant experience but gaps exist
- 40-59: Weak fit, apply only if very interested - significant misalignment
- 0-39: Poor fit, not recommended - minimal relevance to role

Category definitions:
- "AI/Tech": Jobs focused on AI, machine learning, data science, technology strategy, software, automation
- "Sustainability": Jobs focused on ESG, climate, environmental programs, decarbonization, sustainability reporting
- "Hybrid": Jobs that equally balance both AI/Tech and Sustainability domains

Be honest and specific. Don't inflate scores.

JSON response:"""

        return prompt

    def _build_location_prompt(
        self,
        job_description: str,
        job_title: str,
        scraped_location: str,
        search_snippet: str
    ) -> str:
        """
        Build location classification prompt for Claude.

        Returns:
            Formatted prompt string
        """
        prompt = f"""You are a location classifier. Determine where this role is located.

Use any explicit location info in the job description, title, or snippet. If it is remote,
specify whether it is US-only, global, or unknown. If multiple locations are listed, choose
the primary or most likely.

JOB TITLE:
{job_title}

SCRAPED LOCATION:
{scraped_location or 'N/A'}

SEARCH SNIPPET:
{search_snippet[:1000]}

JOB DESCRIPTION:
{job_description[:8000]}

Respond ONLY with valid JSON in this exact format:
{{
  "location_text": "<concise location string, e.g., 'United States (Remote)' or 'San Francisco, CA'>",
  "country": "<country name or 'Unknown'>",
  "region": "<state/province or 'Unknown'>",
  "is_us": <true|false|\"unknown\">,
  "confidence": <number between 0 and 1>,
  "evidence": "<short phrase citing the signal>"
}}

JSON response:"""

        return prompt

    def _parse_response(self, response_text: str) -> Optional[Dict[str, Any]]:
        """
        Parse Claude's JSON response

        Args:
            response_text: Raw response from Claude

        Returns:
            Parsed analysis dict or None if invalid
        """
        try:
            # Clean response (remove markdown code blocks if present)
            cleaned = response_text.strip()

            # Remove markdown code fences
            if cleaned.startswith('```json'):
                cleaned = cleaned[7:]
            elif cleaned.startswith('```'):
                cleaned = cleaned[3:]

            if cleaned.endswith('```'):
                cleaned = cleaned[:-3]

            cleaned = cleaned.strip()

            # Parse JSON
            data = json.loads(cleaned)

            # Validate required fields
            required_fields = ['fit_score', 'category', 'justification', 'positioning_advice']
            for field in required_fields:
                if field not in data:
                    logger.error(f"Missing required field: {field}")
                    return None
            
            # Extract job_title if provided (optional field from Claude)
            if 'job_title' in data and data['job_title']:
                data['extracted_title'] = data['job_title']

            # Validate fit_score is integer 0-100
            if not isinstance(data['fit_score'], int) or not (0 <= data['fit_score'] <= 100):
                logger.error(f"Invalid fit_score: {data['fit_score']}")
                return None

            # Validate category
            valid_categories = ['AI/Tech', 'Sustainability', 'Hybrid']
            if data['category'] not in valid_categories:
                logger.warning(f"Invalid category '{data['category']}', defaulting to Hybrid")
                data['category'] = 'Hybrid'

            return data

        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error: {e}")
            logger.error(f"Response text: {response_text[:500]}")
            return None
        except Exception as e:
            logger.error(f"Error parsing response: {e}")
            return None

    def _parse_location_response(self, response_text: str) -> Optional[Dict[str, Any]]:
        """
        Parse Claude's location JSON response.

        Args:
            response_text: Raw response from Claude

        Returns:
            Parsed location dict or None if invalid
        """
        try:
            cleaned = response_text.strip()

            if cleaned.startswith('```json'):
                cleaned = cleaned[7:]
            elif cleaned.startswith('```'):
                cleaned = cleaned[3:]

            if cleaned.endswith('```'):
                cleaned = cleaned[:-3]

            cleaned = cleaned.strip()
            data = json.loads(cleaned)

            required_fields = ['location_text', 'country', 'region', 'is_us', 'confidence']
            for field in required_fields:
                if field not in data:
                    logger.error(f"Missing required field in location response: {field}")
                    return None

            is_us = data.get('is_us')
            if isinstance(is_us, str):
                normalized = is_us.strip().lower()
                if normalized in ('true', 'yes', 'us', 'usa'):
                    is_us = True
                elif normalized in ('false', 'no', 'non-us', 'non us'):
                    is_us = False
                else:
                    is_us = "unknown"
            elif isinstance(is_us, bool):
                pass
            else:
                is_us = "unknown"
            data['is_us'] = is_us

            confidence = data.get('confidence')
            if not isinstance(confidence, (int, float)):
                confidence = 0.0
            confidence = max(0.0, min(float(confidence), 1.0))
            data['confidence'] = confidence

            return data

        except json.JSONDecodeError as e:
            logger.error(f"Location JSON parse error: {e}")
            logger.error(f"Response text: {response_text[:500]}")
            return None
        except Exception as e:
            logger.error(f"Error parsing location response: {e}")
            return None

    def get_stats(self) -> Dict[str, Any]:
        """
        Get usage statistics

        Returns:
            Dict with analysis stats
        """
        return self.stats.copy()

    def print_stats(self) -> None:
        """Print usage statistics"""
        logger.info(f"\n{'='*60}")
        logger.info("Claude API Usage Statistics")
        logger.info(f"{'='*60}")
        logger.info(f"Total analyses: {self.stats['total_analyses']}")
        logger.info(f"Input tokens: {self.stats['total_input_tokens']:,}")
        logger.info(f"Output tokens: {self.stats['total_output_tokens']:,}")
        logger.info(f"Total cost: ${self.stats['total_cost_usd']:.4f}")
        logger.info(f"{'='*60}\n")


def main():
    """Test the analyzer module"""
    setup_logging("INFO")
    logger.info("Testing Job Analyzer")

    # Test with a sample job description
    test_job_description = """
    Senior Sustainability Analyst

    We're looking for a sustainability analyst to join our ESG team.
    You'll be responsible for:
    - Developing decarbonization strategies
    - Managing GHG inventory and reporting (TCFD, CDP)
    - Analyzing climate risks and opportunities
    - Stakeholder engagement on sustainability initiatives

    Requirements:
    - 5+ years in sustainability, ESG, or climate-related roles
    - Experience with emissions accounting and carbon reduction programs
    - Strong analytical and data visualization skills
    - Excellent communication and project management abilities

    Bonus:
    - Experience with Science Based Targets (SBTi)
    - Knowledge of renewable energy and circular economy
    - MBA or relevant master's degree
    """

    try:
        analyzer = JobAnalyzer()

        # Test dual analysis
        results = analyzer.analyze_job_dual(test_job_description, "Senior Sustainability Analyst")

        logger.info(f"\n{'='*60}")
        logger.info("Analysis Results")
        logger.info(f"{'='*60}\n")

        for resume_type in ['ai', 'sustainability']:
            key = f'{resume_type}_analysis'
            if key in results:
                analysis = results[key]
                logger.info(f"{resume_type.upper()} Resume Analysis:")
                logger.info(f"  Fit Score: {analysis['fit_score']}/100")
                logger.info(f"  Category: {analysis['category']}")
                logger.info(f"  Justification: {analysis['justification']}")
                logger.info(f"  Positioning: {analysis['positioning_advice']}")
                logger.info("")

        # Print stats
        analyzer.print_stats()

    except Exception as e:
        logger.error(f"Error: {e}")
        raise


if __name__ == "__main__":
    main()
