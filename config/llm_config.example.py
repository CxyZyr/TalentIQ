"""
LLM 配置文件（模板）

复制为 llm_config.py，或直接在项目根 .env 中配置 DEEPSEEK_API_KEY 等。
    cp config/llm_config.example.py config/llm_config.py
"""
import os

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "YOUR_DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

JD_ASSISTANT_CONFIG = {
    "model": DEEPSEEK_MODEL, "api_key": DEEPSEEK_API_KEY, "base_url": DEEPSEEK_BASE_URL,
    "temperature": 1.0, "max_tokens": 8000,
}
HARD_REQUIREMENTS_EXTRACTION_CONFIG = {
    "model": DEEPSEEK_MODEL, "api_key": DEEPSEEK_API_KEY, "base_url": DEEPSEEK_BASE_URL,
    "temperature": 1.0, "max_tokens": 8000,
}
AI_SCORE_CONFIG = {
    "model": DEEPSEEK_MODEL, "api_key": DEEPSEEK_API_KEY, "base_url": DEEPSEEK_BASE_URL,
    "temperature": 1.0, "max_tokens": 8000,
}
