"""
候选人AI分析服务
"""
from typing import Dict, Any
import json
import re
from utils.llm_service import LLMService
from config.llm_config import HARD_REQUIREMENTS_EXTRACTION_CONFIG, AI_SCORE_CONFIG


class CandidateAnalysisService:
    """候选人分析服务基类"""

    def __init__(self):
        """初始化候选人分析服务"""
        self.llm_service = LLMService(HARD_REQUIREMENTS_EXTRACTION_CONFIG)

    def _parse_json_response(self, response: str) -> Dict[str, Any]:
        """解析JSON响应，处理可能的格式问题"""
        # 去除可能的markdown代码块标记
        cleaned = response.strip()

        # 移除 ```json 和 ``` 标记
        if cleaned.startswith('```json'):
            cleaned = cleaned[7:]
        elif cleaned.startswith('```'):
            cleaned = cleaned[3:]

        if cleaned.endswith('```'):
            cleaned = cleaned[:-3]

        # 去除首尾空白
        cleaned = cleaned.strip()

        # 尝试解析JSON
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            # 如果解析失败，尝试更激进的清理
            # 移除可能的注释
            cleaned = re.sub(r'//.*?\n', '\n', cleaned)
            cleaned = re.sub(r'/\*.*?\*/', '', cleaned, flags=re.DOTALL)

            # 再次尝试解析
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                # 如果还是失败，返回错误信息
                return {
                    "parse_error": str(e),
                    "raw_response": response
                }

    def _validate_basic_info_result(self, result: Dict[str, Any]) -> None:
        if not isinstance(result, dict):
            raise ValueError("基础信息结果不是JSON对象")
        required_keys = [
            "name", "gender", "age", "work_status", "work_years",
            "expected_salary", "highest_education", "school"
        ]
        missing_keys = [key for key in required_keys if key not in result]
        if missing_keys:
            raise ValueError(f"基础信息缺少字段: {', '.join(missing_keys)}")

    def _validate_hard_requirements_result(self, result: Dict[str, Any]) -> None:
        if not isinstance(result, dict):
            raise ValueError("硬性条件结果不是JSON对象")
        if "assessments" not in result or not isinstance(result.get("assessments"), list):
            raise ValueError("硬性条件缺少assessments数组")
        if "overall_passed" not in result:
            raise ValueError("硬性条件缺少overall_passed字段")

    def _normalize_hard_requirements_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """按单项结果重算整体结果，避免 LLM 返回自相矛盾的数据。"""
        assessments = result.get("assessments")
        if not isinstance(assessments, list):
            return result

        normalized_assessments = []
        for item in assessments:
            if not isinstance(item, dict):
                continue
            normalized_item = dict(item)
            normalized_item["passed"] = bool(normalized_item.get("passed"))
            normalized_assessments.append(normalized_item)

        result["assessments"] = normalized_assessments
        result["overall_passed"] = (
            all(item["passed"] for item in normalized_assessments)
            if normalized_assessments
            else bool(result.get("overall_passed", True))
        )
        return result

    def _validate_score_result(self, result: Dict[str, Any]) -> None:
        if not isinstance(result, dict):
            raise ValueError("评分结果不是JSON对象")
        if "dimensions" not in result or not isinstance(result.get("dimensions"), list):
            raise ValueError("评分结果缺少dimensions数组")


class BasicInfoExtractionService(CandidateAnalysisService):
    """基础信息提取服务"""

    def extract_basic_info(self, resume_text: str) -> Dict[str, Any]:
        """
        从简历文本中提取基础信息

        Args:
            resume_text: 简历文本

        Returns:
            基础信息JSON
        """
        prompt = f"""请从以下简历中提取候选人的基础信息：

{resume_text}

请以JSON格式返回以下信息：
{{
  "name": "候选人姓名",
  "gender": "性别（男/女）",
  "age": 年龄（数字），
  "work_status": "工作状态（求职中/离职/在职）",
  "work_years": 工作年限（数字），
  "expected_salary": "期望薪资",
  "highest_education": "最高学历（如：本科、硕士、博士）",
  "school": "学校名称（最高学历对应的）"
}}

注意：
1. 只返回JSON，不要包含任何其他文字说明
2. 如果某个字段无法从简历中提取，请填写null
3. 年龄和工作年限必须是数字类型"""

        messages = [
            {"role": "system", "content": "你是一个专业的HR助手，擅长从简历中提取关键信息。"},
            {"role": "user", "content": prompt}
        ]

        return self.llm_service.chat_json(
            messages,
            validator=self._validate_basic_info_result
        )


class SummaryExtractionService(CandidateAnalysisService):
    """基本概况提取服务"""

    def extract_summary(self, resume_text: str, jd_info: Dict[str, Any]) -> str:
        """
        提取与岗位相关的技能基本概况

        Args:
            resume_text: 简历文本
            jd_info: JD信息（包含岗位名称、职责、要求等）

        Returns:
            基本概况文本（300字以内）
        """
        prompt = f"""请根据以下岗位信息和候选人简历，提取候选人与该岗位相关的技能基本概况。

岗位信息：
- 岗位名称：{jd_info.get('job_title', '')}
- 岗位职责：{jd_info.get('job_responsibilities', '')}
- 任职要求：{jd_info.get('hard_requirements', '')}

候选人简历：
{resume_text}

请用300字以内的一段连贯文字，总结候选人与该岗位相关的技能、经验和优势，涵盖相关技术栈和工具、项目经验、工作经历及突出优势。

注意：只返回一段纯文本概况，不要使用任何markdown格式（不要用标题、编号、列表、加粗等），不要包含其他说明。"""

        messages = [
            {"role": "system", "content": "你是一个专业的HR助手，擅长分析候选人与岗位的匹配度。"},
            {"role": "user", "content": prompt}
        ]

        return self.llm_service.chat(messages)


class HardRequirementsAssessmentService(CandidateAnalysisService):
    """硬性条件评估服务"""

    def assess_hard_requirements(
        self,
        resume_text: str,
        hard_requirements: Any
    ) -> Dict[str, Any]:
        """
        评估候选人是否满足硬性条件

        Args:
            resume_text: 简历文本
            hard_requirements: 硬性条件（可以是字符串或JSON）

        Returns:
            评估结果JSON
        """
        # 处理硬性条件：支持字符串和字典两种格式
        if isinstance(hard_requirements, str):
            # 如果是字符串，直接使用
            requirements_text = hard_requirements
        elif isinstance(hard_requirements, dict):
            # 如果是字典，构建硬性条件列表
            requirements_list = hard_requirements.get('requirements', [])
            requirements_text = "\n".join([
                f"{i+1}. {req['category']}: {req['content']}"
                for i, req in enumerate(requirements_list)
            ])
        else:
            # 如果为空或其他类型，返回空评估
            return {
                "assessments": [],
                "overall_passed": True
            }

        prompt = f"""请评估候选人简历是否满足以下硬性条件：

硬性条件：
{requirements_text}

候选人简历：
{resume_text}

请以JSON格式返回评估结果：
{{
  "assessments": [
    {{
      "category": "硬性条件类别",
      "content": "硬性条件内容",
      "passed": true/false,
      "reason": "评估理由（说明为什么通过或不通过）"
    }}
  ],
  "overall_passed": true/false
}}

注意：
1. 只返回JSON，不要包含任何其他文字说明
2. overall_passed字段：只要有一条硬性条件不通过，该字段就为false
3. 评估要严格，必须在简历中找到明确证据才能判定为通过"""

        messages = [
            {"role": "system", "content": "你是一个专业的HR助手，擅长评估候选人是否满足岗位要求。"},
            {"role": "user", "content": prompt}
        ]

        result = self.llm_service.chat_json(
            messages,
            validator=self._validate_hard_requirements_result
        )
        return self._normalize_hard_requirements_result(result)


class AIScoreService(CandidateAnalysisService):
    """AI智能评分服务"""

    def __init__(self):
        """初始化AI评分服务，使用专门的评分配置"""
        self.llm_service = LLMService(AI_SCORE_CONFIG)

    def score_resume(
        self,
        resume_text: str,
        evaluation_rules: list
    ) -> Dict[str, Any]:
        """
        根据评分规则对简历进行智能评分

        Args:
            resume_text: 简历文本
            evaluation_rules: 评分规则列表

        Returns:
            评分结果JSON（包含维度层级和得分率）
        """
        # 构建评分规则的系统提示词
        rules_prompt = self._build_rules_prompt(evaluation_rules)

        prompt = f"""请根据以下评分标准对候选人简历进行评分：

{rules_prompt}

候选人简历：
{resume_text}

请以JSON格式返回评分结果，必须包含所有维度和指标：
{{
  "dimensions": [
    {{
      "dimension_name": "维度名称",
      "is_bonus": false,
      "indicators": [
        {{
          "indicator_name": "指标名称",
          "actual_score": 实际得分（数字）,
          "reason": "评分理由",
          "evidence": "简历中的原文证据"
        }}
      ]
    }}
  ]
}}

重要说明：
1. 只返回JSON，不要包含任何其他文字说明
2. 必须包含所有维度和指标，即使简历中没有相关信息也要返回（得0分）
3. actual_score必须在该指标的分数范围内
4. 如果简历中没有相关信息，该指标得0分，reason写"简历中未找到相关信息"
5. 必须提供评分理由和简历原文证据（如果有的话）
6. 按照评分标准中的维度顺序返回"""

        messages = [
            {"role": "system", "content": "你是一个专业的HR助手，擅长根据评分标准对候选人进行客观评分。"},
            {"role": "user", "content": prompt}
        ]

        result = self.llm_service.chat_json(
            messages,
            validator=self._validate_score_result
        )

        # 使用新版本的评分处理逻辑，计算维度得分和得分率
        return self._process_score_result_v2(result, evaluation_rules)

    def _build_rules_prompt(self, evaluation_rules: list) -> str:
        """构建评分规则提示词"""
        rules_by_dimension = {}

        # 按维度分组
        for rule in evaluation_rules:
            dimension = rule.dimension
            if dimension not in rules_by_dimension:
                rules_by_dimension[dimension] = []
            rules_by_dimension[dimension].append(rule)

        # 构建提示词
        prompt_parts = []
        for dimension, rules in rules_by_dimension.items():
            prompt_parts.append(f"\n【{dimension}】")

            # 按指标分组
            indicators = {}
            for rule in rules:
                indicator = rule.indicator_name
                if indicator not in indicators:
                    indicators[indicator] = {
                        'total_score': rule.total_score,
                        'is_bonus': rule.is_bonus,
                        'levels': []
                    }
                indicators[indicator]['levels'].append({
                    'level': rule.level,
                    'description': rule.description,
                    'score_min': rule.score_min,
                    'score_max': rule.score_max
                })

            # 输出每个指标
            for indicator_name, indicator_data in indicators.items():
                is_bonus_text = "（加分项）" if indicator_data['is_bonus'] else ""
                prompt_parts.append(f"\n{indicator_name}{is_bonus_text}（总分：{indicator_data['total_score']}分）")

                for level in indicator_data['levels']:
                    score_range = f"{level['score_min']}-{level['score_max']}分" if level['score_min'] != level['score_max'] else f"{level['score_min']}分"
                    prompt_parts.append(f"  - {level['level']}（{score_range}）：{level['description']}")

        return "\n".join(prompt_parts)

    def _process_score_result(
        self,
        result: Dict[str, Any],
        evaluation_rules: list
    ) -> Dict[str, Any]:
        """处理评分结果，补充缺失项并计算总分"""
        if 'parse_error' in result:
            return result

        scores = result.get('scores', [])

        # 创建所有指标的映射
        all_indicators = {}
        for rule in evaluation_rules:
            key = f"{rule.dimension}_{rule.indicator_name}"
            if key not in all_indicators:
                all_indicators[key] = {
                    'dimension': rule.dimension,
                    'indicator_name': rule.indicator_name,
                    'total_score': rule.total_score,
                    'is_bonus': rule.is_bonus
                }

        # 检查缺失的指标，补充为0分
        scored_indicators = {f"{s['dimension']}_{s['indicator_name']}" for s in scores}
        for key, indicator in all_indicators.items():
            if key not in scored_indicators:
                scores.append({
                    'dimension': indicator['dimension'],
                    'indicator_name': indicator['indicator_name'],
                    'total_score': indicator['total_score'],
                    'actual_score': 0,
                    'reason': '简历中未找到相关信息',
                    'evidence': '',
                    'is_bonus': indicator['is_bonus']
                })

        # 计算总分
        main_score = sum(s['actual_score'] for s in scores if not s.get('is_bonus', False))
        bonus_score = sum(s['actual_score'] for s in scores if s.get('is_bonus', False))
        total_score = main_score + bonus_score

        return {
            'scores': scores,
            'main_score': main_score,
            'bonus_score': bonus_score,
            'total_score': total_score
        }

    def _process_score_result_v2(
        self,
        result: Dict[str, Any],
        evaluation_rules: list
    ) -> Dict[str, Any]:
        """
        处理评分结果（新版本），计算维度得分、总分和得分率

        返回结构包含：
        - dimensions: 维度列表（每个维度包含指标列表和维度得分率）
        - main_score/main_total_score/main_score_rate: 主要分相关
        - bonus_score/bonus_total_score/bonus_score_rate: 加分项相关
        - total_score/total_possible_score/overall_score_rate: 总分相关
        """
        if 'parse_error' in result:
            return result

        # 1. 构建评分规则的完整结构（按维度→指标组织）
        dimension_structure = {}
        for rule in evaluation_rules:
            dim_name = rule.dimension
            ind_name = rule.indicator_name

            if dim_name not in dimension_structure:
                dimension_structure[dim_name] = {
                    'is_bonus': rule.is_bonus,
                    'indicators': {}
                }

            if ind_name not in dimension_structure[dim_name]['indicators']:
                dimension_structure[dim_name]['indicators'][ind_name] = {
                    'total_score': rule.total_score,
                    'actual_score': 0,
                    'reason': '简历中未找到相关信息',
                    'evidence': ''
                }

        # 2. 填充AI返回的评分结果
        ai_dimensions = result.get('dimensions', [])
        for ai_dim in ai_dimensions:
            dim_name = ai_dim.get('dimension_name', '')
            if dim_name not in dimension_structure:
                continue

            for ai_ind in ai_dim.get('indicators', []):
                ind_name = ai_ind.get('indicator_name', '')
                if ind_name in dimension_structure[dim_name]['indicators']:
                    dimension_structure[dim_name]['indicators'][ind_name].update({
                        'actual_score': ai_ind.get('actual_score', 0),
                        'reason': ai_ind.get('reason', '简历中未找到相关信息'),
                        'evidence': ai_ind.get('evidence', '')
                    })

        # 3. 计算每个指标的得分率，并组织成输出结构
        output_dimensions = []
        main_score = 0
        main_total_score = 0
        bonus_score = 0
        bonus_total_score = 0

        for dim_name, dim_data in dimension_structure.items():
            dimension_actual_score = 0
            dimension_total_score = 0
            indicators_output = []

            for ind_name, ind_data in dim_data['indicators'].items():
                total = ind_data['total_score']
                actual = ind_data['actual_score']
                score_rate = round(actual / total, 4) if total > 0 else 0

                indicators_output.append({
                    'indicator_name': ind_name,
                    'total_score': total,
                    'actual_score': actual,
                    'score_rate': score_rate,
                    'reason': ind_data['reason'],
                    'evidence': ind_data['evidence']
                })

                dimension_actual_score += actual
                dimension_total_score += total

            # 计算维度得分率
            dimension_score_rate = round(dimension_actual_score / dimension_total_score, 4) if dimension_total_score > 0 else 0

            output_dimensions.append({
                'dimension_name': dim_name,
                'is_bonus': dim_data['is_bonus'],
                'indicators': indicators_output,
                'dimension_total_score': dimension_total_score,
                'dimension_actual_score': dimension_actual_score,
                'dimension_score_rate': dimension_score_rate
            })

            # 累加到主要分或加分项
            if dim_data['is_bonus']:
                bonus_score += dimension_actual_score
                bonus_total_score += dimension_total_score
            else:
                main_score += dimension_actual_score
                main_total_score += dimension_total_score

        # 4. 计算总分和得分率
        total_score = main_score + bonus_score
        total_possible_score = main_total_score + bonus_total_score

        main_score_rate = round(main_score / main_total_score, 4) if main_total_score > 0 else 0
        bonus_score_rate = round(bonus_score / bonus_total_score, 4) if bonus_total_score > 0 else 0
        overall_score_rate = round(total_score / total_possible_score, 4) if total_possible_score > 0 else 0

        return {
            'dimensions': output_dimensions,
            'main_score': main_score,
            'main_total_score': main_total_score,
            'main_score_rate': main_score_rate,
            'bonus_score': bonus_score,
            'bonus_total_score': bonus_total_score,
            'bonus_score_rate': bonus_score_rate,
            'total_score': total_score,
            'total_possible_score': total_possible_score,
            'overall_score_rate': overall_score_rate
        }
