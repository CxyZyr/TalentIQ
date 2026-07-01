"""
LLM 配置文件（模板）

使用方法：复制本文件为 llm_config.py，并填入你自己的 API 密钥。
    cp config/llm_config.example.py config/llm_config.py

说明：项目默认对接 DeepSeek，兼容 OpenAI SDK 协议；也可替换为其他兼容
OpenAI 接口的服务（修改 base_url / model 即可）。
"""

# JD 帮写配置
JD_ASSISTANT_CONFIG = {
    "model": "deepseek-chat",
    "api_key": "YOUR_DEEPSEEK_API_KEY",
    "base_url": "https://api.deepseek.com/v1",
    "temperature": 1.0,
    "max_tokens": 8000,
}

# 硬性条件提取配置
HARD_REQUIREMENTS_EXTRACTION_CONFIG = {
    "model": "deepseek-chat",
    "api_key": "YOUR_DEEPSEEK_API_KEY",
    "base_url": "https://api.deepseek.com/v1",
    "temperature": 1.0,
    "max_tokens": 8000,
}

# AI 评分配置
AI_SCORE_CONFIG = {
    "model": "deepseek-chat",
    "api_key": "YOUR_DEEPSEEK_API_KEY",
    "base_url": "https://api.deepseek.com/v1",
    "temperature": 1.0,
    "max_tokens": 8000,
}
