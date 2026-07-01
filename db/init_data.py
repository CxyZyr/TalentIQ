"""
数据库初始化脚本 - 导入评分规则
"""
import pandas as pd
import re
from sqlalchemy.orm import Session
from db.database import SessionLocal, init_db
from db.models import InterviewEvaluationRule, ResumeEvaluationRule, EvaluationRuleSet


def parse_score_range(score_range_str):
    """
    解析分数范围字符串，返回(min, max)元组

    支持的格式：
    - "5分" -> (5, 5)
    - "2-4分" -> (2, 4)
    - "8~10分" -> (8, 10)
    - "1~3分" -> (1, 3)
    - "12~15 分" -> (12, 15)
    - "0 分" -> (0, 0)
    """
    if not score_range_str or pd.isna(score_range_str) or score_range_str == '/':
        return None, None

    # 移除空格
    score_range_str = str(score_range_str).replace(' ', '').replace('　', '')

    # 提取所有数字
    numbers = re.findall(r'\d+(?:\.\d+)?', score_range_str)

    if not numbers:
        return None, None

    if len(numbers) == 1:
        # 单个分数，如"5分"
        score = float(numbers[0])
        return score, score
    elif len(numbers) >= 2:
        # 范围分数，如"2-4分"或"8~10分"
        min_score = float(numbers[0])
        max_score = float(numbers[1])
        return min_score, max_score

    return None, None


def load_resume_evaluation_rules(db: Session, rule_set_id: int):
    """加载简历评分规则"""
    print("正在加载简历评分规则...")

    # 读取Excel文件
    df = pd.read_excel("excel/通用简历评价标准.xlsx")

    current_dimension = None
    current_indicator = None
    current_total_score = None
    current_is_bonus = False

    for _, row in df.iterrows():
        # 跳过性别和年龄（不参与打分）
        if pd.notna(row['维度']) and row['维度'] in ['性别', '年龄']:
            continue

        # 跳过总分行
        if pd.notna(row['维度']) and row['维度'] == '总分':
            continue

        # 更新维度
        if pd.notna(row['维度']) and row['维度'].strip():
            current_dimension = row['维度'].strip()

        # 更新指标名称和总分
        if pd.notna(row['指标名称']) and row['指标名称'].strip():
            current_indicator = row['指标名称'].strip()
            if pd.notna(row['总分']):
                current_total_score = float(row['总分'])

            # 读取是否为加分项
            if pd.notna(row['是否加分项']):
                is_bonus_str = str(row['是否加分项']).strip()
                current_is_bonus = is_bonus_str == '是'

        # 处理评分标准
        if pd.notna(row['评分标准（等级 / 描述）']):
            description = str(row['评分标准（等级 / 描述）']).strip()
            score_range_str = str(row['分数范围']).strip() if pd.notna(row['分数范围']) else None
            notes = str(row['备注']).strip() if pd.notna(row['备注']) else None

            # 解析分数范围
            score_min, score_max = parse_score_range(score_range_str)

            rule = ResumeEvaluationRule(
                rule_set_id=rule_set_id,
                dimension=current_dimension,
                indicator_name=current_indicator,
                total_score=current_total_score,
                is_bonus=current_is_bonus,
                level=None,  # 简历评分标准没有明确的等级字段
                description=description,
                score_range=score_range_str,
                score_min=score_min,
                score_max=score_max,
                notes=notes
            )
            db.add(rule)

    db.commit()

    # 统计导入的数据
    count = db.query(ResumeEvaluationRule).filter(
        ResumeEvaluationRule.rule_set_id == rule_set_id
    ).count()
    print(f"简历评分规则加载完成！共导入 {count} 条记录")


def load_interview_evaluation_rules(db: Session, rule_set_id: int):
    """加载面试评分规则"""
    print("正在加载面试评分规则...")

    # 读取Excel文件
    df = pd.read_excel("excel/通用面试评价标准.xlsx")

    current_dimension = None
    current_indicator = None
    current_total_score = None

    for _, row in df.iterrows():
        # 更新维度
        if pd.notna(row['维度']) and row['维度'].strip():
            current_dimension = row['维度'].strip()

        # 更新指标名称和总分
        if pd.notna(row['指标名称']) and row['指标名称'].strip():
            current_indicator = row['指标名称'].strip()
            if pd.notna(row['总分']):
                current_total_score = float(row['总分'])

        # 处理评分标准
        if pd.notna(row['评分标准（等级 / 描述）']):
            description = str(row['评分标准（等级 / 描述）']).strip()
            score_range_str = str(row['分数范围']).strip() if pd.notna(row['分数范围']) else None

            # 判断是否为加分项
            is_bonus = current_dimension == "加分项" if current_dimension else False

            # 解析分数范围
            score_min, score_max = parse_score_range(score_range_str)

            # 提取等级信息
            level = None
            if description.startswith('等级'):
                level_parts = description.split('：')
                if len(level_parts) > 0:
                    level = level_parts[0].strip()

            rule = InterviewEvaluationRule(
                rule_set_id=rule_set_id,
                dimension=current_dimension,
                indicator_name=current_indicator,
                total_score=current_total_score,
                level=level,
                description=description,
                score_range=score_range_str,
                score_min=score_min,
                score_max=score_max,
                is_bonus=is_bonus
            )
            db.add(rule)

    db.commit()

    # 统计导入的数据
    count = db.query(InterviewEvaluationRule).filter(
        InterviewEvaluationRule.rule_set_id == rule_set_id
    ).count()
    print(f"面试评分规则加载完成！共导入 {count} 条记录")


def initialize_database():
    """初始化数据库"""
    print("开始初始化数据库...")

    # 创建所有表
    init_db()
    print("数据库表创建完成！")

    # 创建数据库会话
    db = SessionLocal()

    try:
        # 检查是否已经存在评分规则集
        existing_resume_rule_set = db.query(EvaluationRuleSet).filter(
            EvaluationRuleSet.name == "通用简历评价标准"
        ).first()

        existing_interview_rule_set = db.query(EvaluationRuleSet).filter(
            EvaluationRuleSet.name == "通用面试评价标准"
        ).first()

        # 创建简历评分规则集并加载规则
        if not existing_resume_rule_set:
            resume_rule_set = EvaluationRuleSet(
                name="通用简历评价标准",
                type="resume",
                description="通用简历评分规则，适用于所有岗位",
                is_active=True
            )
            db.add(resume_rule_set)
            db.commit()
            db.refresh(resume_rule_set)
            print(f"创建简历评分规则集：{resume_rule_set.name}，ID：{resume_rule_set.id}")

            # 加载简历评分规则
            load_resume_evaluation_rules(db, resume_rule_set.id)
        else:
            print(f"简历评分规则集已存在（ID：{existing_resume_rule_set.id}），跳过创建")

        # 创建面试评分规则集并加载规则
        if not existing_interview_rule_set:
            interview_rule_set = EvaluationRuleSet(
                name="通用面试评价标准",
                type="interview",
                description="通用面试评分规则，适用于所有岗位",
                is_active=True
            )
            db.add(interview_rule_set)
            db.commit()
            db.refresh(interview_rule_set)
            print(f"创建面试评分规则集：{interview_rule_set.name}，ID：{interview_rule_set.id}")

            # 加载面试评分规则
            load_interview_evaluation_rules(db, interview_rule_set.id)
        else:
            print(f"面试评分规则集已存在（ID：{existing_interview_rule_set.id}），跳过创建")

        print("数据库初始化完成！")

    except Exception as e:
        print(f"初始化过程中出现错误: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    initialize_database()
