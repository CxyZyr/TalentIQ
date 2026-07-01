import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, ChevronRight, CheckCircle, Loader2, Maximize2, Minimize2, X } from 'lucide-react';
import { useUserStore } from '../stores/userStore';
import {
  getCandidateCompleteInfo,
  updateCandidateResume,
  getInterviewQA,
  getUserList,
  UserInfo,
} from '../api/candidate';
import { processResumeScreening, ResumeScreeningData } from '../api/stageFlow';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
} from '../components/ui/sheet';
import { Badge } from '../components/ui/badge';
import { Gauge } from '../components/ui/gauge';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { SearchableSelect } from '../components/ui/searchable-select';

// 类型定义（与CandidateDetailPage一致）
interface BasicInfo {
  id?: number;
  name?: string;
  gender?: string;
  age?: number;
  work_status?: string;
  work_years?: number;
  expected_salary?: string;
  highest_education?: string;
  school?: string;
  is_985?: boolean;
  is_211?: boolean;
  is_double_first_class?: boolean;
  current_stage?: string;
  resume_file_path?: string;
  created_at?: string;
  privacy_info?: string;
}

interface AIScore {
  ai_score_total?: number;
  ai_score_main?: number;
  ai_score_bonus?: number;
  main_score_max?: number;
  bonus_score_max?: number;
  total_score_max?: number;
  ai_score_detail?: string | object;
  hard_requirements_assessment?: string | object;
}

interface HardReqAssessment {
  category: string;
  content: string;
  passed: boolean;
  reason: string;
}

interface HardRequirements {
  overall_passed: boolean;
  assessments: HardReqAssessment[];
}

interface Indicator {
  indicator_name: string;
  actual_score: number;
  total_score: number;
  reason: string;
  evidence?: string;
}

interface Dimension {
  dimension_name: string;
  dimension_actual_score: number;
  dimension_total_score: number;
  indicators: Indicator[];
}

interface AIScoreDetail {
  dimensions: Dimension[];
}

interface ResumeScreening {
  负责人?: string;
  状态?: string;
  完成时间?: string;
  原因?: string;
}

interface Interview {
  轮次: string;
  负责人?: string;
  状态?: string;
  总分?: number;
  面试评价?: string;
  has_qa?: boolean;
  面试时间?: string;
  评价时间?: string;
  ai_interview_score_total?: number;
  ai_interview_score_main?: number;
  ai_interview_score_bonus?: number;
  ai_interview_evaluation?: AIInterviewEvaluation;
}

interface AIInterviewIndicator {
  indicator_name: string;
  actual_score: number;
  total_score: number;
  reason: string;
  evidence?: string;
}

interface AIInterviewDimension {
  dimension_name: string;
  dimension_actual_score: number;
  dimension_total_score: number;
  indicators: AIInterviewIndicator[];
}

interface AIInterviewEvaluation {
  dimensions?: AIInterviewDimension[];
}

interface SalaryNegotiation {
  负责人?: string;
  谈薪状态?: string;
  背调状态?: string;
  背调报告?: string;
  OFFER状态?: string;
  是否入职?: string;
  流程结束时间?: string;
}

interface QAPair {
  question: string;
  answer: string;
}

// 流程处理表单状态
interface ProcessForm {
  result: '通过' | '不通过' | '';
  next_stage: '一面' | '二面' | '三面' | '终止流程' | '';
  next_owner_id: string;
  comments: string;
  rejection_reason: string;
}

const ResumeScreeningDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUserStore();
  const resumeInputRef = useRef<HTMLInputElement>(null);

  // 状态
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Toast 通知
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 确认提交弹窗
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [hardReqExpanded, setHardReqExpanded] = useState(false);
  const [aiScoreExpanded, setAiScoreExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);

  // 数据
  const [basicInfo, setBasicInfo] = useState<BasicInfo>({});
  const [aiScore, setAiScore] = useState<AIScore>({});
  const [aiScoreDetail, setAiScoreDetail] = useState<AIScoreDetail | null>(null);
  const [hardRequirementsData, setHardRequirementsData] = useState<HardRequirements | null>(null);
  const [summary, setSummary] = useState('');
  const [privacyInfo, setPrivacyInfo] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [resumeScreening, setResumeScreening] = useState<ResumeScreening | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [salaryNegotiation, setSalaryNegotiation] = useState<SalaryNegotiation | null>(null);
  const [userList, setUserList] = useState<UserInfo[]>([]);

  // 面试问答弹窗
  const [qaDialogVisible, setQaDialogVisible] = useState(false);
  const [loadingQA, setLoadingQA] = useState(false);
  const [qaList, setQaList] = useState<QAPair[]>([]);
  const [currentQAStage, setCurrentQAStage] = useState('');

  // AI面试评分弹窗
  const [aiInterviewDialogVisible, setAiInterviewDialogVisible] = useState(false);
  const [currentAiInterviewData, setCurrentAiInterviewData] = useState<Interview | null>(null);

  // 流程处理表单
  const [processForm, setProcessForm] = useState<ProcessForm>({
    result: '',
    next_stage: '',
    next_owner_id: '',
    comments: '',
    rejection_reason: '',
  });

  // 表单验证错误
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ProcessForm, string>>>({});

  // 权限判断
  const canViewPrivacy = user?.role === 'HR' || user?.role === 'CEO';

  // 头像颜色 - 根据性别区分
  const getAvatarStyle = () => {
    if (basicInfo.gender === '男') {
      return { bg: 'from-blue-400 to-blue-600', text: 'text-white' };
    } else if (basicInfo.gender === '女') {
      return { bg: 'from-pink-400 to-pink-600', text: 'text-white' };
    }
    return { bg: 'from-gray-300 to-gray-500', text: 'text-white' };
  };

  // 格式化日期时间
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 按比例获取得分颜色
  const getScoreColorByRatio = (actual: number, total: number) => {
    if (!total || total === 0) return '#909399';
    const percentage = (actual / total) * 100;
    if (percentage >= 80) return '#22c55e';
    if (percentage >= 60) return '#3b82f6';
    if (percentage >= 40) return '#f59e0b';
    return '#ef4444';
  };

  // AI评分颜色
  const getScoreColor = (score?: number) => {
    if (!score) return '#909399';
    if (score >= 80) return '#67C23A';
    if (score >= 60) return '#409EFF';
    return '#F56C6C';
  };

  // 获取硬性条件通过数量
  const getHardReqPassCount = () => {
    if (!hardRequirementsData || !hardRequirementsData.assessments) return 0;
    return hardRequirementsData.assessments.filter((a) => a.passed).length;
  };

  // 加载候选人完整信息
  const loadCandidateCompleteInfo = async () => {
    if (!id) {
      navigate('/todo/resume-screening');
      return;
    }

    setLoading(true);
    try {
      const data = await getCandidateCompleteInfo(parseInt(id));

      // 填充基本信息
      setBasicInfo(data['基本信息'] || {});

      // 填充AI评分
      const scoreData = data['AI评分详情'] || {};
      setAiScore(scoreData);

      // 解析AI评分详情
      if (scoreData.ai_score_detail) {
        try {
          const detail =
            typeof scoreData.ai_score_detail === 'string'
              ? JSON.parse(scoreData.ai_score_detail)
              : scoreData.ai_score_detail;
          setAiScoreDetail(detail);
        } catch (e) {
          console.error('解析AI评分详情失败:', e);
        }
      }

      // 解析硬性条件评估
      if (scoreData.hard_requirements_assessment) {
        try {
          const hardReq =
            typeof scoreData.hard_requirements_assessment === 'string'
              ? JSON.parse(scoreData.hard_requirements_assessment)
              : scoreData.hard_requirements_assessment;
          setHardRequirementsData(hardReq);
        } catch (e) {
          console.error('解析硬性条件评估失败:', e);
        }
      }

      // 其他信息
      setSummary(data['基本概况'] || '');
      setPrivacyInfo(data['隐私信息'] || '');
      setJobTitle(data['应聘职位'] || '');
      setDepartment(data['所属部门'] || '');

      // 环节信息
      setResumeScreening(data['简历筛选'] || null);
      setInterviews(data['面试环节'] || []);
      setSalaryNegotiation(data['谈薪&背调'] || null);
    } catch (error) {
      console.error('加载候选人完整信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载用户列表
  const loadUserList = async () => {
    try {
      const users = await getUserList();
      setUserList(users);
    } catch (error) {
      console.error('加载用户列表失败:', error);
    }
  };

  // 查看简历
  const handleDownloadResume = () => {
    if (!basicInfo.resume_file_path) {
      return;
    }
    const resumeUrl = `/${basicInfo.resume_file_path}`;
    window.open(resumeUrl, '_blank');
  };

  // 更新简历
  const handleUpdateResume = () => {
    resumeInputRef.current?.click();
  };

  // 简历文件变化
  const onResumeFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !id) return;

    const formData = new FormData();
    formData.append('resume_file', file);

    try {
      setLoading(true);
      await updateCandidateResume(parseInt(id), formData);
      await loadCandidateCompleteInfo();
    } catch (error) {
      console.error('简历更新失败:', error);
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  // 查看背调报告
  const handleViewReport = (reportPath?: string) => {
    if (!reportPath) return;
    const ext = reportPath.split('.').pop()?.toLowerCase();
    if (ext && ['doc', 'docx'].includes(ext)) {
      const link = document.createElement('a');
      link.href = `/${reportPath}`;
      link.download = reportPath.split('/').pop() || 'report';
      link.click();
    } else {
      window.open(`/${reportPath}`, '_blank');
    }
  };

  // 查看面试问答
  const handleViewQA = async (row: Interview) => {
    if (!id) return;
    setCurrentQAStage(row.轮次);
    setQaDialogVisible(true);
    setLoadingQA(true);
    setQaList([]);

    try {
      const data = await getInterviewQA(parseInt(id), row.轮次);
      if (data && data.qa_pairs) {
        setQaList(data.qa_pairs);
      }
    } catch (error) {
      console.error('获取面试问答失败:', error);
    } finally {
      setLoadingQA(false);
    }
  };

  // 查看AI面试评分
  const handleViewAiInterviewScore = (row: Interview) => {
    setCurrentAiInterviewData(row);
    setAiInterviewDialogVisible(true);
  };

  // 返回列表
  const handleBack = () => {
    navigate('/todo/resume-screening');
  };

  // 表单验证
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof ProcessForm, string>> = {};

    if (!processForm.result) {
      errors.result = '请选择筛选结果';
    }

    if (processForm.result === '通过') {
      if (!processForm.next_stage || processForm.next_stage === '终止流程') {
        errors.next_stage = '请选择下一轮事件';
      }
      if (!processForm.next_owner_id) {
        errors.next_owner_id = '请选择下一轮负责人';
      }
    }

    if (processForm.result === '不通过') {
      if (!processForm.rejection_reason.trim()) {
        errors.rejection_reason = '请输入淘汰原因';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 监听筛选结果变化
  const handleResultChange = (value: '通过' | '不通过') => {
    setProcessForm((prev) => ({
      ...prev,
      result: value,
      next_stage: value === '不通过' ? '终止流程' : '',
      next_owner_id: value === '不通过' ? '' : prev.next_owner_id,
    }));
    // 清除相关错误
    setFormErrors((prev) => ({
      ...prev,
      result: undefined,
      next_stage: undefined,
      next_owner_id: undefined,
      rejection_reason: undefined,
    }));
  };

  // 提交流程处理
  const handleSubmit = async () => {
    if (!validateForm()) return;
    if (!id) return;
    setConfirmDialog(true);
  };

  // 确认提交
  const handleConfirmSubmit = async () => {
    if (!id) return;
    setConfirmDialog(false);

    setSubmitting(true);
    try {
      const data: ResumeScreeningData = {
        result: processForm.result as '通过' | '不通过',
        comments: processForm.comments || '无',
        next_stage: processForm.result === '通过' ? (processForm.next_stage as '一面' | '二面' | '三面') : null,
        next_owner_id: processForm.result === '通过' ? parseInt(processForm.next_owner_id) : null,
        rejection_reason: processForm.result === '不通过' ? processForm.rejection_reason : null,
      };

      await processResumeScreening(parseInt(id), data);
      showToast('提交成功');
      setTimeout(() => navigate('/todo/resume-screening'), 1000);
    } catch (error) {
      console.error('提交失败:', error);
      showToast('提交失败，请稍后重试', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    loadCandidateCompleteInfo();
    loadUserList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="h-full p-5 overflow-auto bg-gray-50">
      {/* 面包屑导航 */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-5">
        <span className="hover:text-gray-700 cursor-pointer" onClick={handleBack}>
          简历筛选
        </span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900">{basicInfo.name || '候选人'}</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900">筛选详情</span>
      </nav>

      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
        </div>
      )}

      {!loading && (
        <div className="space-y-5">
          {/* 候选人基本信息卡片 */}
            <div className="bg-white rounded-md border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-4 bg-blue-500 rounded"></span>
                  <span className="text-base font-medium text-gray-800">候选人基本信息</span>
                </div>
              </div>

              <div className="p-5">
                <div className="flex gap-10 pb-5 border-b border-gray-100">
                  {/* 左侧头像区域 */}
                  <div className="w-44 flex-shrink-0 text-center">
                    {(() => {
                      const style = getAvatarStyle();
                      const initial = basicInfo.name?.charAt(0) || '?';
                      return (
                        <div className={`w-32 h-32 mx-auto mb-4 rounded-full flex items-center justify-center bg-gradient-to-br ${style.bg} shadow-lg`}>
                          <span className={`text-5xl font-bold ${style.text} select-none`}>{initial}</span>
                        </div>
                      );
                    })()}
                    <div className="flex items-center justify-center gap-1">
                      <button
                        className="text-sm text-blue-500 hover:underline"
                        onClick={handleDownloadResume}
                      >
                        查看简历
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        className="text-sm text-blue-500 hover:underline"
                        onClick={handleUpdateResume}
                      >
                        更新简历
                      </button>
                    </div>
                    <input
                      ref={resumeInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx"
                      className="hidden"
                      onChange={onResumeFileChange}
                    />
                  </div>

                  {/* 右侧信息区域 */}
                  <div className="flex-1 grid grid-cols-3 gap-x-10 gap-y-5">
                    {/* 第一行 */}
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">候选人姓名</label>
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.name || '-'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">简历上传时间</label>
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {formatDateTime(basicInfo.created_at)}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">流程进展</label>
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.current_stage || '-'}
                      </div>
                    </div>

                    {/* 第二行 */}
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">年龄</label>
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.age || '-'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">职场状态</label>
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.work_status || '-'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">应聘职位</label>
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {jobTitle || '-'}
                      </div>
                    </div>

                    {/* 第三行 */}
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">工作年限</label>
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.work_years ? `${basicInfo.work_years}年` : '-'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">期望薪资</label>
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.expected_salary || '-'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">应聘部门</label>
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {department || '-'}
                      </div>
                    </div>

                    {/* 第四行 */}
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">学历</label>
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.highest_education || '-'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2 flex items-center gap-1">
                        学校
                        {basicInfo.is_985 && <Badge variant="red" size="sm">985</Badge>}
                        {basicInfo.is_211 && <Badge variant="pink" size="sm">211</Badge>}
                        {basicInfo.is_double_first_class && <Badge variant="green" size="sm">双一流</Badge>}
                      </label>
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.school || '-'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2 flex items-center gap-1">
                        AI简历评分
                        <Badge variant="turbo" size="sm">AI</Badge>
                      </label>
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm">
                        <span style={{ color: getScoreColor(aiScore.ai_score_total) }}>
                          {aiScore.ai_score_total || '-'}
                        </span>
                        {aiScore.ai_score_total && <span className="text-gray-600"> / {aiScore.total_score_max || 120} 分</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 基本概况 */}
                <div className="mt-5">
                  <label className="block text-sm text-gray-600 mb-2">基本概况</label>
                  <div className="px-4 py-3 bg-white border border-gray-200 rounded text-sm text-gray-700 leading-relaxed">
                    {summary || '暂无简述'}
                  </div>
                </div>

                {/* 隐私信息 */}
                <div className="mt-5">
                  <label className="block text-sm text-gray-600 mb-2">隐私信息</label>
                  {canViewPrivacy ? (
                    <div className="px-4 py-3 bg-white border border-gray-200 rounded text-sm text-gray-700 leading-relaxed min-h-10">
                      {privacyInfo || '*'}
                    </div>
                  ) : (
                    <div className="px-4 py-3 bg-white border border-gray-200 rounded text-sm text-gray-700 leading-relaxed min-h-10">
                      *
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 硬性条件评估 */}
            {hardRequirementsData && (
              <div className="bg-white rounded-md border border-gray-200">
                <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-4 bg-blue-500 rounded"></span>
                      <span className="text-base font-medium text-gray-800">硬性条件评估</span>
                      <Badge variant="turbo" size="sm">AI</Badge>
                    </div>
                    <span className="text-gray-300">|</span>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">整体结果:</span>
                      <Badge variant={hardRequirementsData.overall_passed ? "green" : "red"} size="md">
                        {hardRequirementsData.overall_passed ? '通过' : '不通过'}
                      </Badge>
                    </div>
                    <span className="text-gray-300">|</span>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">通过率:</span>
                      <span className="font-medium text-gray-700">
                        {getHardReqPassCount()} / {hardRequirementsData.assessments?.length || 0}
                      </span>
                    </div>
                  </div>
                  <button
                    className="text-sm text-blue-500 hover:underline flex items-center gap-1"
                    onClick={() => setHardReqExpanded(!hardReqExpanded)}
                  >
                    {hardReqExpanded ? (
                      <>收起 <ChevronUp className="w-4 h-4" /></>
                    ) : (
                      <>展开 <ChevronDown className="w-4 h-4" /></>
                    )}
                  </button>
                </div>

                {hardReqExpanded && (
                  <div className="p-5">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="pb-3 text-left text-sm font-medium text-gray-600 w-24">条件类型</th>
                          <th className="pb-3 text-left text-sm font-medium text-gray-600">要求内容</th>
                          <th className="pb-3 text-left text-sm font-medium text-gray-600">评判理由</th>
                          <th className="pb-3 text-center text-sm font-medium text-gray-600 w-20">结果</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hardRequirementsData.assessments?.map((item, index) => (
                          <tr key={index} className="border-b border-gray-100 last:border-b-0">
                            <td className="py-4 pr-4 text-sm text-gray-700 font-medium align-top">
                              {item.category}
                            </td>
                            <td className="py-4 pr-4 text-sm text-gray-700 align-top">
                              {item.content}
                            </td>
                            <td className="py-4 pr-4 text-sm text-gray-500 align-top">
                              {item.reason}
                            </td>
                            <td className="py-4 text-center align-top">
                              <Badge variant={item.passed ? "green" : "red"} size="md">
                                {item.passed ? '通过' : '不通过'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* AI简历评分详情 */}
            {aiScoreDetail && (
              <div className="bg-white rounded-md border border-gray-200">
                <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-4 bg-blue-500 rounded"></span>
                      <span className="text-base font-medium text-gray-800">AI简历评分详情</span>
                      <Badge variant="turbo" size="sm">AI</Badge>
                    </div>
                    <span className="text-gray-300">|</span>
                    <div className="flex items-center gap-6">
                      <Gauge
                        value={aiScore.ai_score_total || 0}
                        maxValue={aiScore.total_score_max || 120}
                        size="small"
                        label="总分"
                        showValue
                      />
                      <Gauge
                        value={aiScore.ai_score_main || 0}
                        maxValue={aiScore.main_score_max || 100}
                        size="small"
                        label="主要分"
                        showValue
                      />
                      <Gauge
                        value={aiScore.ai_score_bonus || 0}
                        maxValue={aiScore.bonus_score_max || 20}
                        size="small"
                        label="加分项"
                        showValue
                      />
                    </div>
                  </div>
                  <button
                    className="text-sm text-blue-500 hover:underline flex items-center gap-1"
                    onClick={() => setAiScoreExpanded(!aiScoreExpanded)}
                  >
                    {aiScoreExpanded ? (
                      <>收起 <ChevronUp className="w-4 h-4" /></>
                    ) : (
                      <>展开 <ChevronDown className="w-4 h-4" /></>
                    )}
                  </button>
                </div>

                {aiScoreExpanded && (
                  <div className="p-5 space-y-4">
                    {aiScoreDetail.dimensions?.map((dimension, dIndex) => (
                      <div key={dIndex} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-200">
                          <span className="font-medium text-gray-800">{dimension.dimension_name}</span>
                          <span className="text-sm text-gray-600">
                            得分: <span
                              className="font-semibold"
                              style={{ color: getScoreColorByRatio(dimension.dimension_actual_score, dimension.dimension_total_score) }}
                            >{dimension.dimension_actual_score}</span>
                            <span className="text-gray-400"> / {dimension.dimension_total_score}</span>
                          </span>
                        </div>

                        <div className="p-4">
                          <table className="w-full">
                            <thead>
                              <tr className="text-left text-sm text-gray-500">
                                <th className="pb-2 font-medium w-32">指标</th>
                                <th className="pb-2 font-medium">评判理由</th>
                                <th className="pb-2 font-medium w-20 text-right">得分</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dimension.indicators?.map((indicator, iIndex) => (
                                <tr key={iIndex} className="border-t border-gray-100">
                                  <td className="py-3 pr-4 text-sm text-gray-700 font-medium align-top">
                                    {indicator.indicator_name}
                                  </td>
                                  <td className="py-3 pr-4 text-sm text-gray-600 align-top">
                                    <div>{indicator.reason}</div>
                                    {indicator.evidence && (
                                      <div className="mt-1 text-gray-400 text-xs">来源: {indicator.evidence}</div>
                                    )}
                                  </td>
                                  <td className="py-3 text-sm text-right align-top">
                                    <span
                                      className="font-semibold"
                                      style={{ color: getScoreColorByRatio(indicator.actual_score, indicator.total_score) }}
                                    >{indicator.actual_score}</span>
                                    <span className="text-gray-400"> / {indicator.total_score}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 简历筛选环节 */}
            <div className="bg-white rounded-md border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
                <span className="w-1 h-4 bg-blue-500 rounded"></span>
                <span className="text-base font-medium text-gray-800">简历筛选环节</span>
              </div>
              <div className="p-5">
                {resumeScreening ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 w-24">负责人</th>
                          <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-24">状态</th>
                          <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-40">完成时间</th>
                          <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 min-w-[300px]">备注/原因</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-100">
                          <td className="px-3 py-4 text-sm text-gray-700 font-medium">
                            {resumeScreening.负责人 || '-'}
                          </td>
                          <td className="px-3 py-4 text-center">
                            {resumeScreening.状态 ? (
                              <Badge
                                variant={resumeScreening.状态 === '通过' ? 'green' : resumeScreening.状态 === '不通过' ? 'red' : 'gray'}
                                size="md"
                              >
                                {resumeScreening.状态}
                              </Badge>
                            ) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-3 py-4 text-center text-sm text-gray-500">
                            {formatDateTime(resumeScreening.完成时间)}
                          </td>
                          <td className="px-3 py-4 text-sm text-gray-600">
                            <div className="whitespace-pre-wrap leading-relaxed">
                              {resumeScreening.原因 || '-'}
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">暂无简历筛选记录</div>
                )}
              </div>
            </div>

            {/* 面试环节 */}
            <div className="bg-white rounded-md border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
                <span className="w-1 h-4 bg-blue-500 rounded"></span>
                <span className="text-base font-medium text-gray-800">面试环节</span>
              </div>
              <div className="p-5">
                {interviews && interviews.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1200px]">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 w-20">轮次</th>
                          <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 w-20">负责人</th>
                          <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-20">状态</th>
                          <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-24">人工评分</th>
                          <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 min-w-[400px]">评价内容</th>
                          <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-24">问题清单</th>
                          <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-24">
                            <div className="flex items-center justify-center gap-1">
                              AI评分
                              <Badge variant="turbo" size="sm">AI</Badge>
                            </div>
                          </th>
                          <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-36">面试时间</th>
                          <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-36">评价时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {interviews.map((row, index) => (
                          <tr key={index} className="border-b border-gray-100 last:border-b-0">
                            <td className="px-3 py-4 text-sm text-gray-700 font-medium">
                              {row.轮次}
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-700">
                              {row.负责人 || '-'}
                            </td>
                            <td className="px-3 py-4 text-center">
                              {row.状态 ? (
                                <Badge
                                  variant={row.状态 === '通过' ? 'green' : row.状态 === '不通过' ? 'red' : 'gray'}
                                  size="md"
                                >
                                  {row.状态}
                                </Badge>
                              ) : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-4 text-center text-sm">
                              {row.总分 ? (
                                <span>
                                  <span
                                    className="font-semibold"
                                    style={{ color: getScoreColorByRatio(row.总分, 100) }}
                                  >
                                    {row.总分}
                                  </span>
                                  <span className="text-gray-400"> / 100</span>
                                </span>
                              ) : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-600">
                              {row.面试评价 ? (
                                <div className="whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                                  {row.面试评价}
                                </div>
                              ) : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-4 text-center">
                              {row.has_qa ? (
                                <button
                                  className="text-blue-500 hover:underline text-sm"
                                  onClick={() => handleViewQA(row)}
                                >
                                  查看
                                </button>
                              ) : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-4 text-center">
                              {row.ai_interview_score_total ? (
                                <button
                                  className="text-blue-500 hover:underline text-sm"
                                  onClick={() => handleViewAiInterviewScore(row)}
                                >
                                  查看详情
                                </button>
                              ) : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-4 text-center text-sm text-gray-500 whitespace-nowrap">
                              {formatDateTime(row.面试时间)}
                            </td>
                            <td className="px-3 py-4 text-center text-sm text-gray-500 whitespace-nowrap">
                              {formatDateTime(row.评价时间)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">暂无面试记录</div>
                )}
              </div>
            </div>

            {/* 谈薪&背调环节 */}
            <div className="bg-white rounded-md border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
                <span className="w-1 h-4 bg-blue-500 rounded"></span>
                <span className="text-base font-medium text-gray-800">谈薪&背调环节</span>
              </div>
              <div className="p-5">
                {salaryNegotiation ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 w-24">负责人</th>
                          <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-24">谈薪状态</th>
                          <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-24">背调状态</th>
                          <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-24">OFFER状态</th>
                          <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-20">是否入职</th>
                          <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-24">背调报告</th>
                          <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-40">流程结束时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-100">
                          <td className="px-3 py-4 text-sm text-gray-700 font-medium">
                            {salaryNegotiation.负责人 || '-'}
                          </td>
                          <td className="px-3 py-4 text-center">
                            {salaryNegotiation.谈薪状态 ? (
                              <Badge
                                variant={salaryNegotiation.谈薪状态 === '已完成' ? 'green' : salaryNegotiation.谈薪状态 === '进行中' ? 'amber' : 'gray'}
                                size="md"
                              >
                                {salaryNegotiation.谈薪状态}
                              </Badge>
                            ) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-3 py-4 text-center">
                            {salaryNegotiation.背调状态 ? (
                              <Badge
                                variant={salaryNegotiation.背调状态 === '已完成' ? 'green' : salaryNegotiation.背调状态 === '进行中' ? 'amber' : 'gray'}
                                size="md"
                              >
                                {salaryNegotiation.背调状态}
                              </Badge>
                            ) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-3 py-4 text-center">
                            {salaryNegotiation.OFFER状态 ? (
                              <Badge
                                variant={
                                  salaryNegotiation.OFFER状态 === '已回签' ? 'green' :
                                  salaryNegotiation.OFFER状态 === '已拒绝' || salaryNegotiation.OFFER状态 === '自主放弃' ? 'red' :
                                  salaryNegotiation.OFFER状态 === '已发放' ? 'amber' : 'gray'
                                }
                                size="md"
                              >
                                {salaryNegotiation.OFFER状态}
                              </Badge>
                            ) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-3 py-4 text-center">
                            <Badge
                              variant={salaryNegotiation.是否入职 === '是' ? 'green' : 'gray'}
                              size="md"
                            >
                              {salaryNegotiation.是否入职 || '否'}
                            </Badge>
                          </td>
                          <td className="px-3 py-4 text-center">
                            {salaryNegotiation.背调报告 ? (
                              <button
                                className="text-blue-500 hover:underline text-sm"
                                onClick={() => handleViewReport(salaryNegotiation.背调报告)}
                              >
                                查看报告
                              </button>
                            ) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-3 py-4 text-center text-sm text-gray-500">
                            {formatDateTime(salaryNegotiation.流程结束时间)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">暂无谈薪&背调记录</div>
                )}
              </div>
            </div>
          </div>
        )}

      {/* 悬浮操作按钮 */}
      <Button
        onClick={() => setSheetOpen(true)}
        className="fixed right-8 bottom-8 h-14 px-6 text-base shadow-lg hover:shadow-xl transition-shadow bg-blue-600 hover:bg-blue-700"
        size="lg"
      >
        <CheckCircle className="w-5 h-5 mr-2" />
        开始筛选
      </Button>

      {/* 流程处理Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          close={false}
          className={`${sheetExpanded ? 'w-[calc(100%-2.5rem)] sm:max-w-[calc(100%-2.5rem)]' : 'w-[420px] sm:max-w-[420px]'} flex flex-col transition-all duration-300`}
        >
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <span className="w-1 h-4 bg-blue-500 rounded"></span>
                流程处理 - 简历筛选
              </SheetTitle>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSheetExpanded(!sheetExpanded)}
                  className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                  title={sheetExpanded ? '收起' : '展开'}
                >
                  {sheetExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setSheetOpen(false)}
                  className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                  title="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </SheetHeader>

          <SheetBody className="flex-1 overflow-y-auto">
            <div className="space-y-5">
              {/* 筛选结果 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  筛选结果 <span className="text-red-500">*</span>
                </label>
                <Select
                  value={processForm.result}
                  onValueChange={(value) => handleResultChange(value as '通过' | '不通过')}
                >
                  <SelectTrigger className={formErrors.result ? 'border-red-500' : ''}>
                    <SelectValue placeholder="请选择筛选结果" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="通过">通过</SelectItem>
                    <SelectItem value="不通过">淘汰</SelectItem>
                  </SelectContent>
                </Select>
                {formErrors.result && (
                  <p className="mt-1 text-xs text-red-500">{formErrors.result}</p>
                )}
              </div>

              {/* 通过时显示的字段 */}
              {processForm.result === '通过' && (
                <>
                  {/* 下一轮事件 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      下一轮事件 <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={processForm.next_stage}
                      onValueChange={(value) => {
                        setProcessForm((prev) => ({ ...prev, next_stage: value as ProcessForm['next_stage'] }));
                        setFormErrors((prev) => ({ ...prev, next_stage: undefined }));
                      }}
                    >
                      <SelectTrigger className={formErrors.next_stage ? 'border-red-500' : ''}>
                        <SelectValue placeholder="请选择下一轮事件" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="一面">一面</SelectItem>
                        <SelectItem value="二面">二面</SelectItem>
                        <SelectItem value="三面">三面</SelectItem>
                      </SelectContent>
                    </Select>
                    {formErrors.next_stage && (
                      <p className="mt-1 text-xs text-red-500">{formErrors.next_stage}</p>
                    )}
                  </div>

                  {/* 下一轮负责人 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      下一轮负责人 <span className="text-red-500">*</span>
                    </label>
                    <SearchableSelect
                      options={userList
                        .filter((u) => u.is_active !== false)
                        .map((u) => ({
                          value: String(u.id),
                          label: `${u.id}-${u.real_name || u.username}${u.department ? `（${u.department}）` : ''}`,
                        }))}
                      value={processForm.next_owner_id}
                      onValueChange={(value) => {
                        setProcessForm((prev) => ({ ...prev, next_owner_id: value }));
                        setFormErrors((prev) => ({ ...prev, next_owner_id: undefined }));
                      }}
                      placeholder="请选择下一轮负责人"
                      searchPlaceholder="搜索ID、姓名或部门"
                      emptyText="没有匹配的负责人"
                      className={formErrors.next_owner_id ? 'border-red-500' : ''}
                    />
                    {formErrors.next_owner_id && (
                      <p className="mt-1 text-xs text-red-500">{formErrors.next_owner_id}</p>
                    )}
                  </div>

                  {/* 评价意见 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      评价意见
                    </label>
                    <Textarea
                      value={processForm.comments}
                      onChange={(e) => setProcessForm((prev) => ({ ...prev, comments: e.target.value }))}
                      placeholder="请输入评价意见（可选）"
                      rows={4}
                    />
                  </div>
                </>
              )}

              {/* 淘汰时显示的字段 */}
              {processForm.result === '不通过' && (
                <>
                  {/* 淘汰原因 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      淘汰原因 <span className="text-red-500">*</span>
                    </label>
                    <Textarea
                      value={processForm.rejection_reason}
                      onChange={(e) => {
                        setProcessForm((prev) => ({ ...prev, rejection_reason: e.target.value }));
                        setFormErrors((prev) => ({ ...prev, rejection_reason: undefined }));
                      }}
                      placeholder="请输入淘汰原因"
                      rows={4}
                      className={formErrors.rejection_reason ? 'border-red-500' : ''}
                    />
                    {formErrors.rejection_reason && (
                      <p className="mt-1 text-xs text-red-500">{formErrors.rejection_reason}</p>
                    )}
                  </div>

                  {/* 下一轮事件（禁用） */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      下一轮事件
                    </label>
                    <Select value="终止流程" disabled>
                      <SelectTrigger className="bg-gray-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="终止流程">终止流程</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 终止流程原因 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      终止流程原因
                    </label>
                    <Textarea
                      value={processForm.comments}
                      onChange={(e) => setProcessForm((prev) => ({ ...prev, comments: e.target.value }))}
                      placeholder="请输入终止流程原因（可选）"
                      rows={3}
                    />
                  </div>
                </>
              )}
            </div>
          </SheetBody>

          <SheetFooter className="border-t pt-4">
            <Button
              onClick={handleSubmit}
              disabled={submitting || !processForm.result}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  提交中...
                </>
              ) : (
                '提交'
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* 面试问题清单弹窗 */}
      <Dialog open={qaDialogVisible} onOpenChange={setQaDialogVisible}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>面试问题清单 - {currentQAStage}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {loadingQA ? (
              <div className="flex justify-center items-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
              </div>
            ) : qaList.length > 0 ? (
              <div className="space-y-3">
                {qaList.map((qa, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm text-gray-800 leading-relaxed">
                      <Badge variant="blue" size="sm" className="mt-0.5 shrink-0">Q{index + 1}</Badge>
                      <span className="font-medium">{qa.question}</span>
                    </div>
                    <div className="px-4 py-3 text-sm text-gray-600 leading-relaxed">
                      <span className="whitespace-pre-wrap">{qa.answer}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-gray-400">暂无面试问答记录</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI面试评分详情弹窗 */}
      <Dialog open={aiInterviewDialogVisible} onOpenChange={setAiInterviewDialogVisible}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <DialogTitle>AI面试评分详情 - {currentAiInterviewData?.轮次}</DialogTitle>
              <Badge variant="turbo" size="sm">AI</Badge>
            </div>
          </DialogHeader>

          {currentAiInterviewData && (
            <div className="flex-1 overflow-y-auto py-4">
              {/* 评分概览 */}
              <div className="flex items-center gap-8 mb-6 pb-4 border-b border-gray-200">
                <Gauge
                  value={currentAiInterviewData.ai_interview_score_total || 0}
                  maxValue={120}
                  size="medium"
                  label="总分"
                  showValue
                />
                <Gauge
                  value={currentAiInterviewData.ai_interview_score_main || 0}
                  maxValue={100}
                  size="medium"
                  label="主要分"
                  showValue
                />
                <Gauge
                  value={currentAiInterviewData.ai_interview_score_bonus || 0}
                  maxValue={20}
                  size="medium"
                  label="加分项"
                  showValue
                />
              </div>

              {/* 维度详细评分 */}
              {currentAiInterviewData.ai_interview_evaluation?.dimensions && currentAiInterviewData.ai_interview_evaluation.dimensions.length > 0 ? (
                <div className="space-y-4">
                  {currentAiInterviewData.ai_interview_evaluation.dimensions.map((dimension, dIndex) => (
                    <div key={dIndex} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <span className="font-medium text-gray-800">{dimension.dimension_name}</span>
                        <span className="text-sm text-gray-600">
                          得分: <span
                            className="font-semibold"
                            style={{ color: getScoreColorByRatio(dimension.dimension_actual_score, dimension.dimension_total_score) }}
                          >{dimension.dimension_actual_score}</span>
                          <span className="text-gray-400"> / {dimension.dimension_total_score}</span>
                        </span>
                      </div>

                      <div className="p-4">
                        <table className="w-full">
                          <thead>
                            <tr className="text-left text-sm text-gray-500">
                              <th className="pb-2 font-medium w-32">指标</th>
                              <th className="pb-2 font-medium">评判理由</th>
                              <th className="pb-2 font-medium w-20 text-right">得分</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dimension.indicators?.map((indicator, iIndex) => (
                              <tr key={iIndex} className="border-t border-gray-100">
                                <td className="py-3 pr-4 text-sm text-gray-700 font-medium align-top">
                                  {indicator.indicator_name}
                                </td>
                                <td className="py-3 pr-4 text-sm text-gray-600 align-top">
                                  <div>{indicator.reason}</div>
                                  {indicator.evidence && (
                                    <div className="mt-1 text-gray-400 text-xs">来源: {indicator.evidence}</div>
                                  )}
                                </td>
                                <td className="py-3 text-sm text-right align-top">
                                  <span
                                    className="font-semibold"
                                    style={{ color: getScoreColorByRatio(indicator.actual_score, indicator.total_score) }}
                                  >{indicator.actual_score}</span>
                                  <span className="text-gray-400"> / {indicator.total_score}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-gray-400">暂无详细评分数据</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 确认提交弹窗 */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认提交</DialogTitle>
            <DialogDescription>
              {processForm.result === '通过'
                ? `确认将候选人 ${basicInfo.name} 的简历筛选结果设为【通过】，并流转至【${processForm.next_stage}】阶段？`
                : `确认将候选人 ${basicInfo.name} 的简历筛选结果设为【不通过】，并终止流程？`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(false)}>
              取消
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleConfirmSubmit}>
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast 通知 */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-2">
          <div className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm ${
            toast.type === 'success' ? 'bg-green-600' :
            toast.type === 'error' ? 'bg-red-600' : 'bg-yellow-600'
          }`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeScreeningDetailPage;
