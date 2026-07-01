import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import { useUserStore } from '../stores/userStore';
import { useToast } from '../components/ui/toast';
import {
  getCandidateCompleteInfo,
  updateCandidate,
  updateCandidateResume,
  getInterviewQA,
  getUserList,
  UserInfo,
} from '../api/candidate';
import { hrTerminateProcess, rollbackTerminatedCandidate, transferTodo } from '../api/stageFlow';
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
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Gauge } from '../components/ui/gauge';
import { SearchableSelect } from '../components/ui/searchable-select';

// 类型定义
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
  current_stage_owner?: number;
  current_stage_owner_name?: string;
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
  淘汰原因?: string;
  has_qa?: boolean;
  面试时间?: string;
  评价时间?: string;
  // AI面试评分
  ai_interview_score_total?: number;
  ai_interview_score_main?: number;
  ai_interview_score_bonus?: number;
  ai_interview_evaluation?: AIInterviewEvaluation;
  ai_comprehensive_evaluation?: string;
  ai_strengths?: string;
  ai_weaknesses?: string;
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

interface RollbackInfo {
  source_stage: string;
  source_owner_id: number;
  source_owner_name: string;
}

interface QAPair {
  question: string;
  answer: string;
}

const TRANSFER_STAGE_ORDER = ['简历筛选', '一面', '二面', '三面', '谈薪&背调'];
const INTERVIEW_STAGES = new Set(['一面', '二面', '三面']);
const TRANSFER_STAGE_DEFAULT = '__CURRENT__';

const CandidateDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useUserStore();
  const resumeInputRef = useRef<HTMLInputElement>(null);

  // 状态
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [hardReqExpanded, setHardReqExpanded] = useState(false);
  const [aiScoreExpanded, setAiScoreExpanded] = useState(false);

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

  // 面试问答弹窗
  const [qaDialogVisible, setQaDialogVisible] = useState(false);
  const [loadingQA, setLoadingQA] = useState(false);
  const [qaList, setQaList] = useState<QAPair[]>([]);
  const [currentQAStage, setCurrentQAStage] = useState('');

  // AI面试评分弹窗
  const [aiInterviewDialogVisible, setAiInterviewDialogVisible] = useState(false);
  const [currentAiInterviewData, setCurrentAiInterviewData] = useState<Interview | null>(null);

  // 编辑表单
  const [editForm, setEditForm] = useState({
    name: '',
    age: '' as string | number,
    work_status: '',
    work_years: '' as string | number,
    expected_salary: '',
    highest_education: '',
    school: '',
    privacy_info: '',
  });

  // 权限判断
  const isHR = user?.role === 'HR' || user?.role === 'CEO';
  const isHROnly = user?.role === 'HR';
  const canViewPrivacy = user?.role === 'HR' || user?.role === 'CEO';

  // HR操作 - 异常终止
  const [terminateDialogVisible, setTerminateDialogVisible] = useState(false);
  const [terminateReason, setTerminateReason] = useState('');
  const [terminateLoading, setTerminateLoading] = useState(false);
  const [terminationInfo, setTerminationInfo] = useState<{
    stage: string;
    termination_reason: string;
    operator_name: string;
    terminated_at: string;
  } | null>(null);
  const [rollbackInfo, setRollbackInfo] = useState<RollbackInfo | null>(null);
  const [rollbackDialogVisible, setRollbackDialogVisible] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState(false);

  // HR操作 - 待办转交
  const [transferDialogVisible, setTransferDialogVisible] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<number | null>(null);
  const [transferTargetStage, setTransferTargetStage] = useState('');
  const [userList, setUserList] = useState<UserInfo[]>([]);

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

  // 阶段结果标签颜色
  const getResultTagStyle = (result?: string) => {
    const styleMap: Record<string, string> = {
      '待处理': 'bg-gray-100 text-gray-600',
      '通过': 'bg-green-100 text-green-600',
      '不通过': 'bg-red-100 text-red-600',
    };
    return styleMap[result || ''] || 'bg-gray-100 text-gray-600';
  };

  // 谈薪/背调状态标签颜色
  const getNegotiationTagStyle = (status?: string) => {
    const styleMap: Record<string, string> = {
      '未完成': 'bg-gray-100 text-gray-600',
      '已完成': 'bg-green-100 text-green-600',
      '进行中': 'bg-yellow-100 text-yellow-600',
    };
    return styleMap[status || ''] || 'bg-gray-100 text-gray-600';
  };

  // OFFER状态标签颜色
  const getOfferTagStyle = (status?: string) => {
    const styleMap: Record<string, string> = {
      '待发放': 'bg-gray-100 text-gray-600',
      '已发放': 'bg-yellow-100 text-yellow-600',
      '已回签': 'bg-green-100 text-green-600',
      '已拒绝': 'bg-red-100 text-red-600',
      '自主放弃': 'bg-red-100 text-red-600',
    };
    return styleMap[status || ''] || 'bg-gray-100 text-gray-600';
  };

  // AI评分颜色（基于绝对分数）
  const getScoreColor = (score?: number) => {
    if (!score) return '#909399';
    if (score >= 80) return '#67C23A';
    if (score >= 60) return '#409EFF';
    return '#F56C6C';
  };

  // 按比例获取得分颜色（与圆环一致）
  const getScoreColorByRatio = (actual: number, total: number) => {
    if (!total || total === 0) return '#909399';
    const percentage = (actual / total) * 100;
    if (percentage >= 80) return '#22c55e';  // green
    if (percentage >= 60) return '#3b82f6';  // blue
    if (percentage >= 40) return '#f59e0b';  // amber
    return '#ef4444';  // red
  };

  // 获取得分率
  const getScoreRate = () => {
    if (!aiScoreDetail || !aiScoreDetail.dimensions) return '0%';
    let totalScore = 0;
    let actualScore = 0;
    aiScoreDetail.dimensions.forEach((d) => {
      totalScore += d.dimension_total_score || 0;
      actualScore += d.dimension_actual_score || 0;
    });
    if (totalScore === 0) return '0%';
    return Math.round((actualScore / totalScore) * 100) + '%';
  };

  // 获取硬性条件通过数量
  const getHardReqPassCount = () => {
    if (!hardRequirementsData || !hardRequirementsData.assessments) return 0;
    return hardRequirementsData.assessments.filter((a) => a.passed).length;
  };

  const getTransferStageOptions = () => {
    if (!basicInfo.current_stage) return [] as string[];
    const currentIndex = TRANSFER_STAGE_ORDER.indexOf(basicInfo.current_stage);
    if (currentIndex === -1) return [] as string[];
    if (basicInfo.current_stage === '谈薪&背调') return ['谈薪&背调'];
    return TRANSFER_STAGE_ORDER.slice(currentIndex);
  };

  const isForwardTransferFromPendingInterview = () => {
    return (
      INTERVIEW_STAGES.has(basicInfo.current_stage || '') &&
      basicInfo.current_stage_result === '待定' &&
      !!transferTargetStage &&
      transferTargetStage !== basicInfo.current_stage
    );
  };

  // 加载候选人完整信息
  const loadCandidateCompleteInfo = async () => {
    if (!id) {
      navigate('/candidate/list');
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

      // 异常终止信息
      setTerminationInfo(data['异常终止'] || null);
      setRollbackInfo(data['回退信息'] || null);

      // 如果URL带edit=true，数据加载后直接进入编辑状态
      if (searchParams.get('edit') === 'true' && (user?.role === 'HR' || user?.role === 'CEO')) {
        const info = data['基本信息'] || {};
        const privacy = data['隐私信息'] || '';
        setEditForm({
          name: info.name || '',
          age: info.age || '',
          work_status: info.work_status || '',
          work_years: info.work_years || '',
          expected_salary: info.expected_salary || '',
          highest_education: info.highest_education || '',
          school: info.school || '',
          privacy_info: privacy || '',
        });
        setIsEditing(true);
      }
    } catch (error) {
      console.error('加载候选人完整信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 开始编辑
  const startEdit = () => {
    setEditForm({
      name: basicInfo.name || '',
      age: basicInfo.age || '',
      work_status: basicInfo.work_status || '',
      work_years: basicInfo.work_years || '',
      expected_salary: basicInfo.expected_salary || '',
      highest_education: basicInfo.highest_education || '',
      school: basicInfo.school || '',
      privacy_info: privacyInfo || '',
    });
    setIsEditing(true);
  };

  // 保存编辑
  const saveEdit = async () => {
    if (!id) return;
    try {
      setLoading(true);
      await updateCandidate(parseInt(id), {
        name: editForm.name,
        age: editForm.age ? Number(editForm.age) : undefined,
        work_status: editForm.work_status,
        work_years: editForm.work_years ? Number(editForm.work_years) : undefined,
        expected_salary: editForm.expected_salary,
        highest_education: editForm.highest_education,
        school: editForm.school,
        privacy_info: editForm.privacy_info,
      });
      setIsEditing(false);
      await loadCandidateCompleteInfo();
      showToast('修改成功');
    } catch (error) {
      console.error('保存失败:', error);
      showToast('保存失败，请重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 取消编辑
  const cancelEdit = () => {
    setIsEditing(false);
  };

  // HR操作 - 异常终止
  const handleTerminate = async () => {
    if (!terminateReason.trim()) {
      showToast('请填写终止原因', 'error');
      return;
    }
    if (!id) return;
    setTerminateLoading(true);
    try {
      await hrTerminateProcess(Number(id), terminateReason.trim());
      showToast('流程已终止');
      setTerminateDialogVisible(false);
      setTerminateReason('');
      await loadCandidateCompleteInfo();
    } catch (error: any) {
      const msg = error?.response?.data?.detail || '终止流程失败';
      showToast(msg, 'error');
    } finally {
      setTerminateLoading(false);
    }
  };

  const canRollbackTerminatedCandidate = !isEditing && basicInfo.current_stage === '终止流程' && !!rollbackInfo && (user?.role === 'HR' || user?.id === basicInfo.current_stage_owner);

  const handleRollback = async () => {
    if (!id) return;
    setRollbackLoading(true);
    try {
      await rollbackTerminatedCandidate(Number(id));
      showToast('候选人已回退到上一环节');
      setRollbackDialogVisible(false);
      await loadCandidateCompleteInfo();
    } catch (error: any) {
      const msg = error?.response?.data?.detail || '回退失败';
      showToast(msg, 'error');
    } finally {
      setRollbackLoading(false);
    }
  };

  // HR操作 - 待办转交
  const openTransferDialog = async () => {
    try {
      const res = await getUserList();
      const list = (res as any)?.data || res || [];
      setUserList(Array.isArray(list) ? list : []);
    } catch {
      showToast('获取用户列表失败', 'error');
      return;
    }
    setTransferTargetId(null);
    setTransferTargetStage('');
    setTransferDialogVisible(true);
  };

  const handleTransfer = async () => {
    if (!transferTargetId || !id) {
      showToast('请选择新负责人', 'error');
      return;
    }
    setTransferLoading(true);
    try {
      await transferTodo(Number(id), transferTargetId, transferTargetStage || undefined);
      showToast(transferTargetStage ? '待办转交并更新环节成功' : '待办转交成功');
      setTransferDialogVisible(false);
      setTransferTargetStage('');
      await loadCandidateCompleteInfo();
    } catch (error: any) {
      const msg = error?.response?.data?.detail || '转交失败';
      showToast(msg, 'error');
    } finally {
      setTransferLoading(false);
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
    navigate('/candidate/list');
  };

  useEffect(() => {
    loadCandidateCompleteInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 编辑模式的自动进入已在 loadCandidateCompleteInfo 中直接处理

  return (
    <div className="h-full p-5 overflow-auto bg-gray-50">
      {/* 面包屑导航 */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-5">
        <span className="hover:text-gray-700 cursor-pointer" onClick={handleBack}>
          候选人管理
        </span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900">{basicInfo.name || '候选人'}</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900">{isEditing ? '编辑' : '查看'}</span>
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
              <div className="flex gap-2">
                {isHROnly && !isEditing && basicInfo.current_stage !== '终止流程' && basicInfo.current_stage && (
                  <>
                    <button
                      className="min-w-[88px] h-8 px-3 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors shadow-sm shadow-black/5 flex items-center justify-center whitespace-nowrap"
                      onClick={() => setTerminateDialogVisible(true)}
                    >
                      终止流程
                    </button>
                    <button
                      className="min-w-[88px] h-8 px-3 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm shadow-black/5 flex items-center justify-center whitespace-nowrap"
                      onClick={openTransferDialog}
                    >
                      转交
                    </button>
                  </>
                )}
                {canRollbackTerminatedCandidate && (
                  <button
                    className="min-w-[88px] h-8 px-3 text-sm bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors shadow-sm shadow-black/5 flex items-center justify-center whitespace-nowrap"
                    onClick={() => setRollbackDialogVisible(true)}
                  >
                    状态回退
                  </button>
                )}
                {isHR && !isEditing && (
                  <button
                    className="min-w-[88px] h-8 px-3 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm shadow-black/5 flex items-center justify-center whitespace-nowrap"
                    onClick={startEdit}
                  >
                    编辑
                  </button>
                )}
                {isEditing && (
                  <>
                    <button
                      className="min-w-[88px] h-8 px-3 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm shadow-black/5 flex items-center justify-center whitespace-nowrap"
                      onClick={saveEdit}
                    >
                      保存
                    </button>
                    <button
                      className="min-w-[88px] h-8 px-3 text-sm bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors flex items-center justify-center whitespace-nowrap"
                      onClick={cancelEdit}
                    >
                      取消
                    </button>
                  </>
                )}
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
                    {isEditing ? (
                      <input
                        type="text"
                        className="w-full min-h-8 px-3 py-1.5 bg-white border-2 border-blue-400 rounded text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      />
                    ) : (
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.name || '-'}
                      </div>
                    )}
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
                    {isEditing ? (
                      <input
                        type="number"
                        className="w-full min-h-8 px-3 py-1.5 bg-white border-2 border-blue-400 rounded text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                        value={editForm.age}
                        onChange={(e) => setEditForm({ ...editForm, age: e.target.value })}
                      />
                    ) : (
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.age || '-'}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-2">职场状态</label>
                    {isEditing ? (
                      <Select
                        value={editForm.work_status}
                        onValueChange={(value) => setEditForm({ ...editForm, work_status: value })}
                      >
                        <SelectTrigger className="w-full min-h-8 px-3 py-1.5 bg-white border-2 border-blue-400 text-sm text-gray-700 focus:border-blue-500">
                          <SelectValue placeholder="请选择" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="在职，正在找工作">在职，正在找工作</SelectItem>
                          <SelectItem value="在职，暂不考虑">在职，暂不考虑</SelectItem>
                          <SelectItem value="离职，正在找工作">离职，正在找工作</SelectItem>
                          <SelectItem value="应届毕业生">应届毕业生</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.work_status || '-'}
                      </div>
                    )}
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
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          className="flex-1 min-h-8 px-3 py-1.5 bg-white border-2 border-blue-400 rounded text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                          value={editForm.work_years}
                          onChange={(e) => setEditForm({ ...editForm, work_years: e.target.value })}
                        />
                        <span className="text-sm text-gray-700">年</span>
                      </div>
                    ) : (
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.work_years ? `${basicInfo.work_years}年` : '-'}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-2">期望薪资</label>
                    {isEditing ? (
                      <input
                        type="text"
                        className="w-full min-h-8 px-3 py-1.5 bg-white border-2 border-blue-400 rounded text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                        value={editForm.expected_salary}
                        onChange={(e) => setEditForm({ ...editForm, expected_salary: e.target.value })}
                      />
                    ) : (
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.expected_salary || '-'}
                      </div>
                    )}
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
                    {isEditing ? (
                      <Select
                        value={editForm.highest_education}
                        onValueChange={(value) => setEditForm({ ...editForm, highest_education: value })}
                      >
                        <SelectTrigger className="w-full min-h-8 px-3 py-1.5 bg-white border-2 border-blue-400 text-sm text-gray-700 focus:border-blue-500">
                          <SelectValue placeholder="请选择" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="高中">高中</SelectItem>
                          <SelectItem value="大专">大专</SelectItem>
                          <SelectItem value="本科">本科</SelectItem>
                          <SelectItem value="硕士">硕士</SelectItem>
                          <SelectItem value="博士">博士</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.highest_education || '-'}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-2 flex items-center gap-1">
                      学校
                      {basicInfo.is_985 && (
                        <Badge variant="red" size="sm">985</Badge>
                      )}
                      {basicInfo.is_211 && (
                        <Badge variant="pink" size="sm">211</Badge>
                      )}
                      {basicInfo.is_double_first_class && (
                        <Badge variant="green" size="sm">双一流</Badge>
                      )}
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        className="w-full min-h-8 px-3 py-1.5 bg-white border-2 border-blue-400 rounded text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                        value={editForm.school}
                        onChange={(e) => setEditForm({ ...editForm, school: e.target.value })}
                      />
                    ) : (
                      <div className="min-h-8 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                        {basicInfo.school || '-'}
                      </div>
                    )}
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
                  isEditing ? (
                    <textarea
                      className="w-full px-4 py-3 bg-white border-2 border-blue-400 rounded text-sm text-gray-700 leading-relaxed resize-none focus:outline-none focus:border-blue-500"
                      rows={2}
                      value={editForm.privacy_info}
                      onChange={(e) => setEditForm({ ...editForm, privacy_info: e.target.value })}
                      placeholder="请输入隐私信息"
                    />
                  ) : (
                    <div className="px-4 py-3 bg-white border border-gray-200 rounded text-sm leading-relaxed min-h-10">
                      {privacyInfo ? (
                        <span className="text-gray-700">{privacyInfo}</span>
                      ) : (
                        <span className="text-gray-400">暂无隐私信息</span>
                      )}
                    </div>
                  )
                ) : (
                  <div className="px-4 py-3 bg-white border border-gray-200 rounded text-sm text-gray-400 leading-relaxed min-h-10">
                    * * * * * *
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 终止信息 */}
          {terminationInfo && (
            <div className="bg-white rounded-md border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
                <span className="w-1 h-4 bg-blue-500 rounded"></span>
                <span className="text-base font-medium text-gray-800">流程终止信息</span>
              </div>
              <div className="p-5">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 w-24">操作人</th>
                        <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-24">终止阶段</th>
                        <th className="px-3 py-3 text-center text-sm font-medium text-gray-600 w-40">终止时间</th>
                        <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 min-w-[300px]">终止原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100">
                        <td className="px-3 py-4 text-sm text-gray-700 font-medium">
                          {terminationInfo.operator_name || '-'}
                        </td>
                        <td className="px-3 py-4 text-center text-sm text-gray-700">
                          {terminationInfo.stage || '-'}
                        </td>
                        <td className="px-3 py-4 text-center text-sm text-gray-500">
                          {terminationInfo.terminated_at ? new Date(terminationInfo.terminated_at).toLocaleString('zh-CN') : '-'}
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-700">
                          {terminationInfo.termination_reason || '-'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

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
                      {/* 维度标题 */}
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

                      {/* 指标表格 */}
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
                                variant={row.状态 === '通过' ? 'green' : row.状态 === '不通过' ? 'red' : row.状态 === '待定' ? 'warning' : 'gray'}
                                size="md"
                              >
                                {row.状态 === '不通过' ? '淘汰' : row.状态}
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
                            {row.状态 === '不通过' ? (
                              row.淘汰原因 ? (
                                <div className="whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                                  {row.淘汰原因}
                                </div>
                              ) : <span className="text-gray-400">-</span>
                            ) : (
                              row.面试评价 ? (
                                <div className="whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                                  {row.面试评价}
                                </div>
                              ) : <span className="text-gray-400">-</span>
                            )}
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
            <div className="flex-1 overflow-y-auto py-4 pr-2">
              {/* 评分概览 */}
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

              {/* AI评价表格 */}
              {(currentAiInterviewData.ai_comprehensive_evaluation || currentAiInterviewData.ai_strengths || currentAiInterviewData.ai_weaknesses) && (
                <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                  <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <span className="font-medium text-gray-800">AI评价</span>
                  </div>
                  <div className="p-4">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-sm text-gray-500">
                          <th className="pb-2 font-medium w-32">评价</th>
                          <th className="pb-2 font-medium">评价结果</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentAiInterviewData.ai_comprehensive_evaluation && (
                          <tr className="border-t border-gray-100">
                            <td className="py-3 pr-4 text-sm text-gray-700 font-medium align-top">总体评价</td>
                            <td className="py-3 text-sm text-gray-600 align-top leading-relaxed">
                              {currentAiInterviewData.ai_comprehensive_evaluation}
                            </td>
                          </tr>
                        )}
                        {currentAiInterviewData.ai_strengths && (
                          <tr className="border-t border-gray-100">
                            <td className="py-3 pr-4 text-sm text-gray-700 font-medium align-top">优势</td>
                            <td className="py-3 text-sm text-gray-600 align-top leading-relaxed">
                              {currentAiInterviewData.ai_strengths}
                            </td>
                          </tr>
                        )}
                        {currentAiInterviewData.ai_weaknesses && (
                          <tr className="border-t border-gray-100">
                            <td className="py-3 pr-4 text-sm text-gray-700 font-medium align-top">劣势</td>
                            <td className="py-3 text-sm text-gray-600 align-top leading-relaxed">
                              {currentAiInterviewData.ai_weaknesses}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 维度详细评分 */}
              {currentAiInterviewData.ai_interview_evaluation?.dimensions && currentAiInterviewData.ai_interview_evaluation.dimensions.length > 0 ? (
                <div className="space-y-4">
                  {currentAiInterviewData.ai_interview_evaluation.dimensions.map((dimension, dIndex) => (
                    <div key={dIndex} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* 维度标题 */}
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

                      {/* 指标表格 */}
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

      {/* HR异常终止对话框 */}
      <Dialog open={terminateDialogVisible} onOpenChange={setTerminateDialogVisible}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>终止流程</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-600">
              确定要终止 <span className="font-medium text-gray-900">{basicInfo.name}</span> 的招聘流程吗？此操作不可撤销。
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">终止原因 <span className="text-red-500">*</span></label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                rows={3}
                placeholder="请填写终止原因..."
                value={terminateReason}
                onChange={(e) => setTerminateReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                onClick={() => { setTerminateDialogVisible(false); setTerminateReason(''); }}
              >
                取消
              </button>
              <button
                className="px-4 py-2 text-sm text-white bg-red-500 rounded hover:bg-red-600 disabled:opacity-50"
                onClick={handleTerminate}
                disabled={terminateLoading || !terminateReason.trim()}
              >
                {terminateLoading ? '处理中...' : '确认终止'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rollbackDialogVisible} onOpenChange={setRollbackDialogVisible}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>状态回退</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-600">
              确定要将 <span className="font-medium text-gray-900">{basicInfo.name}</span> 从终止流程回退到上一环节吗？
            </p>
            <div className="bg-gray-50 rounded-md p-4 space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">上一环节</span>
                <span className="text-gray-900 font-medium">{rollbackInfo?.source_stage || '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">恢复负责人</span>
                <span className="text-gray-900 font-medium">{rollbackInfo?.source_owner_name || '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">回退后状态</span>
                <span className="text-gray-900 font-medium">待处理</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                onClick={() => setRollbackDialogVisible(false)}
              >
                取消
              </button>
              <button
                className="px-4 py-2 text-sm text-white bg-amber-500 rounded hover:bg-amber-600 disabled:opacity-50"
                onClick={handleRollback}
                disabled={rollbackLoading || !rollbackInfo}
              >
                {rollbackLoading ? '处理中...' : '确认回退'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* HR待办转交对话框 */}
      <Dialog open={transferDialogVisible} onOpenChange={setTransferDialogVisible}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>转交待办</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* 当前信息展示 */}
            <div className="bg-gray-50 rounded-md p-4 space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">候选人</span>
                <span className="text-gray-900 font-medium">{basicInfo.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">当前负责人</span>
                <span className="text-gray-900 font-medium">{basicInfo.current_stage_owner_name || '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">当前流程</span>
                <span className="text-gray-900 font-medium">{basicInfo.current_stage || '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">流程状态</span>
                <span className="text-gray-900 font-medium">{basicInfo.current_stage_result || '-'}</span>
              </div>
            </div>

            {/* 新负责人选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">新负责人 <span className="text-red-500">*</span></label>
              <SearchableSelect
                options={userList.map((u) => ({
                  value: String(u.id),
                  label: `${u.id}-${u.real_name || u.username}${u.department ? `（${u.department}）` : ''}`,
                }))}
                value={transferTargetId ? String(transferTargetId) : ''}
                onValueChange={(val) => setTransferTargetId(Number(val))}
                placeholder="请选择负责人"
                searchPlaceholder="搜索ID、姓名或部门"
                emptyText="没有匹配的负责人"
              />
            </div>

            {/* 转交环节选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">转交环节</label>
              <Select
                value={transferTargetStage || TRANSFER_STAGE_DEFAULT}
                onValueChange={(value) => setTransferTargetStage(value === TRANSFER_STAGE_DEFAULT ? '' : value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="不选择则默认当前环节，仅转交负责人" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TRANSFER_STAGE_DEFAULT}>仅转交负责人（默认当前环节）</SelectItem>
                  {getTransferStageOptions().map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stage}{stage === basicInfo.current_stage ? '（当前环节）' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-gray-500">
                只允许选择当前及后续环节；谈薪阶段仅支持同环节转交。
              </p>
              {isForwardTransferFromPendingInterview() && (
                <p className="mt-1 text-xs text-amber-600">
                  当前面试状态为待定，转交到后续环节后将默认按通过处理，并清除当前待办。
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                onClick={() => {
                  setTransferDialogVisible(false);
                  setTransferTargetStage('');
                }}
              >
                取消
              </button>
              <button
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                onClick={handleTransfer}
                disabled={transferLoading || !transferTargetId}
              >
                {transferLoading ? '处理中...' : '确认转交'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast 通知 */}
    </div>
  );
};

export default CandidateDetailPage;
