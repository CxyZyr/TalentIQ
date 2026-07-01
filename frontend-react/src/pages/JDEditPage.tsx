import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Sparkles, Save, Send, Loader2, ArrowLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { DatePicker } from '../components/ui/date-picker';
import { getJDDetail, saveJD, publishJD, aiAssistWrite, JDData } from '../api/jd';
import { useDepartments } from '../hooks/useDepartments';

// 岗位级别
const JOB_LEVELS = ['专家', '高级', '中级', '初级'];

// 格式化文本 - 统一序号格式
const formatTextWithNumbers = (text: string): string => {
  if (!text || !text.trim()) return '';

  const lines = text.split('\n');
  const formattedLines: string[] = [];
  let number = 1;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // 移除已有的序号格式
    line = line.replace(/^[\d]+[.、)）]\s*/, '');
    line = line.replace(/^\([\d]+\)\s*/, '');
    line = line.replace(/^[·•-]\s*/, '');

    if (line) {
      formattedLines.push(`${number}. ${line}`);
      number++;
    }
  }

  return formattedLines.join('\n');
};

type AIFieldType = 'job_responsibilities' | 'hard_requirements' | 'other_requirements';

export function JDEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const jdId = id ? parseInt(id) : null;
  const { departmentNames: DEPARTMENTS } = useDepartments();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [aiLoading, setAiLoading] = useState<Record<AIFieldType, boolean>>({
    job_responsibilities: false,
    hard_requirements: false,
    other_requirements: false,
  });

  const [formData, setFormData] = useState<JDData>({
    job_title: '',
    industry: '',
    job_level: '',
    department: '',
    salary_range: '',
    headcount: 1,
    expected_onboard_date: '',
    job_responsibilities: '',
    hard_requirements: '',
    other_requirements: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // textarea refs
  const textareaRefs = {
    job_responsibilities: useRef<HTMLTextAreaElement>(null),
    hard_requirements: useRef<HTMLTextAreaElement>(null),
    other_requirements: useRef<HTMLTextAreaElement>(null),
  };

  // 加载 JD 详情
  useEffect(() => {
    const loadDetail = async () => {
      if (!jdId) {
        navigate('/jd/manage');
        return;
      }

      setLoading(true);
      try {
        const detail = await getJDDetail(jdId);
        setFormData({
          job_title: detail.job_title,
          industry: detail.industry || '',
          job_level: detail.job_level || '',
          department: detail.department,
          salary_range: detail.salary_range || '',
          headcount: detail.headcount || 1,
          expected_onboard_date: detail.expected_onboard_date || '',
          job_responsibilities: detail.job_responsibilities || '',
          hard_requirements: detail.hard_requirements || '',
          other_requirements: detail.other_requirements || '',
        });
        setIsPublished(detail.status === 'published');
      } catch (error) {
        console.error('加载 JD 详情失败:', error);
        showToast('加载 JD 详情失败', 'error');
        navigate('/jd/manage');
      } finally {
        setLoading(false);
      }
    };

    loadDetail();
  }, [jdId, navigate]);

  // 更新表单字段
  const updateField = useCallback((field: keyof JDData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // 清除该字段的错误
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [errors]);

  // 表单验证
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.job_title?.trim()) {
      newErrors.job_title = '请输入岗位名称';
    }
    if (!formData.department) {
      newErrors.department = '请选择所属部门';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 处理 textarea 聚焦 - 如果为空则添加第一个序号
  const handleTextareaFocus = (field: AIFieldType) => {
    if (!formData[field] || formData[field]?.trim() === '') {
      updateField(field, '1. ');
      // 光标移到末尾
      setTimeout(() => {
        const textarea = textareaRefs[field].current;
        if (textarea) {
          textarea.selectionStart = textarea.selectionEnd = 3;
        }
      }, 0);
    }
  };

  // 处理键盘按下事件 - 自动添加序号
  const handleTextareaKeydown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    field: AIFieldType
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      const textarea = e.target as HTMLTextAreaElement;
      const cursorPos = textarea.selectionStart;
      const text = formData[field] || '';

      // 获取当前行内容
      const textBeforeCursor = text.substring(0, cursorPos);
      const textAfterCursor = text.substring(cursorPos);
      const lines = textBeforeCursor.split('\n');
      const currentLine = lines[lines.length - 1];

      // 如果当前行只有序号没有内容，删除序号并结束
      const emptyNumberMatch = currentLine.match(/^\d+\.\s*$/);
      if (emptyNumberMatch) {
        // 删除当前空序号行
        lines.pop();
        const newText = lines.join('\n') + (lines.length > 0 ? '\n' : '') + textAfterCursor;
        updateField(field, newText);
        setTimeout(() => {
          const newPos = lines.join('\n').length + (lines.length > 0 ? 1 : 0);
          textarea.selectionStart = textarea.selectionEnd = newPos;
        }, 0);
        return;
      }

      // 计算下一个序号
      const allLines = text.split('\n');
      let maxNumber = 0;
      for (const line of allLines) {
        const match = line.match(/^(\d+)\./);
        if (match) {
          maxNumber = Math.max(maxNumber, parseInt(match[1]));
        }
      }
      const nextNumber = maxNumber + 1;

      // 插入换行和新序号
      const newText = textBeforeCursor + '\n' + nextNumber + '. ' + textAfterCursor;
      updateField(field, newText);

      // 设置光标位置
      setTimeout(() => {
        const newCursorPos = cursorPos + 1 + String(nextNumber).length + 2;
        textarea.selectionStart = textarea.selectionEnd = newCursorPos;
      }, 0);
    }
  };

  // AI 帮写
  const handleAIAssist = async (field: AIFieldType) => {
    // 检查必填字段
    if (!formData.job_title?.trim()) {
      setErrors((prev) => ({ ...prev, job_title: '请先填写岗位名称' }));
      return;
    }
    if (!formData.department) {
      setErrors((prev) => ({ ...prev, department: '请先选择所属部门' }));
      return;
    }

    setAiLoading((prev) => ({ ...prev, [field]: true }));

    try {
      const response = await aiAssistWrite({
        jd_info: formData,
        output_mode: field,
      });

      // 清空当前字段
      updateField(field, '');

      // 读取流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                accumulatedText += data.content;
                updateField(field, accumulatedText);
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      // AI 生成完成后，统一格式化序号
      const formattedText = formatTextWithNumbers(accumulatedText);
      updateField(field, formattedText);
    } catch (error) {
      console.error('AI 生成失败:', error);
      showToast('AI 生成失败，请重试', 'error');
    } finally {
      setAiLoading((prev) => ({ ...prev, [field]: false }));
    }
  };

  // 保存草稿
  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      await saveJD({ id: jdId || undefined, jd_data: formData });
      showToast('保存成功');
      setTimeout(() => navigate('/jd/manage'), 1000);
    } catch (error) {
      console.error('保存失败:', error);
      showToast('保存失败，请重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 发布
  const handlePublish = async () => {
    if (!validateForm()) return;

    setPublishing(true);
    try {
      await publishJD({ id: jdId || undefined, jd_data: formData });
      showToast('发布成功');
      setTimeout(() => navigate('/jd/manage'), 1000);
    } catch (error) {
      console.error('发布失败:', error);
      showToast('发布失败，请重试', 'error');
    } finally {
      setPublishing(false);
    }
  };

  // 渲染带 AI 帮写按钮的文本域
  const renderTextareaWithAI = (
    field: AIFieldType,
    label: string,
    placeholder: string
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          onClick={() => handleAIAssist(field)}
          disabled={aiLoading[field]}
        >
          {aiLoading[field] ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-1" />
          )}
          AI帮写
        </Button>
      </div>
      <Textarea
        ref={textareaRefs[field]}
        value={formData[field] || ''}
        onChange={(e) => updateField(field, e.target.value)}
        onFocus={() => handleTextareaFocus(field)}
        onKeyDown={(e) => handleTextareaKeydown(e, field)}
        placeholder={placeholder}
        rows={14}
        className="font-mono"
      />
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-y-auto flex-1 min-h-0">
      {/* 面包屑导航 */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/jd/manage" className="hover:text-gray-700">
          JD管理
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900">编辑JD</span>
      </nav>

      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold text-slate-900">编辑JD</h1>
        </div>
        <div className="flex gap-3">
          {/* 保存草稿按钮：仅草稿状态显示 */}
          {!isPublished && (
            <button
              className="px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              保存草稿
            </button>
          )}
          <button
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-50 shadow-sm shadow-black/5"
            onClick={handlePublish}
            disabled={publishing}
          >
            {publishing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {isPublished ? '重新发布' : '发布'}
          </button>
        </div>
      </div>

      {/* 基本信息卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">基本信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 岗位名称 */}
            <div className="space-y-2">
              <Label htmlFor="job_title">
                岗位名称 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="job_title"
                value={formData.job_title}
                onChange={(e) => updateField('job_title', e.target.value)}
                placeholder="请输入岗位名称"
                className={errors.job_title ? 'border-red-500' : ''}
              />
              {errors.job_title && (
                <p className="text-sm text-red-500">{errors.job_title}</p>
              )}
            </div>

            {/* 所属行业 */}
            <div className="space-y-2">
              <Label htmlFor="industry">所属行业</Label>
              <Input
                id="industry"
                value={formData.industry || ''}
                onChange={(e) => updateField('industry', e.target.value)}
                placeholder="请输入所属行业"
              />
            </div>

            {/* 岗位级别 */}
            <div className="space-y-2">
              <Label>岗位级别</Label>
              <Select
                value={formData.job_level || ''}
                onValueChange={(value) => updateField('job_level', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择岗位级别" />
                </SelectTrigger>
                <SelectContent>
                  {JOB_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 所属部门 */}
            <div className="space-y-2">
              <Label>
                所属部门 <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.department}
                onValueChange={(value) => updateField('department', value)}
              >
                <SelectTrigger className={errors.department ? 'border-red-500' : ''}>
                  <SelectValue placeholder="请选择所属部门" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.department && (
                <p className="text-sm text-red-500">{errors.department}</p>
              )}
            </div>

            {/* 薪资范围 */}
            <div className="space-y-2">
              <Label htmlFor="salary_range">薪资范围</Label>
              <Input
                id="salary_range"
                value={formData.salary_range || ''}
                onChange={(e) => updateField('salary_range', e.target.value)}
                placeholder="例如：15K-25K"
              />
            </div>

            {/* 招聘人数 */}
            <div className="space-y-2">
              <Label htmlFor="headcount">招聘人数</Label>
              <Input
                id="headcount"
                type="number"
                min={1}
                max={100}
                value={formData.headcount || 1}
                onChange={(e) => updateField('headcount', parseInt(e.target.value) || 1)}
              />
            </div>

            {/* 期望到岗时间 */}
            <div className="space-y-2">
              <Label>期望到岗时间</Label>
              <DatePicker
                date={formData.expected_onboard_date ? new Date(formData.expected_onboard_date) : undefined}
                onDateChange={(date) =>
                  updateField(
                    'expected_onboard_date',
                    date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : ''
                  )
                }
                placeholder="请选择期望到岗时间"
                className="w-full h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 岗位职责卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">岗位职责</CardTitle>
        </CardHeader>
        <CardContent>
          {renderTextareaWithAI(
            'job_responsibilities',
            '岗位职责',
            '请输入岗位职责，按Enter自动添加序号'
          )}
        </CardContent>
      </Card>

      {/* 任职资格卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">任职资格</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {renderTextareaWithAI(
            'hard_requirements',
            '硬性条件',
            '请输入硬性条件，按Enter自动添加序号'
          )}
          {renderTextareaWithAI(
            'other_requirements',
            '其他要求',
            '请输入其他要求，按Enter自动添加序号'
          )}
        </CardContent>
      </Card>

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
}
