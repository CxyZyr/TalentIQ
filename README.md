# TalentIQ · 智能招聘系统

> **Smarter hiring, powered by AI** —— 以 AI 智识人才

TalentIQ 是一套将 AI 深度融入招聘全流程的智能招聘管理平台：从 AI 辅助撰写 JD、简历智能解析与评分、AI 面试记录与评价，到招聘漏斗与候选人画像的数据洞察，帮助 HR 更高效、更精准地识别与推进人才。

## ✨ 核心功能

- **智能 JD**：AI 辅助生成岗位职责与任职资格，自动提取硬性条件
- **简历智能筛选**：批量上传、AI 解析、按岗位规则智能评分与硬性条件匹配
- **招聘流程管理**：简历筛选 → 一面 → 二面 → 三面 → 谈薪&背调 全流程流转，自动生成待办
- **AI 面试助手**：面试录音转写、AI 多维度评价、面试问题生成
- **数据分析**：招聘漏斗、转化率、职位进展，以及候选人画像（AI 得分 / 学历 / 院校层次 / 人口结构 / 新增趋势 / 职位排行等）
- **人才储备**：候选人入库沉淀与重启招聘
- **待办与催办**：流程流转自动建待办，邮件通知 + 超时催办

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 后端 | FastAPI · SQLAlchemy · SQLite · APScheduler · python-jose |
| 前端 | React 18 · TypeScript · Tailwind CSS · Recharts · Zustand |
| AI | OpenAI 兼容接口（默认对接 DeepSeek） |

## 🚀 快速开始

### 环境要求
- Python 3.10+（推荐 3.12）
- Node.js 16+

### 1. 配置密钥
复制配置模板并填入你自己的密钥：
```bash
cp config/llm_config.example.py   config/llm_config.py      # 填入 LLM API Key
cp config/email_config.example.py config/email_config.py    # 填入 SMTP（可选，用于邮件通知）
```

### 2. 启动后端（端口 7586）
```bash
pip install -r requirements.txt
python main.py
```
首次启动会自动创建 SQLite 数据库表。

### 3. 启动前端（端口 7587）
```bash
cd frontend-react
npm install
PORT=7587 npm start
```
前端通过 `setupProxy.js` 自动将 API 代理到后端 7586 端口。

### 4. 初始化基础数据（可选）
```bash
cp db/init_users.example.py db/init_users.py   # 复制账号模板，按需修改
python db/init_users.py     # 初始账号
python db/init_data.py      # 简历 / 面试评分规则
python db/init_schools.py   # 985 / 211 / 双一流院校数据
```

## 📁 项目结构

```
config/            配置（LLM、邮件）—— 使用 *.example.py 模板生成
db/                数据模型与初始化脚本
services/          业务逻辑层
routers/           API 接口层
utils/             工具（认证、简历解析、LLM 调用）
main.py            后端入口（FastAPI + Uvicorn）
requirements.txt   Python 依赖
frontend-react/    React 前端
```

## 🔐 角色权限

| 角色 | 权限 |
|---|---|
| HR | 招聘全流程管理 |
| 面试官 | 查看分配的候选人、填写面试评价 |
| CEO | 查看全部数据与报表 |

## 📝 说明

- 数据库默认使用 SQLite，首次启动自动建表；真实数据不随仓库分发。
- LLM / 邮件密钥请通过 `config/*.example.py` 自行配置，切勿提交真实密钥。

## 📄 License

仅供学习与研究使用。
