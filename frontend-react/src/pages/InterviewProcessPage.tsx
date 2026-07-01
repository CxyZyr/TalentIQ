import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, ChevronRight, Loader2, Maximize2, Minimize2, X, Sparkles, CheckCircle } from 'lucide-react';
import { useUserStore } from '../stores/userStore';
import { useToast } from '../components/ui/toast';
import {
  getCandidateCompleteInfo,
  updateCandidateResume,
  getInterviewQA,
  getUserList,
  UserInfo,
} from '../api/candidate';
import {
  getRecordingList,
  getAIInterviewScore,
  getRecordingDetail,
  submitInterviewEvaluation,
  getExistingEvaluation,
  Recording,
  AIInterviewScore,
} from '../api/interview';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Input } from '../components/ui/input';
import { DatePicker } from '../components/ui/date-picker';
import { TimePicker } from '../components/ui/time-picker';
import { SearchableSelect } from '../components/ui/searchable-select';

// 类型定义
// 本地时间格式化为 YYYY-MM-DDTHH:mm（避免 toISOString 的 UTC 转换）
const formatLocalDateTime = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
};

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
  current_stage_result?: string;
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
  total_possible_score?: number;
  main_total_score?: number;
  bonus_total_score?: number;
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

// 个人素养评分项配置
const PERSONAL_QUALITY_ITEMS = [
  { key: 'motivation_score', label: '求职动机', points: ['是否以企业发展为目标兼顾个人利益'] },
  { key: 'communication_score', label: '沟通能力', points: ['说话前后连贯', '语言表达简明、逻辑性强', '理解问题准确'] },
  { key: 'responsibility_score', label: '责任心', points: ['坚持不懈的性格', '负责到底的精神'] },
  { key: 'stability_score', label: '职业稳定性', points: ['在同一公司工作超过3年', '更换工作频率低'] },
];

// 下一轮选项（根据当前轮次）
const getNextStageOptions = (currentStage: string) => {
  switch (currentStage) {
    case '一面':
      return ['二面', '三面', '谈薪&背调'];
    case '二面':
      return ['三面', '谈薪&背调'];
    case '三面':
      return ['谈薪&背调'];
    default:
      return ['二面', '三面', '谈薪&背调'];
  }
};

// 面试评价表单状态
interface ProcessForm {
  interview_time: string;
  motivation_score: number;
  communication_score: number;
  responsibility_score: number;
  stability_score: number;
  work_ability_score: number;
  is_ai_referenced: boolean;
  recording_id: number | null;
  conclusion: '通过' | '淘汰' | '待定' | '';
  next_stage: string;
  next_owner_id: string;
  rejection_reason: string;
  comments: string;
}

const InterviewProcessPage = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useUserStore();
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const stage = searchParams.get('stage') || '一面';

  // 状态
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  // 录音和AI评分
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [latestRecordingId, setLatestRecordingId] = useState<number | null>(null);
  const [aiInterviewScoreData, setAiInterviewScoreData] = useState<AIInterviewScore | null>(null);
  const [loadingAiScore, setLoadingAiScore] = useState(false);
  const [aiEvaluationExpanded, setAiEvaluationExpanded] = useState(false);

  // 面试问答弹窗
  const [qaDialogVisible, setQaDialogVisible] = useState(false);
  const [loadingQA, setLoadingQA] = useState(false);
  const [qaList, setQaList] = useState<QAPair[]>([]);
  const [currentQAStage, setCurrentQAStage] = useState('');

  // AI面试评分弹窗
  const [aiInterviewDialogVisible, setAiInterviewDialogVisible] = useState(false);
  const [currentAiInterviewData, setCurrentAiInterviewData] = useState<Interview | null>(null);

  // 面试评价表单
  const [processForm, setProcessForm] = useState<ProcessForm>({
    interview_time: formatLocalDateTime(new Date()),
    motivation_score: 0,
    communication_score: 0,
    responsibility_score: 0,
    stability_score: 0,
    work_ability_score: 0,
    is_ai_referenced: false,
    recording_id: null,
    conclusion: '',
    next_stage: '',
    next_owner_id: '',
    rejection_reason: '',
    comments: '',
  });

  // 表单验证错误
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ProcessForm, string>>>({});

  // 个人素养评分栏抖动提示
  const [personalQualityShake, setPersonalQualityShake] = useState(false);

  // Toast 通知状态
  const { showToast } = useToast();

  // 确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; message: string }>({
    open: false,
    message: '',
  });

  // 面试日期和时间状态（用于DatePicker组件）
  const [interviewDate, setInterviewDate] = useState<Date | undefined>(new Date());
  const [interviewTime, setInterviewTime] = useState<string>(
    new Date().toTimeString().slice(0, 5)
  );

  // 权限判断
  const canViewPrivacy = user?.role === 'HR' || user?.role === 'CEO';

  // 计算个人素养总分
  const personalQualityTotal = useMemo(() => {
    return (
      processForm.motivation_score +
      processForm.communication_score +
      processForm.responsibility_score +
      processForm.stability_score
    );
  }, [processForm.motivation_score, processForm.communication_score, processForm.responsibility_score, processForm.stability_score]);

  // 计算总分
  const totalScore = useMemo(() => {
    return personalQualityTotal + processForm.work_ability_score;
  }, [personalQualityTotal, processForm.work_ability_score]);

  // 头像颜色
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
      navigate('/todo/interview');
      return;
    }

    setLoading(true);
    try {
      const data = await getCandidateCompleteInfo(parseInt(id));

      const basic = data['基本信息'] || {};
      setBasicInfo(basic);

      const scoreData = data['AI评分详情'] || {};
      setAiScore(scoreData);

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

      setSummary(data['基本概况'] || '');
      setPrivacyInfo(data['隐私信息'] || '');
      setJobTitle(data['应聘职位'] || '');
      setDepartment(data['所属部门'] || '');
      setResumeScreening(data['简历筛选'] || null);
      setInterviews(data['面试环节'] || []);
      setSalaryNegotiation(data['谈薪&背调'] || null);

      // 加载录音列表
      try {
        const recordingsRes = await getRecordingList(parseInt(id), stage);
        if (recordingsRes && recordingsRes.length > 0) {
          setRecordings(recordingsRes);
          setLatestRecordingId(recordingsRes[0].id);

          // 用录音开始时间作为面试时间的默认值
          const recordingTime = recordingsRes[0].created_at;
          if (recordingTime) {
            const dt = new Date(recordingTime);
            setInterviewDate(dt);
            setInterviewTime(dt.toTimeString().slice(0, 5));
            setProcessForm((prev) => ({
              ...prev,
              interview_time: formatLocalDateTime(dt),
            }));
          }
        }
      } catch (e) {
        console.error('加载录音列表失败:', e);
      }

      // 加载已有面试评价
      try {
        const shouldPrefillExistingEvaluation = basic.current_stage === stage;
        if (shouldPrefillExistingEvaluation) {
          const existingEval = await getExistingEvaluation(parseInt(id), stage);
          if (existingEval && existingEval.personal_quality && existingEval.work_ability) {
            const evalTime = existingEval.interview_time ? new Date(existingEval.interview_time) : null;
            if (evalTime) {
              setInterviewDate(evalTime);
              setInterviewTime(evalTime.toTimeString().slice(0, 5));
            }
            const shouldRestoreConclusion = basic.current_stage_result === '待定';
            setProcessForm((prev) => ({
              ...prev,
              interview_time: evalTime
                ? formatLocalDateTime(evalTime)
                : prev.interview_time,
              motivation_score: existingEval.personal_quality.motivation_score ?? prev.motivation_score,
              communication_score: existingEval.personal_quality.communication_score ?? prev.communication_score,
              responsibility_score: existingEval.personal_quality.responsibility_score ?? prev.responsibility_score,
              stability_score: existingEval.personal_quality.stability_score ?? prev.stability_score,
              work_ability_score: existingEval.work_ability.score ?? prev.work_ability_score,
              is_ai_referenced: existingEval.work_ability.is_ai_referenced ?? prev.is_ai_referenced,
              recording_id: existingEval.recording_id || prev.recording_id,
              conclusion: shouldRestoreConclusion
                ? ((existingEval.conclusion as '' | '通过' | '淘汰' | '待定') || prev.conclusion)
                : '',
              comments: existingEval.comments || prev.comments,
            }));
          }
        }
      } catch (e) {
        console.error('加载已有评价失败:', e);
      }
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
    if (!basicInfo.resume_file_path) return;
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
    navigate('/todo/interview');
  };

  // 引用AI评分
  const handleReferenceAI = async () => {
    if (!latestRecordingId) {
      showToast('暂无可引用的AI评分，请先进行AI面试', 'warning');
      return;
    }

    setLoadingAiScore(true);
    try {
      const [scoreRes, detailRes] = await Promise.all([
        getAIInterviewScore(latestRecordingId),
        getRecordingDetail(latestRecordingId),
      ]);

      // 从detailRes获取详细的评价数据
      const evalDetail = detailRes.interview_evaluation;
      const dimensions = evalDetail?.dimensions || scoreRes.dimensions || [];

      // 存储AI评分数据用于显示
      setAiInterviewScoreData({
        total_score: detailRes.interview_score_total || scoreRes.total_score || 0,
        main_score: detailRes.interview_score_main || scoreRes.main_score || 0,
        bonus_score: detailRes.interview_score_bonus || scoreRes.bonus_score || 0,
        total_possible_score: evalDetail?.total_possible_score,
        main_total_score: evalDetail?.main_total_score,
        bonus_total_score: evalDetail?.bonus_total_score,
        dimensions: dimensions,
        overall_evaluation: detailRes.comprehensive_evaluation || scoreRes.overall_evaluation,
        strengths: detailRes.strengths || scoreRes.strengths,
        improvements: detailRes.weaknesses || scoreRes.improvements,
      });

      // 填充工作能力分数和AI总体评价（不覆盖用户手动填写的个人素养打分）
      const workScore = detailRes.interview_score_total || scoreRes.total_score || 0;
      const overallEvaluation = detailRes.comprehensive_evaluation || scoreRes.overall_evaluation || '';
      setProcessForm((prev) => ({
        ...prev,
        work_ability_score: Math.min(80, Math.round(workScore)),
        is_ai_referenced: true,
        recording_id: latestRecordingId,
        comments: overallEvaluation || prev.comments,
      }));

      // 自动展开AI评价详情
      setAiEvaluationExpanded(true);
    } catch (error) {
      console.error('获取AI评分失败:', error);
    } finally {
      setLoadingAiScore(false);
    }
  };

  // 更新分数
  const updateScore = (key: keyof ProcessForm, value: number) => {
    const maxValue = key === 'work_ability_score' ? 80 : 5;
    setProcessForm((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(maxValue, value)),
    }));
  };

  // 表单验证
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof ProcessForm, string>> = {};

    // 个人素养评分4项不能全为0
    const personalQualityAllZero =
      processForm.motivation_score === 0 &&
      processForm.communication_score === 0 &&
      processForm.responsibility_score === 0 &&
      processForm.stability_score === 0;
    if (personalQualityAllZero) {
      setPersonalQualityShake(true);
      setTimeout(() => setPersonalQualityShake(false), 800);
      showToast('请填写个人素养评分', 'warning');
      return false;
    }

    if (!processForm.conclusion) {
      errors.conclusion = '请选择面试结论';
    }

    if (processForm.conclusion === '通过') {
      if (!processForm.next_stage) {
        errors.next_stage = '请选择下一轮事件';
      }
      if (!processForm.next_owner_id) {
        errors.next_owner_id = '请选择下一轮负责人';
      }
    }

    if (processForm.conclusion === '淘汰') {
      if (!processForm.rejection_reason.trim()) {
        errors.rejection_reason = '请输入淘汰原因';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 监听结论变化
  const handleConclusionChange = (value: '通过' | '淘汰' | '待定') => {
    setProcessForm((prev) => ({
      ...prev,
      conclusion: value,
      next_stage: value === '通过' ? prev.next_stage : '',
      next_owner_id: value === '通过' ? prev.next_owner_id : '',
      rejection_reason: value === '淘汰' ? prev.rejection_reason : '',
    }));
    setFormErrors({});
  };

  // 提交表单（先弹出确认对话框）
  const handleSubmit = () => {
    if (!validateForm()) return;
    if (!id) return;

    const message = processForm.conclusion === '通过'
      ? `确认将候选人 ${basicInfo.name} 的${stage}面试结果设为【通过】，并流转至【${processForm.next_stage}】阶段？`
      : processForm.conclusion === '待定'
      ? `确认将候选人 ${basicInfo.name} 的${stage}面试评价保存为【待定】？`
      : `确认将候选人 ${basicInfo.name} 的${stage}面试结果设为【淘汰】？`;

    setConfirmDialog({ open: true, message });
  };

  // 确认提交
  const handleConfirmSubmit = async () => {
    setConfirmDialog({ open: false, message: '' });
    if (!id) return;

    setSubmitting(true);
    try {
      await submitInterviewEvaluation(parseInt(id), {
        stage,
        interview_time: processForm.interview_time,
        personal_quality: {
          motivation_score: processForm.motivation_score,
          communication_score: processForm.communication_score,
          responsibility_score: processForm.responsibility_score,
          stability_score: processForm.stability_score,
        },
        work_ability: {
          score: processForm.work_ability_score,
          is_ai_referenced: processForm.is_ai_referenced,
          recording_id: processForm.recording_id || undefined,
        },
        conclusion: processForm.conclusion as '通过' | '淘汰' | '待定',
        comments: processForm.comments || undefined,
        next_stage: processForm.conclusion === '通过' ? processForm.next_stage : undefined,
        next_owner_id: processForm.conclusion === '通过' ? parseInt(processForm.next_owner_id) : undefined,
        rejection_reason: processForm.conclusion === '淘汰' ? processForm.rejection_reason : undefined,
      });

      showToast(processForm.conclusion === '待定' ? '面试评价已保存' : '面试评价提交成功');
      setTimeout(() => navigate('/todo/interview'), 1000);
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
          面试管理
        </span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900">{basicInfo.name || '候选人'}</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900">面试评价 - {stage}</span>
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
              <Badge variant="blue">{stage}</Badge>
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
                      label={`总分 / ${aiScore.total_score_max || 120}`}
                      showValue
                    />
                    <Gauge
                      value={aiScore.ai_score_main || 0}
                      maxValue={aiScore.main_score_max || 100}
                      size="small"
                      label={`主要分 / ${aiScore.main_score_max || 100}`}
                      showValue
                    />
                    <Gauge
                      value={aiScore.ai_score_bonus || 0}
                      maxValue={aiScore.bonus_score_max || 20}
                      size="small"
                      label={`加分项 / ${aiScore.bonus_score_max || 20}`}
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
        开始评价
      </Button>

      {/* 面试评价Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          close={false}
          className={`${sheetExpanded ? 'w-[calc(100%-2.5rem)] sm:max-w-[calc(100%-2.5rem)]' : 'w-[380px] sm:max-w-[380px]'} flex flex-col transition-all duration-300`}
        >
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-base">
                <span className="w-1 h-4 bg-blue-500 rounded"></span>
                流程处理 - {stage}面试评价
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

          <SheetBody className="flex-1 overflow-y-auto pr-1">
            <div className="space-y-4 pr-2">
              {/* 面试时间 */}
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1.5">
                  面试时间 <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 whitespace-nowrap">日期</span>
                    <DatePicker
                      date={interviewDate}
                      onDateChange={(date) => {
                        setInterviewDate(date);
                        if (date) {
                          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                          setProcessForm((prev) => ({
                            ...prev,
                            interview_time: `${dateStr}T${interviewTime}`,
                          }));
                        }
                      }}
                      placeholder="选择日期"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 whitespace-nowrap">时间</span>
                    <TimePicker
                      time={interviewTime}
                      onTimeChange={(time) => {
                        setInterviewTime(time);
                        if (interviewDate) {
                          const dateStr = `${interviewDate.getFullYear()}-${String(interviewDate.getMonth() + 1).padStart(2, '0')}-${String(interviewDate.getDate()).padStart(2, '0')}`;
                          setProcessForm((prev) => ({
                            ...prev,
                            interview_time: `${dateStr}T${time}`,
                          }));
                        }
                      }}
                      placeholder="选择时间"
                    />
                  </div>
                </div>
              </div>

              {/* 面试评分（100分）标题 */}
              <div className="border-t pt-3">
                <div className="text-sm font-medium text-gray-800 mb-3">
                  面试评分（100分）<span className="text-red-500">*</span>
                </div>

                {/* 1. 个人素养评分（20分） */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-700">1. 个人素养评分（20分）</span>
                    <span className="text-xs text-gray-500">
                      小计: <span className="font-medium text-blue-600">{personalQualityTotal}</span>/20
                    </span>
                  </div>
                  <div className={`border rounded-lg overflow-hidden transition-colors ${personalQualityShake ? 'animate-pq-shake border-red-500 ring-2 ring-red-400' : ''}`}>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                          <TableHead className="h-9 px-3 text-xs font-medium text-gray-600 w-20 border-r">评价项</TableHead>
                          <TableHead className="h-9 px-3 text-xs font-medium text-gray-600 border-r">评价要点</TableHead>
                          <TableHead className="h-9 px-3 text-xs font-medium text-gray-600 text-center w-14">分数</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {PERSONAL_QUALITY_ITEMS.map((item) => (
                          <TableRow key={item.key} className="hover:bg-gray-50/50">
                            <TableCell className="py-2.5 px-3 text-[11px] font-medium text-gray-700 align-middle text-center border-r whitespace-nowrap">
                              {item.label}
                            </TableCell>
                            <TableCell className="py-2.5 px-3 align-top border-r">
                              <ul className="list-disc list-inside text-[10px] text-gray-500 leading-relaxed space-y-0.5">
                                {item.points.map((point, idx) => (
                                  <li key={idx}>{point}</li>
                                ))}
                              </ul>
                            </TableCell>
                            <TableCell className="py-2.5 px-3 align-middle text-center">
                              <div className="inline-flex items-center border rounded-md overflow-hidden bg-white shadow-sm">
                                <input
                                  type="number"
                                  min={0}
                                  max={5}
                                  value={processForm[item.key as keyof ProcessForm] as number}
                                  onChange={(e) => updateScore(item.key as keyof ProcessForm, parseInt(e.target.value) || 0)}
                                  className="w-8 h-7 text-xs text-center border-none focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <div className="flex flex-col border-l">
                                  <button
                                    type="button"
                                    onClick={() => updateScore(item.key as keyof ProcessForm, (processForm[item.key as keyof ProcessForm] as number) + 1)}
                                    className="w-5 h-3.5 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                                  >
                                    <ChevronUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateScore(item.key as keyof ProcessForm, (processForm[item.key as keyof ProcessForm] as number) - 1)}
                                    className="w-5 h-3.5 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 border-t transition-colors"
                                  >
                                    <ChevronDown className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* 2. 工作能力评分（80分） */}
                <div className="mb-3">
                  <div className="mb-2">
                    <span className="text-xs font-medium text-gray-700">2. 工作能力评分（80分）</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex border rounded overflow-hidden">
                      <input
                        type="number"
                        min={0}
                        max={80}
                        value={processForm.work_ability_score}
                        onChange={(e) => updateScore('work_ability_score', parseInt(e.target.value) || 0)}
                        className="w-10 h-7 text-sm text-center border-none focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <div className="flex flex-col border-l">
                        <button
                          type="button"
                          onClick={() => updateScore('work_ability_score', processForm.work_ability_score + 1)}
                          className="w-5 h-3.5 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateScore('work_ability_score', processForm.work_ability_score - 1)}
                          className="w-5 h-3.5 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 border-t"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">/ 80</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReferenceAI}
                      disabled={loadingAiScore || !latestRecordingId}
                      className="h-7 text-xs px-4 ml-2"
                    >
                      {loadingAiScore ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                      )}
                      引用AI评价
                    </Button>
                    {processForm.is_ai_referenced && (
                      <Badge variant="turbo" size="sm" className="text-[10px]">已引用AI</Badge>
                    )}
                  </div>
                </div>

                {/* 面试总分 */}
                <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded">
                  <span className="text-xs font-medium text-gray-700">面试总分</span>
                  <span className="text-base font-bold text-blue-600">
                    {totalScore} <span className="text-xs font-normal text-gray-500">/ 100</span>
                  </span>
                </div>
              </div>

              {/* AI评价详情（引用后显示） */}
              {processForm.is_ai_referenced && aiInterviewScoreData && (
                <div className="border rounded-lg overflow-hidden mt-3">
                  <div
                    className="flex items-center justify-between px-2.5 py-1.5 bg-gradient-to-r from-amber-50 to-orange-50 cursor-pointer"
                    onClick={() => setAiEvaluationExpanded(!aiEvaluationExpanded)}
                  >
                    <div className="flex items-center gap-1.5">
                      <Badge variant="turbo" size="sm" className="text-[9px] px-1.5 py-0">AI</Badge>
                      <span className="text-[11px] font-medium text-gray-700">AI面试评价详情</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {aiEvaluationExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {aiEvaluationExpanded && (
                    <div className="p-3 space-y-3">
                      {/* 评分概览 - 三个圆圈 */}
                      <div className="flex items-center justify-center gap-6 pb-3 border-b border-gray-100">
                        <Gauge
                          value={aiInterviewScoreData.total_score || 0}
                          maxValue={aiInterviewScoreData.total_possible_score || 80}
                          size="small"
                          label={`总分 / ${aiInterviewScoreData.total_possible_score || 80}`}
                          showValue
                        />
                        <Gauge
                          value={aiInterviewScoreData.main_score || 0}
                          maxValue={aiInterviewScoreData.main_total_score || 80}
                          size="small"
                          label={`主要分 / ${aiInterviewScoreData.main_total_score || 80}`}
                          showValue
                        />
                        {(aiInterviewScoreData.bonus_total_score || 0) > 0 && (
                        <Gauge
                          value={aiInterviewScoreData.bonus_score || 0}
                          maxValue={aiInterviewScoreData.bonus_total_score || 0}
                          size="small"
                          label={`加分项 / ${aiInterviewScoreData.bonus_total_score || 0}`}
                          showValue
                        />
                        )}
                      </div>

                      {/* AI评价表格 */}
                      {(aiInterviewScoreData.overall_evaluation || aiInterviewScoreData.strengths || aiInterviewScoreData.improvements) && (
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <div className="flex justify-between items-center px-2.5 py-1.5 bg-gray-50 border-b border-gray-200">
                            <span className="text-xs font-medium text-gray-800">AI评价</span>
                          </div>
                          <div className="p-2">
                            <table className="w-full">
                              <thead>
                                <tr className="text-left text-[10px] text-gray-500">
                                  <th className="pb-1 font-medium w-16">评价</th>
                                  <th className="pb-1 font-medium">评价结果</th>
                                </tr>
                              </thead>
                              <tbody>
                                {aiInterviewScoreData.overall_evaluation && (
                                  <tr className="border-t border-gray-100">
                                    <td className="py-1.5 pr-2 text-[10px] text-gray-700 font-medium align-top">总体评价</td>
                                    <td className="py-1.5 text-[10px] text-gray-600 align-top leading-relaxed">
                                      {aiInterviewScoreData.overall_evaluation}
                                    </td>
                                  </tr>
                                )}
                                {aiInterviewScoreData.strengths && (
                                  <tr className="border-t border-gray-100">
                                    <td className="py-1.5 pr-2 text-[10px] text-gray-700 font-medium align-top">优势</td>
                                    <td className="py-1.5 text-[10px] text-gray-600 align-top leading-relaxed">
                                      {aiInterviewScoreData.strengths}
                                    </td>
                                  </tr>
                                )}
                                {aiInterviewScoreData.improvements && (
                                  <tr className="border-t border-gray-100">
                                    <td className="py-1.5 pr-2 text-[10px] text-gray-700 font-medium align-top">劣势</td>
                                    <td className="py-1.5 text-[10px] text-gray-600 align-top leading-relaxed">
                                      {aiInterviewScoreData.improvements}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* 维度详细评分 */}
                      {aiInterviewScoreData.dimensions && aiInterviewScoreData.dimensions.length > 0 ? (
                        <div className="space-y-2">
                          {aiInterviewScoreData.dimensions.map((dimension, dIndex) => (
                            <div key={dIndex} className="border border-gray-200 rounded-lg overflow-hidden">
                              {/* 维度标题 */}
                              <div className="flex justify-between items-center px-2.5 py-1.5 bg-gray-50 border-b border-gray-200">
                                <span className="text-xs font-medium text-gray-800">{dimension.dimension_name}</span>
                                <span className="text-xs text-gray-600">
                                  得分: <span
                                    className="font-semibold"
                                    style={{ color: getScoreColorByRatio(dimension.dimension_actual_score, dimension.dimension_total_score) }}
                                  >{dimension.dimension_actual_score}</span>
                                  <span className="text-gray-400"> / {dimension.dimension_total_score}</span>
                                </span>
                              </div>

                              {/* 指标表格 */}
                              <div className="p-2">
                                <table className="w-full">
                                  <thead>
                                    <tr className="text-left text-[10px] text-gray-500">
                                      <th className="pb-1 font-medium w-20">指标</th>
                                      <th className="pb-1 font-medium">评判理由</th>
                                      <th className="pb-1 font-medium w-14 text-right">得分</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {dimension.indicators?.map((indicator, iIndex) => (
                                      <tr key={iIndex} className="border-t border-gray-100">
                                        <td className="py-1.5 pr-2 text-[10px] text-gray-700 font-medium align-top">
                                          {indicator.indicator_name}
                                        </td>
                                        <td className="py-1.5 pr-2 text-[10px] text-gray-600 align-top">
                                          {indicator.reason}
                                        </td>
                                        <td className="py-1.5 text-[10px] text-right align-top">
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
                        <div className="text-center py-4 text-xs text-gray-400">暂无详细评分数据</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 面试结论 */}
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1.5">
                  面试结论 <span className="text-red-500">*</span>
                </label>
                <Select
                  value={processForm.conclusion}
                  onValueChange={(value) => handleConclusionChange(value as '通过' | '淘汰' | '待定')}
                >
                  <SelectTrigger className={`h-8 text-sm ${formErrors.conclusion ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="请选择面试结论" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="通过">通过</SelectItem>
                    <SelectItem value="待定">待定</SelectItem>
                    <SelectItem value="淘汰">淘汰</SelectItem>
                  </SelectContent>
                </Select>
                {formErrors.conclusion && (
                  <p className="mt-1 text-[10px] text-red-500">{formErrors.conclusion}</p>
                )}
              </div>

              {/* 通过时显示的字段 */}
              {processForm.conclusion === '通过' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1.5">
                      下一轮事件 <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={processForm.next_stage}
                      onValueChange={(value) => {
                        setProcessForm((prev) => ({ ...prev, next_stage: value }));
                        setFormErrors((prev) => ({ ...prev, next_stage: undefined }));
                      }}
                    >
                      <SelectTrigger className={`h-8 text-sm ${formErrors.next_stage ? 'border-red-500' : ''}`}>
                        <SelectValue placeholder="请选择下一轮事件" />
                      </SelectTrigger>
                      <SelectContent>
                        {getNextStageOptions(stage).map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formErrors.next_stage && (
                      <p className="mt-1 text-[10px] text-red-500">{formErrors.next_stage}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1.5">
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
                      className={`h-8 text-sm ${formErrors.next_owner_id ? 'border-red-500' : ''}`}
                    />
                    {formErrors.next_owner_id && (
                      <p className="mt-1 text-[10px] text-red-500">{formErrors.next_owner_id}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1.5">
                      评价意见
                    </label>
                    <Textarea
                      value={processForm.comments}
                      onChange={(e) => setProcessForm((prev) => ({ ...prev, comments: e.target.value }))}
                      placeholder="请输入评价意见（选填）"
                      rows={3}
                      className="text-sm"
                    />
                  </div>
                </>
              )}

              {/* 待定时显示的字段 */}
              {processForm.conclusion === '待定' && (
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1.5">
                    评价意见
                  </label>
                  <Textarea
                    value={processForm.comments}
                    onChange={(e) => setProcessForm((prev) => ({ ...prev, comments: e.target.value }))}
                    placeholder="请输入评价意见（选填）"
                    rows={3}
                    className="text-sm"
                  />
                </div>
              )}

              {/* 淘汰时显示的字段 */}
              {processForm.conclusion === '淘汰' && (
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1.5">
                    淘汰原因 <span className="text-red-500">*</span>
                  </label>
                  <Textarea
                    value={processForm.rejection_reason}
                    onChange={(e) => {
                      setProcessForm((prev) => ({ ...prev, rejection_reason: e.target.value }));
                      setFormErrors((prev) => ({ ...prev, rejection_reason: undefined }));
                    }}
                    placeholder="请输入淘汰原因"
                    rows={3}
                    className={`text-sm ${formErrors.rejection_reason ? 'border-red-500' : ''}`}
                  />
                  {formErrors.rejection_reason && (
                    <p className="mt-1 text-[10px] text-red-500">{formErrors.rejection_reason}</p>
                  )}
                </div>
              )}
            </div>
          </SheetBody>

          <SheetFooter className="border-t pt-3">
            <Button
              onClick={handleSubmit}
              disabled={submitting || !processForm.conclusion}
              className="w-full h-9 bg-blue-600 hover:bg-blue-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {processForm.conclusion === '待定' ? '保存中...' : '提交中...'}
                </>
              ) : (
                processForm.conclusion === '待定' ? '保存' : '提交'
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
              <div className="flex items-center gap-8 mb-6 pb-4 border-b border-gray-200">
                <Gauge
                  value={currentAiInterviewData.ai_interview_score_total || 0}
                  maxValue={currentAiInterviewData.ai_interview_evaluation?.total_possible_score || 80}
                  size="medium"
                  label={`总分 / ${currentAiInterviewData.ai_interview_evaluation?.total_possible_score || 80}`}
                  showValue
                />
                <Gauge
                  value={currentAiInterviewData.ai_interview_score_main || 0}
                  maxValue={currentAiInterviewData.ai_interview_evaluation?.main_total_score || 80}
                  size="medium"
                  label={`主要分 / ${currentAiInterviewData.ai_interview_evaluation?.main_total_score || 80}`}
                  showValue
                />
                {(currentAiInterviewData.ai_interview_evaluation?.bonus_total_score || 0) > 0 && (
                <Gauge
                  value={currentAiInterviewData.ai_interview_score_bonus || 0}
                  maxValue={currentAiInterviewData.ai_interview_evaluation?.bonus_total_score || 0}
                  size="medium"
                  label={`加分项 / ${currentAiInterviewData.ai_interview_evaluation?.bonus_total_score || 0}`}
                  showValue
                />
                )}
              </div>

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

      {/* 确认提交对话框 */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>确认提交</DialogTitle>
            <DialogDescription className="pt-2 text-sm text-gray-600 leading-relaxed">
              {confirmDialog.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false, message: '' })}>
              取消
            </Button>
            <Button onClick={handleConfirmSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export { InterviewProcessPage };
