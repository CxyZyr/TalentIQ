"""
学校数据初始化脚本 - 导入985/211/双一流学校数据
"""
import pandas as pd
from sqlalchemy.orm import Session
from db.database import SessionLocal, init_db
from db.models import School


def load_schools(db: Session):
    """加载学校数据"""
    print("正在加载学校数据...")

    # 读取Excel文件
    df = pd.read_excel("excel/双一流-985-211.xlsx")

    for _, row in df.iterrows():
        # 获取学校名称
        school_name = str(row['双一流（147所）']).strip()

        # 判断是否985
        is_985 = str(row['985（39所）']).strip() == '是'

        # 判断是否211
        is_211 = str(row['211(115所)']).strip() == '是'

        # 获取双一流建设学科
        disciplines = str(row['双一流建设学科']).strip() if pd.notna(row['双一流建设学科']) else ''

        # 创建学校记录
        school = School(
            name=school_name,
            is_double_first_class=True,  # 所有学校都是双一流
            is_985=is_985,
            is_211=is_211,
            disciplines=disciplines
        )
        db.add(school)

    db.commit()

    # 统计导入的数据
    count = db.query(School).count()
    count_985 = db.query(School).filter(School.is_985 == True).count()
    count_211 = db.query(School).filter(School.is_211 == True).count()

    print(f"学校数据加载完成！")
    print(f"  - 共导入 {count} 所双一流学校")
    print(f"  - 其中985学校 {count_985} 所")
    print(f"  - 其中211学校 {count_211} 所")


def initialize_schools():
    """初始化学校数据"""
    print("开始初始化学校数据...")

    # 创建所有表
    init_db()
    print("数据库表创建完成！")

    # 创建数据库会话
    db = SessionLocal()

    try:
        # 检查是否已经导入过数据
        existing_schools = db.query(School).count()

        if existing_schools == 0:
            load_schools(db)
        else:
            print(f"学校数据已存在（{existing_schools}所），跳过导入")

        print("学校数据初始化完成！")

    except Exception as e:
        print(f"初始化过程中出现错误: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    initialize_schools()
