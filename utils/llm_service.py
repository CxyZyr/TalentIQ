"""
LLM服务工具类
"""
import asyncio
import json
import logging
import re
import time
import httpx
from openai import OpenAI, AsyncOpenAI, APIConnectionError, APITimeoutError
from typing import Dict, Any, Optional, AsyncIterator, Callable
from config.llm_config import JD_ASSISTANT_CONFIG, HARD_REQUIREMENTS_EXTRACTION_CONFIG

MAX_RETRIES = 3
RETRY_BASE_DELAY = 2
JSON_RETRY_ATTEMPTS = 3
logger = logging.getLogger(__name__)


class LLMService:
    """LLM服务基类"""

    def __init__(self, config: Dict[str, Any]):
        """初始化LLM服务"""
        self.api_key = config["api_key"]
        self.base_url = config["base_url"]
        self.model = config["model"]
        self.temperature = config.get("temperature", 1.0)
        self.max_tokens = config.get("max_tokens", 8000)
        self.timeout = 600.0

    def _build_sync_client(self) -> OpenAI:
        http_client = httpx.Client(
            timeout=httpx.Timeout(self.timeout, connect=30.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=0),
            headers={"Connection": "close"},
            http2=False,
        )
        return OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            timeout=self.timeout,
            max_retries=0,
            http_client=http_client,
        )

    def _build_async_client(self) -> AsyncOpenAI:
        http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout, connect=30.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=0),
            headers={"Connection": "close"},
            http2=False,
        )
        return AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            timeout=self.timeout,
            max_retries=0,
            http_client=http_client,
        )

    def _is_retryable_error(self, error: Exception) -> bool:
        retryable_types = (
            APIConnectionError,
            APITimeoutError,
            httpx.RemoteProtocolError,
            httpx.ReadError,
            httpx.ReadTimeout,
            httpx.ConnectError,
            httpx.ConnectTimeout,
            httpx.WriteError,
        )
        return isinstance(error, retryable_types)

    def _clean_json_response(self, response: str) -> str:
        cleaned = response.strip()

        if cleaned.startswith('```json'):
            cleaned = cleaned[7:]
        elif cleaned.startswith('```'):
            cleaned = cleaned[3:]

        if cleaned.endswith('```'):
            cleaned = cleaned[:-3]

        cleaned = cleaned.strip()
        cleaned = re.sub(r'//.*?\n', '\n', cleaned)
        cleaned = re.sub(r'/\*.*?\*/', '', cleaned, flags=re.DOTALL)
        return cleaned.strip()

    def parse_json_response(self, response: str) -> Any:
        cleaned = self._clean_json_response(response)
        return json.loads(cleaned)

    def _build_json_retry_messages(self, messages: list, response: str, error: Exception, repair_prompt: Optional[str]) -> list:
        retry_prompt = repair_prompt or (
            "你上一个回复未通过JSON解析或结构校验。"
            "请严格按照原要求重新输出有效JSON。"
            "不要包含markdown代码块、解释、注释或额外文字。"
        )
        return [
            *messages,
            {"role": "assistant", "content": response},
            {"role": "user", "content": f"{retry_prompt}\n错误信息：{str(error)}"}
        ]

    def chat_json(
        self,
        messages: list,
        validator: Optional[Callable[[Any], None]] = None,
        repair_prompt: Optional[str] = None,
        **kwargs
    ) -> Any:
        last_error = None
        last_response = None
        current_messages = messages

        for attempt in range(1, JSON_RETRY_ATTEMPTS + 1):
            response = self.chat(current_messages, **kwargs)
            last_response = response
            try:
                parsed = self.parse_json_response(response)
                if validator:
                    validator(parsed)
                return parsed
            except Exception as e:
                last_error = e
                logger.warning(
                    "[LLM] JSON解析失败 model=%s attempt=%d/%d error_type=%s error=%s",
                    self.model,
                    attempt,
                    JSON_RETRY_ATTEMPTS,
                    type(e).__name__,
                    str(e),
                )
                if attempt < JSON_RETRY_ATTEMPTS:
                    current_messages = self._build_json_retry_messages(messages, response, e, repair_prompt)

        return {
            "parse_error": str(last_error),
            "raw_response": last_response
        }

    async def async_chat_json(
        self,
        messages: list,
        validator: Optional[Callable[[Any], None]] = None,
        repair_prompt: Optional[str] = None,
        **kwargs
    ) -> Any:
        last_error = None
        last_response = None
        current_messages = messages

        for attempt in range(1, JSON_RETRY_ATTEMPTS + 1):
            response = await self.async_chat(current_messages, **kwargs)
            last_response = response
            try:
                parsed = self.parse_json_response(response)
                if validator:
                    validator(parsed)
                return parsed
            except Exception as e:
                last_error = e
                logger.warning(
                    "[LLM] 异步JSON解析失败 model=%s attempt=%d/%d error_type=%s error=%s",
                    self.model,
                    attempt,
                    JSON_RETRY_ATTEMPTS,
                    type(e).__name__,
                    str(e),
                )
                if attempt < JSON_RETRY_ATTEMPTS:
                    current_messages = self._build_json_retry_messages(messages, response, e, repair_prompt)

        return {
            "parse_error": str(last_error),
            "raw_response": last_response
        }

    def chat(self, messages: list, **kwargs) -> str:
        """调用LLM进行对话（同步，供后台线程使用）"""
        last_error = None
        start_time = time.time()

        for attempt in range(1, MAX_RETRIES + 1):
            client = self._build_sync_client()
            try:
                logger.info(
                    "[LLM] 同步调用开始 model=%s base_url=%s attempt=%d/%d message_count=%d",
                    self.model,
                    self.base_url,
                    attempt,
                    MAX_RETRIES,
                    len(messages),
                )
                response = client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=kwargs.get("temperature", self.temperature),
                    max_tokens=kwargs.get("max_tokens", self.max_tokens)
                )
                logger.info(
                    "[LLM] 同步调用成功 model=%s attempt=%d/%d elapsed=%.2fs",
                    self.model,
                    attempt,
                    MAX_RETRIES,
                    time.time() - start_time,
                )
                return response.choices[0].message.content
            except Exception as e:
                last_error = e
                retryable = self._is_retryable_error(e)
                logger.warning(
                    "[LLM] 同步调用失败 model=%s attempt=%d/%d elapsed=%.2fs retryable=%s error_type=%s error=%s",
                    self.model,
                    attempt,
                    MAX_RETRIES,
                    time.time() - start_time,
                    retryable,
                    type(e).__name__,
                    str(e),
                )
                if self._is_retryable_error(e) and attempt < MAX_RETRIES:
                    delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
                    logger.info("[LLM] 同步调用准备重试 model=%s next_attempt=%d wait=%ds", self.model, attempt + 1, delay)
                    time.sleep(delay)
                else:
                    break
            finally:
                client.close()

        logger.error(
            "[LLM] 同步调用最终失败 model=%s base_url=%s total_elapsed=%.2fs error=%s",
            self.model,
            self.base_url,
            time.time() - start_time,
            str(last_error),
        )
        raise Exception(f"LLM调用失败: {str(last_error)}")

    async def async_chat(self, messages: list, **kwargs) -> str:
        """调用LLM进行对话（异步，供路由层使用）"""
        last_error = None
        start_time = time.time()

        for attempt in range(1, MAX_RETRIES + 1):
            client = self._build_async_client()
            try:
                logger.info(
                    "[LLM] 异步调用开始 model=%s base_url=%s attempt=%d/%d message_count=%d",
                    self.model,
                    self.base_url,
                    attempt,
                    MAX_RETRIES,
                    len(messages),
                )
                response = await client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=kwargs.get("temperature", self.temperature),
                    max_tokens=kwargs.get("max_tokens", self.max_tokens)
                )
                logger.info(
                    "[LLM] 异步调用成功 model=%s attempt=%d/%d elapsed=%.2fs",
                    self.model,
                    attempt,
                    MAX_RETRIES,
                    time.time() - start_time,
                )
                return response.choices[0].message.content
            except Exception as e:
                last_error = e
                retryable = self._is_retryable_error(e)
                logger.warning(
                    "[LLM] 异步调用失败 model=%s attempt=%d/%d elapsed=%.2fs retryable=%s error_type=%s error=%s",
                    self.model,
                    attempt,
                    MAX_RETRIES,
                    time.time() - start_time,
                    retryable,
                    type(e).__name__,
                    str(e),
                )
                if self._is_retryable_error(e) and attempt < MAX_RETRIES:
                    delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
                    logger.info("[LLM] 异步调用准备重试 model=%s next_attempt=%d wait=%ds", self.model, attempt + 1, delay)
                    await asyncio.sleep(delay)
                else:
                    break
            finally:
                await client.close()

        logger.error(
            "[LLM] 异步调用最终失败 model=%s base_url=%s total_elapsed=%.2fs error=%s",
            self.model,
            self.base_url,
            time.time() - start_time,
            str(last_error),
        )
        raise Exception(f"LLM调用失败: {str(last_error)}")

    def chat_stream(self, messages: list, **kwargs):
        """调用LLM进行流式对话（同步）"""
        client = self._build_sync_client()
        try:
            stream = client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=kwargs.get("temperature", self.temperature),
                max_tokens=kwargs.get("max_tokens", self.max_tokens),
                stream=True
            )
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            raise Exception(f"LLM调用失败: {str(e)}")
        finally:
            client.close()

    async def async_chat_stream(self, messages: list, **kwargs) -> AsyncIterator[str]:
        """调用LLM进行流式对话（异步）"""
        client = self._build_async_client()
        try:
            stream = await client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=kwargs.get("temperature", self.temperature),
                max_tokens=kwargs.get("max_tokens", self.max_tokens),
                stream=True
            )
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            raise Exception(f"LLM调用失败: {str(e)}")
        finally:
            await client.close()


class JDAssistantService(LLMService):
    """JD帮写服务"""

    def __init__(self):
        super().__init__(JD_ASSISTANT_CONFIG)

    def generate_job_responsibilities(self, jd_info: Dict[str, Any]) -> str:
        """生成岗位职责"""
        prompt = self._build_prompt(jd_info, "岗位职责")
        messages = [
            {"role": "system", "content": "你是一个专业的HR助手，擅长撰写职位描述(JD)。请根据提供的岗位信息，生成专业、清晰、具体的内容。"},
            {"role": "user", "content": prompt}
        ]
        return self.chat(messages)

    def generate_job_responsibilities_stream(self, jd_info: Dict[str, Any]):
        """生成岗位职责（流式）"""
        prompt = self._build_prompt(jd_info, "岗位职责")
        messages = [
            {"role": "system", "content": """你是一个专业的HR助手，擅长撰写职位描述(JD)。
请根据提供的岗位信息，生成专业、清晰、具体的岗位职责。

要求：
1. 列出6-10条核心职责，内容要充实详细
2. 每条职责要具体、可执行，包含明确的工作内容和预期产出
3. 覆盖岗位的主要工作领域，包括日常工作、项目工作、协作沟通等方面
4. 直接输出纯文本，每条一行，格式如：1. xxx
5. 根据岗位级别调整职责范围和深度"""},
            {"role": "user", "content": prompt}
        ]
        yield from self.chat_stream(messages)

    async def async_generate_job_responsibilities_stream(self, jd_info: Dict[str, Any]):
        """生成岗位职责（异步流式）"""
        prompt = self._build_prompt(jd_info, "岗位职责")
        messages = [
            {"role": "system", "content": """你是一个专业的HR助手，擅长撰写职位描述(JD)。
请根据提供的岗位信息，生成专业、清晰、具体的岗位职责。

要求：
1. 列出6-10条核心职责，内容要充实详细
2. 每条职责要具体、可执行，包含明确的工作内容和预期产出
3. 覆盖岗位的主要工作领域，包括日常工作、项目工作、协作沟通等方面
4. 直接输出纯文本，每条一行，格式如：1. xxx
5. 根据岗位级别调整职责范围和深度"""},
            {"role": "user", "content": prompt}
        ]
        async for chunk in self.async_chat_stream(messages):
            yield chunk

    def generate_hard_requirements(self, jd_info: Dict[str, Any]) -> str:
        """生成任职资格-硬性条件"""
        prompt = self._build_prompt(jd_info, "任职资格-硬性条件")
        messages = [
            {"role": "system", "content": """你是一个专业的HR助手，擅长撰写职位描述(JD)。
请根据提供的岗位信息，生成硬性条件要求。

重要说明：
硬性条件是指该岗位必须满足的强制性要求，是筛选候选人的硬门槛。

要求：
1. 只列出必须满足的强制性条件
2. 通常包括：学历要求、专业要求、工作年限、必备技能、必要证书等
3. 每条要求要明确、可量化
4. 使用Markdown格式，每条要求用数字列表
5. 不要包含软技能、加分项等非强制性内容

示例：
1. 硕士及以上学历，人力资源管理、经济学、会计学等相关专业
2. 5年以上相关工作经验
3. 必须持有人力资源管理师证书
4. 熟练使用Excel、SPSS等数据分析工具"""},
            {"role": "user", "content": prompt}
        ]
        return self.chat(messages)

    def generate_hard_requirements_stream(self, jd_info: Dict[str, Any]):
        """生成任职资格-硬性条件（流式）"""
        prompt = self._build_prompt(jd_info, "任职资格-硬性条件")
        messages = [
            {"role": "system", "content": """你是一个专业的HR助手，擅长撰写职位描述(JD)。
请根据提供的岗位信息，生成硬性条件要求。

重要说明：
硬性条件是指该岗位必须满足的强制性要求，是筛选候选人的硬门槛。

要求：
1. 只列出必须满足的强制性条件
2. 通常包括：学历要求、专业要求、工作年限、必备技能、必要证书等
3. 每条要求要明确、可量化
4. 直接输出纯文本，每条一行，格式如：1. xxx
5. 不要包含软技能、加分项等非强制性内容

示例：
1. 硕士及以上学历，人力资源管理、经济学、会计学等相关专业
2. 5年以上相关工作经验
3. 必须持有人力资源管理师证书
4. 熟练使用Excel、SPSS等数据分析工具"""},
            {"role": "user", "content": prompt}
        ]
        yield from self.chat_stream(messages)

    async def async_generate_hard_requirements_stream(self, jd_info: Dict[str, Any]):
        """生成任职资格-硬性条件（异步流式）"""
        prompt = self._build_prompt(jd_info, "任职资格-硬性条件")
        messages = [
            {"role": "system", "content": """你是一个专业的HR助手，擅长撰写职位描述(JD)。
请根据提供的岗位信息，生成硬性条件要求。

重要说明：
硬性条件是指该岗位必须满足的强制性要求，是筛选候选人的硬门槛。

要求：
1. 只列出必须满足的强制性条件
2. 通常包括：学历要求、专业要求、工作年限、必备技能、必要证书等
3. 每条要求要明确、可量化
4. 直接输出纯文本，每条一行，格式如：1. xxx
5. 不要包含软技能、加分项等非强制性内容

示例：
1. 硕士及以上学历，人力资源管理、经济学、会计学等相关专业
2. 5年以上相关工作经验
3. 必须持有人力资源管理师证书
4. 熟练使用Excel、SPSS等数据分析工具"""},
            {"role": "user", "content": prompt}
        ]
        async for chunk in self.async_chat_stream(messages):
            yield chunk

    def generate_other_requirements(self, jd_info: Dict[str, Any]) -> str:
        """生成任职资格-其他要求"""
        prompt = self._build_prompt(jd_info, "任职资格-其他要求")
        messages = [
            {"role": "system", "content": """你是一个专业的HR助手，擅长撰写职位描述(JD)。
请根据提供的岗位信息，生成其他要求（任职资格的整体描述）。

重要说明：
其他要求是对任职资格的综合描述，包括软技能、个人素质、加分项等非强制性要求。

要求：
1. 描述候选人应具备的软技能和个人素质
2. 包括：沟通能力、团队协作、学习能力、抗压能力等
3. 可以包含加分项：如大型项目经验、行业经验、管理经验等
4. 使用Markdown格式，每条要求用数字列表
5. 内容要全面，体现岗位对综合素质的要求

示例：
1. 具备优秀的沟通能力和团队协作精神
2. 较强的学习能力和自驱力，对新知识保持好奇心
3. 工作积极主动，责任心强，能够承受工作压力
4. 有大型企业人力资源管理经验者优先
5. 有团队管理经验者优先"""},
            {"role": "user", "content": prompt}
        ]
        return self.chat(messages)

    def generate_other_requirements_stream(self, jd_info: Dict[str, Any]):
        """生成任职资格-其他要求（流式）"""
        prompt = self._build_prompt(jd_info, "任职资格-其他要求")
        messages = [
            {"role": "system", "content": """你是一个专业的HR助手，擅长撰写职位描述(JD)。
请根据提供的岗位信息，生成其他要求（任职资格的整体描述）。

重要说明：
其他要求是对任职资格的综合描述，包括软技能、个人素质、加分项等非强制性要求。

要求：
1. 描述候选人应具备的软技能和个人素质
2. 包括：沟通能力、团队协作、学习能力、抗压能力等
3. 可以包含加分项：如大型项目经验、行业经验、管理经验等
4. 直接输出纯文本，每条一行，格式如：1. xxx
5. 内容要全面，体现岗位对综合素质的要求

示例：
1. 具备优秀的沟通能力和团队协作精神
2. 较强的学习能力和自驱力，对新知识保持好奇心
3. 工作积极主动，责任心强，能够承受工作压力
4. 有大型企业人力资源管理经验者优先
5. 有团队管理经验者优先"""},
            {"role": "user", "content": prompt}
        ]
        yield from self.chat_stream(messages)

    async def async_generate_other_requirements_stream(self, jd_info: Dict[str, Any]):
        """生成任职资格-其他要求（异步流式）"""
        prompt = self._build_prompt(jd_info, "任职资格-其他要求")
        messages = [
            {"role": "system", "content": """你是一个专业的HR助手，擅长撰写职位描述(JD)。
请根据提供的岗位信息，生成其他要求（任职资格的整体描述）。

重要说明：
其他要求是对任职资格的综合描述，包括软技能、个人素质、加分项等非强制性要求。

要求：
1. 描述候选人应具备的软技能和个人素质
2. 包括：沟通能力、团队协作、学习能力、抗压能力等
3. 可以包含加分项：如大型项目经验、行业经验、管理经验等
4. 直接输出纯文本，每条一行，格式如：1. xxx
5. 内容要全面，体现岗位对综合素质的要求

示例：
1. 具备优秀的沟通能力和团队协作精神
2. 较强的学习能力和自驱力，对新知识保持好奇心
3. 工作积极主动，责任心强，能够承受工作压力
4. 有大型企业人力资源管理经验者优先
5. 有团队管理经验者优先"""},
            {"role": "user", "content": prompt}
        ]
        async for chunk in self.async_chat_stream(messages):
            yield chunk

    def _build_prompt(self, jd_info: Dict[str, Any], content_type: str) -> str:
        """构建提示词"""
        prompt = f"请根据以下岗位信息，生成{content_type}：\n\n"
        prompt += f"岗位名称：{jd_info.get('job_title', '未提供')}\n"

        if jd_info.get('industry'):
            prompt += f"所属行业：{jd_info['industry']}\n"
        if jd_info.get('job_level'):
            prompt += f"岗位级别：{jd_info['job_level']}\n"
        if jd_info.get('department'):
            prompt += f"所属部门：{jd_info['department']}\n"
        if jd_info.get('salary_range'):
            prompt += f"薪资范围：{jd_info['salary_range']}\n"
        if jd_info.get('headcount'):
            prompt += f"岗位人数：{jd_info['headcount']}\n"
        if jd_info.get('expected_onboard_date'):
            prompt += f"期望到岗时间：{jd_info['expected_onboard_date']}\n"

        # 如果已有其他内容，也加入上下文供参考
        if content_type == "岗位职责" and jd_info.get('job_responsibilities'):
            prompt += f"\n用户已填写的岗位职责（请在此基础上扩展和完善）：\n{jd_info['job_responsibilities']}\n"
        if content_type != "岗位职责" and jd_info.get('job_responsibilities'):
            prompt += f"\n岗位职责：\n{jd_info['job_responsibilities']}\n"
        if content_type == "任职资格-硬性条件" and jd_info.get('hard_requirements'):
            prompt += f"\n用户已填写的硬性条件（请在此基础上扩展和完善）：\n{jd_info['hard_requirements']}\n"
        if content_type == "任职资格-其他要求":
            if jd_info.get('hard_requirements'):
                prompt += f"\n任职资格-硬性条件：\n{jd_info['hard_requirements']}\n"
            if jd_info.get('other_requirements'):
                prompt += f"\n用户已填写的其他要求（请在此基础上扩展和完善）：\n{jd_info['other_requirements']}\n"

        prompt += f"\n请生成专业的{content_type}内容："
        return prompt


class HardRequirementsExtractionService(LLMService):
    """硬性条件提取服务"""

    def __init__(self):
        super().__init__(HARD_REQUIREMENTS_EXTRACTION_CONFIG)

    @staticmethod
    def _validate_requirements_result(result: Any) -> None:
        if not isinstance(result, dict):
            raise ValueError("硬性条件提取结果不是JSON对象")
        if "requirements" not in result or not isinstance(result.get("requirements"), list):
            raise ValueError("硬性条件提取结果缺少requirements数组")

    def extract_hard_requirements(self, hard_requirements_text: str) -> Dict[str, Any]:
        """从硬性条件文本中提取结构化的硬性条件（返回JSON）"""
        prompt = self._build_extraction_prompt(hard_requirements_text)
        messages = [
            {"role": "system", "content": """你是一个专业的HR助手，擅长从职位描述中提取关键的硬性条件。
请从提供的任职资格-硬性条件文本中提取结构化的硬性条件信息。

你必须返回一个JSON对象，格式如下：
{
  "requirements": [
    {"category": "学历要求", "content": "本科及以上学历"},
    {"category": "专业要求", "content": "计算机相关专业"},
    {"category": "工作经验", "content": "5年以上Python开发经验"},
    {"category": "技能要求", "content": "熟悉深度学习框架"}
  ]
}

注意：
1. 只返回JSON，不要包含任何其他文字说明
2. category字段应该是：学历要求、专业要求、工作经验、技能要求、证书要求等
3. 如果某个类别没有要求，就不要包含在数组中"""},
            {"role": "user", "content": prompt}
        ]

        return self.chat_json(messages, validator=self._validate_requirements_result)

    async def async_extract_hard_requirements(self, hard_requirements_text: str) -> Dict[str, Any]:
        """从硬性条件文本中提取结构化的硬性条件（异步版本）"""
        prompt = self._build_extraction_prompt(hard_requirements_text)
        messages = [
            {"role": "system", "content": """你是一个专业的HR助手，擅长从职位描述中提取关键的硬性条件。
请从提供的任职资格-硬性条件文本中提取结构化的硬性条件信息。

你必须返回一个JSON对象，格式如下：
{
  "requirements": [
    {"category": "学历要求", "content": "本科及以上学历"},
    {"category": "专业要求", "content": "计算机相关专业"},
    {"category": "工作经验", "content": "5年以上Python开发经验"},
    {"category": "技能要求", "content": "熟悉深度学习框架"}
  ]
}

注意：
1. 只返回JSON，不要包含任何其他文字说明
2. category字段应该是：学历要求、专业要求、工作经验、技能要求、证书要求等
3. 如果某个类别没有要求，就不要包含在数组中"""},
            {"role": "user", "content": prompt}
        ]

        return await self.async_chat_json(messages, validator=self._validate_requirements_result)

    def _build_extraction_prompt(self, hard_requirements_text: str) -> str:
        """构建提取提示词"""
        prompt = "请从以下任职资格-硬性条件中提取结构化信息：\n\n"
        prompt += f"{hard_requirements_text}\n\n"
        prompt += "请以JSON格式返回提取的硬性条件。"
        return prompt
