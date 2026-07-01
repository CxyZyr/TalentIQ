"""
主应用文件 - FastAPI应用入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from dotenv import load_dotenv

# 加载 .env 环境变量（密钥等敏感配置）
load_dotenv()

from routers.jd_router import router as jd_router
from routers.auth_router import router as auth_router
from routers.candidate_router import router as candidate_router
from routers.interview_router import router as interview_router
from routers.todo_router import router as todo_router
from routers.stage_flow_router import router as stage_flow_router
from routers.interview_evaluation_router import router as interview_evaluation_router
from routers.salary_negotiation_router import router as salary_negotiation_router
from routers.candidate_ext_router import router as candidate_ext_router
from routers.recruitment_log_router import router as recruitment_log_router
from routers.statistics_router import router as statistics_router
from routers.talent_pool_router import router as talent_pool_router
from routers.user_router import router as user_router
from routers.department_router import router as department_router
from db.database import init_db

# 创建FastAPI应用
app = FastAPI(
    title="GCL HR SaaS - 智能招聘系统",
    description="智能招聘系统API，包含智能JD模块等功能",
    version="1.0.0"
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应该配置具体的域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件目录（用于访问上传的简历等文件）
uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
if os.path.exists(uploads_dir):
    app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# 注册路由
app.include_router(auth_router)
app.include_router(jd_router)
app.include_router(candidate_router)
app.include_router(interview_router)
app.include_router(todo_router)
app.include_router(stage_flow_router)
app.include_router(interview_evaluation_router)
app.include_router(salary_negotiation_router)
app.include_router(candidate_ext_router)
app.include_router(recruitment_log_router)
app.include_router(statistics_router)
app.include_router(talent_pool_router)
app.include_router(user_router)
app.include_router(department_router)


@app.on_event("startup")
async def startup_event():
    """应用启动时初始化数据库和定时任务"""
    print("正在初始化数据库...")
    init_db()
    print("数据库初始化完成！")

    # 执行部门表迁移
    from db.migrate_departments import run_migration
    run_migration()

    # 启动超时催办定时任务
    from services.scheduler_service import start_scheduler
    start_scheduler()


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时停止定时任务"""
    from services.scheduler_service import stop_scheduler
    stop_scheduler()


@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "欢迎使用GCL HR SaaS智能招聘系统",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """健康检查接口"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7586)
