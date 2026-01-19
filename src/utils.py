"""
Job Radar - Utility Functions
Helper functions for configuration loading, logging, and common operations
"""

import os
import yaml
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import hashlib
from pathlib import Path


def setup_logging(log_level: str = "INFO") -> logging.Logger:
    """
    Setup logging configuration

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR)

    Returns:
        Configured logger instance
    """
    logging.basicConfig(
        level=getattr(logging, log_level),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    return logging.getLogger('job_radar')


def load_yaml_config(file_path: str) -> Dict[str, Any]:
    """
    Load YAML configuration file

    Args:
        file_path: Path to YAML config file

    Returns:
        Dictionary containing configuration

    Raises:
        FileNotFoundError: If config file doesn't exist
        yaml.YAMLError: If file is not valid YAML
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        return config
    except FileNotFoundError:
        raise FileNotFoundError(f"Config file not found: {file_path}")
    except yaml.YAMLError as e:
        raise yaml.YAMLError(f"Invalid YAML in {file_path}: {e}")


def load_text_file(file_path: str) -> str:
    """
    Load text file content

    Args:
        file_path: Path to text file

    Returns:
        File content as string
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        raise FileNotFoundError(f"Text file not found: {file_path}")


def load_json_file(file_path: str) -> Dict[str, Any]:
    """
    Load JSON file

    Args:
        file_path: Path to JSON file

    Returns:
        Dictionary containing JSON data
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        # Return empty structure if file doesn't exist
        return {"jobs": {}, "last_updated": None}
    except json.JSONDecodeError as e:
        raise json.JSONDecodeError(f"Invalid JSON in {file_path}: {e}")


def load_optional_json(file_path: str) -> Dict[str, Any]:
    """
    Load JSON file if it exists, otherwise return empty dict

    Args:
        file_path: Path to JSON file

    Returns:
        Dictionary containing JSON data or empty dict
    """
    if not Path(file_path).exists():
        return {}
    return load_json_file(file_path)


def save_json_file(file_path: str, data: Dict[str, Any]) -> None:
    """
    Save data to JSON file

    Args:
        file_path: Path to JSON file
        data: Dictionary to save
    """
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def generate_job_id(url: str, title: str, company: str) -> str:
    """
    Generate unique identifier for a job posting
    Uses URL as primary key, title+company as backup

    Args:
        url: Job posting URL
        title: Job title
        company: Company name

    Returns:
        16-character hash string
    """
    # Normalize URL (remove query params that might change)
    normalized_url = url.split('?')[0].lower().strip()

    # Create composite key
    composite = f"{normalized_url}|{title.lower().strip()}|{company.lower().strip()}"

    # Hash to create short, stable ID
    return hashlib.sha256(composite.encode()).hexdigest()[:16]


def get_date_n_days_ago(days: int) -> datetime:
    """
    Get datetime object for N days ago

    Args:
        days: Number of days in the past

    Returns:
        Datetime object
    """
    return datetime.now() - timedelta(days=days)


def format_date_for_search(date: datetime) -> str:
    """
    Format date for Google search (after:YYYY-MM-DD format)

    Args:
        date: Datetime object

    Returns:
        Formatted date string
    """
    return date.strftime("%Y-%m-%d")


def get_api_key(key_name: str) -> Optional[str]:
    """
    Get API key from environment variable

    Args:
        key_name: Name of environment variable

    Returns:
        API key value or None if not found
    """
    return os.environ.get(key_name)


def calculate_days_old(posted_date: datetime) -> int:
    """
    Calculate how many days old a job posting is

    Args:
        posted_date: When job was posted

    Returns:
        Number of days old
    """
    if isinstance(posted_date, str):
        posted_date = datetime.fromisoformat(posted_date)

    return (datetime.now() - posted_date).days


def get_freshness_label(days_old: int, thresholds: list) -> Dict[str, str]:
    """
    Get freshness label and color based on days old

    Args:
        days_old: Number of days since posting
        thresholds: List of threshold dicts with days, label, color

    Returns:
        Dict with label and color
    """
    for threshold in sorted(thresholds, key=lambda x: x['days']):
        if days_old <= threshold['days']:
            return {
                'label': threshold['label'],
                'color': threshold['color']
            }

    # Default for very old jobs
    return {'label': 'Old', 'color': '#6B7280'}


def get_fit_score_label(score: int, labels: Dict[int, str]) -> str:
    """
    Get fit score label based on score value

    Args:
        score: Fit score (0-100)
        labels: Dict mapping threshold to label

    Returns:
        Label string
    """
    for threshold in sorted(labels.keys(), reverse=True):
        if score >= threshold:
            return labels[threshold]

    return "Poor"


def validate_config(config: Dict[str, Any], required_keys: list) -> bool:
    """
    Validate that config contains required keys

    Args:
        config: Configuration dictionary
        required_keys: List of required key paths (e.g., ["claude.model"])

    Returns:
        True if valid

    Raises:
        ValueError: If required keys missing
    """
    for key_path in required_keys:
        keys = key_path.split('.')
        current = config

        for key in keys:
            if key not in current:
                raise ValueError(f"Missing required config key: {key_path}")
            current = current[key]

    return True


if __name__ == "__main__":
    # Test utility functions
    logger = setup_logging("INFO")
    logger.info("Testing utility functions")

    # Test job ID generation
    job_id = generate_job_id(
        "https://boards.greenhouse.io/company/jobs/123",
        "Senior Analyst",
        "Acme Corp"
    )
    logger.info(f"Generated job ID: {job_id}")

    # Test date formatting
    date_7_days_ago = get_date_n_days_ago(7)
    formatted = format_date_for_search(date_7_days_ago)
    logger.info(f"Date 7 days ago: {formatted}")

    logger.info("Utility functions test complete")
