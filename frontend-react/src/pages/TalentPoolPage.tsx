import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  RotateCcw,
  Trash2,
  Loader2,
  User,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { SearchableSelect } from '../components/ui/searchable-select';
import { MultiSelectCombobox } from '../components/ui/multi-select-combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Pagination } from '../components/ui/pagination';
import {
  getTalentPoolList,
  removeFromTalentPool,
  restartRecruitment,
  TalentPoolItem,
  TalentPoolListParams,
} from '../api/talentPool';
import { getJDListForSelect, getUserList, JDForSelect, UserInfo } from '../api/candidate';
import { useUserStore } from '../stores/userStore';
import { cn } from '../lib/utils';
import { useDepartments } from '../hooks/useDepartments';
import { useToast } from '../components/ui/toast';

// 格式化日期
const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

// AI评分颜色
const getScoreColor = (score: number | undefined, total: number = 120): string => {
  if (!score) return 'text-gray-400';
  const percentage = (score / total) * 100;
  if (percentage >= 80) return 'text-green-600';
  if (percentage >= 60) return 'text-blue-600';
  if (percentage >= 40) return 'text-amber-600';
  return 'text-red-600';
};

// 人才卡片组件
interface TalentCardProps {
  item: TalentPoolItem;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onViewDetail: () => void;
  onRestart: () => void;
  isHR: boolean;
  index: number;
}

const TalentCard: React.FC<TalentCardProps> = ({
  item,
  isSelected,
  onSelect,
  onViewDetail,
  onRestart,
  isHR,
  index,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className={cn(
        "w-full rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow",
        isSelected && "ring-2 ring-blue-500 border-blue-500"
      )}
    >
      <div className="p-6">
        {/* 顶部标签区 */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onSelect(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <Badge variant="outline" className="bg-gray-50">
              {item.department || '未分配'}
            </Badge>
            {item.is_985 && <Badge variant="red" size="sm">985</Badge>}
            {item.is_211 && !item.is_985 && <Badge variant="blue" size="sm">211</Badge>}
          </div>
          <span className="text-xs text-gray-400">#{item.candidate_number}</span>
        </div>

        {/* 主体内容 - 12列网格 */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 md:gap-x-6 items-center">
          {/* 左侧：头像和基本信息 */}
          <div className="md:col-span-3 flex flex-col">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold text-lg">
                {item.candidate_name?.charAt(0) || <User className="w-6 h-6" />}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{item.candidate_name || '-'}</p>
                <p className="text-sm text-gray-500">
                  {item.gender || '-'} · {item.age ? `${item.age}岁` : '-'} · {item.work_years ? `${item.work_years}年经验` : '-'}
                </p>
              </div>
            </div>
            <Button
              variant="link"
              className="p-0 h-auto justify-start mt-2 text-sm"
              onClick={onViewDetail}
            >
              查看详情
            </Button>
          </div>

          {/* 中间：时间线展示 */}
          <div className="md:col-span-6 flex items-center gap-3 md:justify-center">
            {/* 简历上传时间 */}
            <div className="text-center flex-shrink-0">
              <p className="font-bold text-lg text-gray-900">{formatDate(item.resume_upload_time)}</p>
              <p className="text-xs text-gray-500">简历上传</p>
            </div>

            {/* 连接线 */}
            <div className="flex-grow text-center max-w-[240px]">
              <p className="text-sm text-gray-600 truncate">
                {item.highest_education || '-'} · {item.school || '未知学校'}
              </p>
              <div className="relative w-full h-px bg-gray-200 my-2">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gray-900 border-2 border-white"></div>
              </div>
              <p className="text-xs font-bold text-gray-900">{item.job_title || '未知职位'}</p>
            </div>

            {/* 入库时间 */}
            <div className="text-center flex-shrink-0">
              <p className="font-bold text-lg text-gray-900">{formatDate(item.created_at)}</p>
              <p className="text-xs text-gray-500">入库时间</p>
            </div>
          </div>

          {/* 右侧：评分和操作按钮 */}
          <div className="md:col-span-3 flex flex-col md:items-end gap-3">
            <div className="flex flex-col md:items-end">
              <div className="flex items-baseline gap-1">
                <span className={cn("text-3xl font-bold", getScoreColor(item.ai_score_total))}>
                  {item.ai_score_total || '-'}
                </span>
                <span className="text-sm text-gray-400">/ 120 分</span>
              </div>
              <span className="text-xs text-gray-400 mt-0.5">AI简历评分</span>
            </div>
            {isHR && (
              <Button
                onClick={onRestart}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                重启招聘
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export function TalentPoolPage() {
  const navigate = useNavigate();
  const { user } = useUserStore();
  const { departmentNames: DEPARTMENTS } = useDepartments();

  // 筛选条件
  const [filters, setFilters] = useState<TalentPoolListParams>({
    keyword: '',
    jd_id: '',
    department: '',
    page: 1,
    page_size: 10,
  });

  // 多选筛选状态
  const [selectedJdIds, setSelectedJdIds] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);

  // 数据状态
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TalentPoolItem[]>([]);
  const [total, setTotal] = useState(0);

  // 下拉选项
  const [jdList, setJdList] = useState<JDForSelect[]>([]);
  const [interviewerList, setInterviewerList] = useState<UserInfo[]>([]);

  // 选择状态
  const [selectedRows, setSelectedRows] = useState<TalentPoolItem[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // 批量删除确认弹窗
  const [batchDeleteDialog, setBatchDeleteDialog] = useState(false);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);

  // 重启招聘弹窗
  const [restartDialog, setRestartDialog] = useState<{
    open: boolean;
    item: TalentPoolItem | null;
  }>({
    open: false,
    item: null,
  });
  const [restartForm, setRestartForm] = useState({
    jd_id: '',
    screening_owner_id: '',
  });
  const [restartLoading, setRestartLoading] = useState(false);

  // Toast 通知
  const { showToast } = useToast();

  // 权限判断
  const isHR = user?.role === 'HR' || user?.role === 'CEO';

  // 加载JD列表
  const loadJDList = async () => {
    try {
      const res = await getJDListForSelect();
      setJdList(res.items || []);
    } catch (error) {
      console.error('加载JD列表失败:', error);
    }
  };

  // 加载用户列表（简历筛选负责人可选择所有人）
  const loadInterviewerList = async () => {
    try {
      const res = await getUserList();
      setInterviewerList(res || []);
    } catch (error) {
      console.error('加载用户列表失败:', error);
    }
  };

  // 加载人才储备列表
  const loadTalentPoolList = useCallback(async () => {
    setLoading(true);
    try {
      const params: TalentPoolListParams = {
        page: filters.page,
        page_size: filters.page_size,
        keyword: filters.keyword,
        jd_ids: selectedJdIds.length > 0 ? selectedJdIds.join(',') : '',
        departments: selectedDepartments.length > 0 ? selectedDepartments.join(',') : '',
      };

      const response = await getTalentPoolList(params);
      setData(response.items || []);
      setTotal(response.total || 0);
    } catch (error) {
      console.error('加载人才储备列表失败:', error);
      showToast('加载人才储备列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, selectedJdIds, selectedDepartments]);

  // 初次加载
  useEffect(() => {
    loadJDList();
    loadInterviewerList();
  }, []);

  // 筛选条件变化时加载数据
  useEffect(() => {
    loadTalentPoolList();
  }, [loadTalentPoolList]);

  // 更新筛选条件
  const updateFilter = (key: keyof TalentPoolListParams, value: string | number) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: key !== 'page' && key !== 'page_size' ? 1 : (key === 'page' ? value as number : prev.page),
    }));
  };

  // 重置筛选条件
  const handleReset = () => {
    setFilters({
      keyword: '',
      jd_id: '',
      department: '',
      page: 1,
      page_size: 10,
    });
    setSelectedJdIds([]);
    setSelectedDepartments([]);
  };

  // 选择行
  const handleSelectRow = (item: TalentPoolItem, checked: boolean) => {
    if (checked) {
      setSelectedRows((prev) => [...prev, item]);
    } else {
      setSelectedRows((prev) => prev.filter((r) => r.id !== item.id));
    }
  };

  // 全选/取消全选
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedRows([...data]);
    } else {
      setSelectedRows([]);
    }
  };

  // 更新全选状态
  useEffect(() => {
    if (data.length > 0 && selectedRows.length === data.length) {
      setSelectAll(true);
    } else {
      setSelectAll(false);
    }
  }, [selectedRows, data]);

  // 查看详情
  const handleViewDetail = (candidateId: number) => {
    navigate(`/candidate/detail/${candidateId}`);
  };

  // 批量删除
  const handleBatchDelete = () => {
    if (selectedRows.length === 0) {
      showToast('请选择要移除的人才', 'warning');
      return;
    }
    setBatchDeleteDialog(true);
  };

  const handleBatchDeleteConfirm = async () => {
    setBatchDeleteLoading(true);
    try {
      const ids = selectedRows.map((row) => row.id);
      const res = await removeFromTalentPool(ids);

      if (res.failed > 0) {
        showToast(`成功移除 ${res.success} 人，${res.failed} 人移除失败`, 'warning');
      } else {
        showToast(`成功移除 ${res.success} 人`);
      }
      setSelectedRows([]);
      setBatchDeleteDialog(false);
      loadTalentPoolList();
    } catch (error) {
      console.error('批量移除失败:', error);
      showToast('移除失败', 'error');
    } finally {
      setBatchDeleteLoading(false);
    }
  };

  // 重启招聘
  const handleRestartRecruitment = (item: TalentPoolItem) => {
    setRestartDialog({ open: true, item });
    setRestartForm({ jd_id: '', screening_owner_id: '' });
  };

  const handleRestartConfirm = async () => {
    if (!restartForm.jd_id) {
      showToast('请选择JD', 'warning');
      return;
    }
    if (!restartForm.screening_owner_id) {
      showToast('请选择简历筛选负责人', 'warning');
      return;
    }
    if (!restartDialog.item) return;

    setRestartLoading(true);
    try {
      await restartRecruitment(
        restartDialog.item.id,
        Number(restartForm.jd_id),
        Number(restartForm.screening_owner_id)
      );

      showToast('重启招聘成功');
      setRestartDialog({ open: false, item: null });
      loadTalentPoolList();
    } catch (error) {
      console.error('重启招聘失败:', error);
      showToast('重启招聘失败', 'error');
    } finally {
      setRestartLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* 页面标题 */}
      <div className="flex-shrink-0">
        <h1 className="text-xl font-semibold text-slate-900">人才储备</h1>
      </div>

      {/* 筛选卡片 */}
      <Card className="flex-shrink-0">
        <CardContent className="py-3">
          <div className="flex items-center gap-3">
            <div className="relative w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={filters.keyword || ''}
                onChange={(e) => updateFilter('keyword', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadTalentPoolList()}
                placeholder="搜索姓名/职位"
                className="pl-9 h-8 text-sm text-gray-600"
              />
            </div>

            <MultiSelectCombobox
              label="原应聘职位"
              options={jdList.map((jd) => ({ label: `${jd.id} - ${jd.job_title}`, value: String(jd.id) }))}
              value={selectedJdIds}
              onChange={(val) => {
                setSelectedJdIds(val);
                setFilters((prev) => ({ ...prev, page: 1 }));
              }}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个职位</span>
              )}
              placeholder="搜索职位..."
            />

            <MultiSelectCombobox
              label="所属部门"
              options={DEPARTMENTS.map((dept) => ({ label: dept, value: dept }))}
              value={selectedDepartments}
              onChange={(val) => {
                setSelectedDepartments(val);
                setFilters((prev) => ({ ...prev, page: 1 }));
              }}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个部门</span>
              )}
              placeholder="搜索部门..."
            />

            <button
              className="px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1"
              onClick={handleReset}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置
            </button>

            <button
              className="px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1"
              onClick={handleReset}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              刷新
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 操作按钮区 */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          {isHR && (
            <button
              className="px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleBatchDelete}
              disabled={selectedRows.length === 0}
            >
              <Trash2 className="w-3.5 h-3.5" />
              批量移除
            </button>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={selectAll}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            全选当页
          </label>
          {selectedRows.length > 0 && (
            <span className="text-sm text-blue-600">已选 {selectedRows.length} 人</span>
          )}
        </div>
        <div className="text-sm text-gray-500">
          共 <span className="font-medium text-gray-700">{total}</span> 人
        </div>
      </div>

      {/* 人才卡片列表 */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <User className="w-12 h-12 text-gray-300 mb-3" />
            <p>暂无人才储备数据</p>
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            {data.map((item, index) => (
              <TalentCard
                key={item.id}
                item={item}
                index={index}
                isSelected={selectedRows.some((r) => r.id === item.id)}
                onSelect={(checked) => handleSelectRow(item, checked)}
                onViewDetail={() => handleViewDetail(item.candidate_id)}
                onRestart={() => handleRestartRecruitment(item)}
                isHR={isHR}
              />
            ))}
          </div>
        )}

        {/* 分页 */}
        {total > 0 && !loading && (
          <div className="mt-4 pb-4">
            <Pagination
              currentPage={filters.page || 1}
              pageSize={filters.page_size || 10}
              total={total}
              onPageChange={(page) => updateFilter('page', page)}
              onPageSizeChange={(pageSize) => {
                setFilters((prev) => ({
                  ...prev,
                  page: 1,
                  page_size: pageSize,
                }));
              }}
            />
          </div>
        )}
      </div>

      {/* 批量移除确认弹窗 */}
      <Dialog open={batchDeleteDialog} onOpenChange={setBatchDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量移除</DialogTitle>
            <DialogDescription>
              确定要从人才储备库中移除选中的 {selectedRows.length} 人吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteDialog(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleBatchDeleteConfirm} disabled={batchDeleteLoading}>
              {batchDeleteLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              确定移除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重启招聘弹窗 */}
      <Dialog open={restartDialog.open} onOpenChange={(open) => setRestartDialog({ open, item: null })}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>重启招聘</DialogTitle>
            <DialogDescription>
              为 "{restartDialog.item?.candidate_name}" 重新开启招聘流程
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              <div className="text-sm">
                <span className="text-gray-500">姓名：</span>
                <span className="text-gray-900">{restartDialog.item?.candidate_name}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500">原应聘职位：</span>
                <span className="text-gray-900">{restartDialog.item?.job_title}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">选择新JD <span className="text-red-500">*</span></label>
              <SearchableSelect
                options={jdList.map((jd) => ({
                  value: String(jd.id),
                  label: `${jd.id} - ${jd.job_title}`,
                }))}
                value={restartForm.jd_id}
                onValueChange={(value) => setRestartForm((prev) => ({ ...prev, jd_id: value }))}
                placeholder="请选择JD"
                searchPlaceholder="搜索JD..."
                emptyText="无匹配JD"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">选择简历筛选负责人 <span className="text-red-500">*</span></label>
              <SearchableSelect
                options={interviewerList.map((user) => ({
                  value: String(user.id),
                  label: `${user.id}-${user.real_name || user.username}${user.department ? `（${user.department}）` : ''}`,
                }))}
                value={restartForm.screening_owner_id}
                onValueChange={(value) => setRestartForm((prev) => ({ ...prev, screening_owner_id: value }))}
                placeholder="请选择负责人"
                searchPlaceholder="搜索ID、姓名或部门"
                emptyText="无匹配负责人"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRestartDialog({ open: false, item: null })}>
              取消
            </Button>
            <Button onClick={handleRestartConfirm} disabled={restartLoading} className="bg-blue-600 hover:bg-blue-700 shadow-sm shadow-black/5">
              {restartLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              确认重启
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast 通知 */}
    </div>
  );
}
