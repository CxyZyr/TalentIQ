import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  RotateCcw,
  Edit,
  Send,
  Download,
  Trash2,
  XCircle,
  Loader2,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
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
  getJDList,
  getJDDetail,
  deleteJD,
  closeJD,
  exportJD,
  publishJD,
  JD,
  JDListParams,
} from '../api/jd';
import { useUserStore } from '../stores/userStore';
import { useDepartments } from '../hooks/useDepartments';
import { useToast } from '../components/ui/toast';

// 状态列表
const STATUSES = [
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'closed', label: '已关闭' },
];

// 格式化日期时间
const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('zh-CN');
};

// 格式化日期（只显示年月日）
const formatDateOnly = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 状态徽章
const StatusBadge: React.FC<{ status: JD['status'] }> = ({ status }) => {
  const variants: Record<JD['status'], 'info' | 'success' | 'destructive'> = {
    draft: 'info',
    published: 'success',
    closed: 'destructive',
  };

  const labels: Record<JD['status'], string> = {
    draft: '草稿',
    published: '已发布',
    closed: '已关闭',
  };

  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
};

type DialogType = 'publish' | 'delete' | 'close' | null;

export function JDManagePage() {
  const navigate = useNavigate();
  const { user } = useUserStore();
  const { departmentNames: DEPARTMENTS } = useDepartments();

  // Toast 通知
  const { showToast } = useToast();

  // 筛选条件
  const [filters, setFilters] = useState<JDListParams>({
    keyword: '',
    department: '',
    status: '',
    page: 1,
    page_size: 20,
  });

  // 数据状态
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<JD[]>([]);
  const [total, setTotal] = useState(0);

  // 对话框状态
  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [selectedJD, setSelectedJD] = useState<JD | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);

  // 加载 JD 列表
  const loadJDList = useCallback(async () => {
    setLoading(true);
    try {
      const params: JDListParams = {
        page: filters.page,
        page_size: filters.page_size,
      };
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.department) params.department = filters.department;
      if (filters.status) params.status = filters.status;

      const response = await getJDList(params);
      setData(response.items);
      setTotal(response.total);
    } catch (error) {
      console.error('加载 JD 列表失败:', error);
      showToast('加载 JD 列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // 初次加载和筛选条件变化时加载数据
  useEffect(() => {
    loadJDList();
  }, [loadJDList]);

  // 更新筛选条件
  const updateFilter = (key: keyof JDListParams, value: string | number) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      // 更改筛选条件时重置到第一页
      page: key !== 'page' && key !== 'page_size' ? 1 : (key === 'page' ? value as number : prev.page),
    }));
  };

  // 重置筛选条件
  const handleReset = () => {
    setFilters({
      keyword: '',
      department: '',
      status: '',
      page: 1,
      page_size: 20,
    });
  };

  // 新建 JD
  const handleCreate = () => {
    navigate('/jd/generate');
  };

  // 编辑 JD
  const handleEdit = (jd: JD) => {
    navigate(`/jd/edit/${jd.id}`);
  };

  // 打开确认对话框
  const openDialog = (type: DialogType, jd: JD) => {
    setDialogType(type);
    setSelectedJD(jd);
  };

  // 关闭对话框
  const closeDialog = () => {
    setDialogType(null);
    setSelectedJD(null);
    setDialogLoading(false);
  };

  // 确认发布
  const handlePublishConfirm = async () => {
    if (!selectedJD) return;

    setDialogLoading(true);
    try {
      // 先获取 JD 详情
      const detail = await getJDDetail(selectedJD.id);

      // 发布 JD
      await publishJD({
        id: selectedJD.id,
        jd_data: {
          job_title: detail.job_title,
          industry: detail.industry,
          job_level: detail.job_level,
          department: detail.department,
          salary_range: detail.salary_range,
          headcount: detail.headcount,
          expected_onboard_date: detail.expected_onboard_date,
          job_responsibilities: detail.job_responsibilities,
          hard_requirements: detail.hard_requirements,
          other_requirements: detail.other_requirements,
        },
      });
      showToast('JD 已发布');
      closeDialog();
      loadJDList();
    } catch (error) {
      console.error('发布 JD 失败:', error);
      showToast('发布失败，请重试', 'error');
    } finally {
      setDialogLoading(false);
    }
  };

  // 确认删除
  const handleDeleteConfirm = async () => {
    if (!selectedJD) return;

    setDialogLoading(true);
    try {
      await deleteJD(selectedJD.id);
      showToast('删除成功');
      closeDialog();
      loadJDList();
    } catch (error) {
      console.error('删除 JD 失败:', error);
      showToast('删除失败，请重试', 'error');
    } finally {
      setDialogLoading(false);
    }
  };

  // 确认关闭
  const handleCloseConfirm = async () => {
    if (!selectedJD) return;

    setDialogLoading(true);
    try {
      await closeJD(selectedJD.id);
      showToast('JD 已关闭');
      closeDialog();
      loadJDList();
    } catch (error) {
      console.error('关闭 JD 失败:', error);
      showToast('关闭失败，请重试', 'error');
    } finally {
      setDialogLoading(false);
    }
  };

  // 下载导出
  const handleExport = async (jd: JD) => {
    try {
      const blob = await exportJD(jd.id);

      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `JD_${jd.job_title}_${Date.now()}.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast('导出成功');
    } catch (error) {
      console.error('导出失败:', error);
      showToast('导出失败，请重试', 'error');
    }
  };

  // 判断是否为 HR（可以关闭 JD）
  const isHR = user?.role === 'HR' || user?.role === 'CEO';

  return (
    <div className="flex flex-col h-full gap-4">
      {/* 页面标题 */}
      <div className="flex-shrink-0">
        <h1 className="text-xl font-semibold text-slate-900">JD管理</h1>
      </div>

      {/* 筛选卡片 */}
      <Card className="flex-shrink-0">
        <CardContent className="py-3">
          <div className="flex items-center gap-3">
            {/* 关键词搜索 */}
            <div className="relative w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={filters.keyword || ''}
                onChange={(e) => updateFilter('keyword', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadJDList()}
                placeholder="搜索岗位名称或创建者"
                className="pl-9 h-8 text-sm text-gray-600"
              />
            </div>

            {/* 部门筛选 */}
            <Select
              value={filters.department || 'all'}
              onValueChange={(value) => updateFilter('department', value === 'all' ? '' : value)}
            >
              <SelectTrigger className="w-36 h-8 text-sm text-gray-600">
                <SelectValue placeholder="选择部门" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部部门</SelectItem>
                {DEPARTMENTS.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 状态筛选 */}
            <Select
              value={filters.status || 'all'}
              onValueChange={(value) => updateFilter('status', value === 'all' ? '' : value)}
            >
              <SelectTrigger className="w-28 h-8 text-sm text-gray-600">
                <SelectValue placeholder="选择状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 重置按钮 */}
            <button
              className="px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1 whitespace-nowrap"
              onClick={handleReset}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置
            </button>

            {/* 占位空间 */}
            <div className="flex-1" />

            {/* 新建JD按钮 */}
            <button
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1 whitespace-nowrap shadow-sm shadow-black/5"
              onClick={handleCreate}
            >
              <Plus className="w-3.5 h-3.5" />
              新建JD
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 数据表格 */}
      <Card className="flex-1 flex flex-col min-h-0">
        <CardContent className="pt-4 pb-4 flex-1 flex flex-col min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 flex-1">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              <div className="relative overflow-x-auto flex-1">
                <Table className="min-w-[1200px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[60px] min-w-[60px] sticky left-0 bg-gray-50 z-20 whitespace-nowrap">ID</TableHead>
                      <TableHead className="w-[180px] min-w-[180px] sticky left-[60px] bg-gray-50 z-20 whitespace-nowrap border-r">岗位名称</TableHead>
                      <TableHead className="w-[140px] min-w-[140px] whitespace-nowrap">所属部门</TableHead>
                      <TableHead className="w-[110px] min-w-[110px] whitespace-nowrap">创建者</TableHead>
                      <TableHead className="w-[170px] min-w-[170px] whitespace-nowrap">创建时间</TableHead>
                      <TableHead className="w-[170px] min-w-[170px] whitespace-nowrap">更新时间</TableHead>
                      <TableHead className="w-[110px] min-w-[110px] whitespace-nowrap">期望到岗</TableHead>
                      <TableHead className="w-[80px] min-w-[80px] whitespace-nowrap">状态</TableHead>
                      <TableHead className="w-[80px] min-w-[80px] whitespace-nowrap">人数</TableHead>
                      <TableHead className="w-[260px] min-w-[260px] sticky right-0 bg-gray-50 z-20 whitespace-nowrap border-l">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12 text-gray-500">
                          暂无数据
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.map((jd) => (
                        <TableRow key={jd.id}>
                          <TableCell className="py-2 sticky left-0 bg-white z-10 whitespace-nowrap">{jd.id}</TableCell>
                          <TableCell className="py-2 sticky left-[60px] bg-white z-10 border-r">
                            <button
                              className="text-blue-600 hover:text-blue-700 hover:underline text-left whitespace-nowrap"
                              onClick={() => handleEdit(jd)}
                            >
                              {jd.job_title}
                            </button>
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">{jd.department}</TableCell>
                          <TableCell className="py-2 whitespace-nowrap">{jd.creator_name || '-'}</TableCell>
                          <TableCell className="py-2 text-sm whitespace-nowrap">{formatDate(jd.created_at)}</TableCell>
                          <TableCell className="py-2 text-sm whitespace-nowrap">{formatDate(jd.updated_at)}</TableCell>
                          <TableCell className="py-2 text-sm whitespace-nowrap">{formatDateOnly(jd.expected_onboard_date)}</TableCell>
                          <TableCell className="py-2 whitespace-nowrap">
                            <StatusBadge status={jd.status} />
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">{jd.headcount || '-'}</TableCell>
                          <TableCell className="py-2 sticky right-0 bg-white z-10 border-l">
                            <div className="flex items-center gap-1 whitespace-nowrap">
                              {/* 编辑按钮：草稿和已发布状态显示 */}
                              {(jd.status === 'draft' || jd.status === 'published') && (
                                <button
                                  className="px-2 py-1 text-sm text-gray-600 rounded hover:bg-slate-50 transition-colors flex items-center gap-1"
                                  onClick={() => handleEdit(jd)}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                  编辑
                                </button>
                              )}

                              {/* 发布按钮：草稿和已发布状态显示 */}
                              {(jd.status === 'draft' || jd.status === 'published') && (
                                <button
                                  className="px-2 py-1 text-sm text-green-600 rounded hover:bg-green-50 transition-colors flex items-center gap-1"
                                  onClick={() => openDialog('publish', jd)}
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  发布
                                </button>
                              )}

                              {/* 下载按钮：所有状态显示 */}
                              <button
                                className="px-2 py-1 text-sm text-gray-600 rounded hover:bg-slate-50 transition-colors flex items-center gap-1"
                                onClick={() => handleExport(jd)}
                              >
                                <Download className="w-3.5 h-3.5" />
                                下载
                              </button>

                              {/* 删除按钮：仅草稿显示 */}
                              {jd.status === 'draft' && (
                                <button
                                  className="px-2 py-1 text-sm text-red-600 rounded hover:bg-red-50 transition-colors flex items-center gap-1"
                                  onClick={() => openDialog('delete', jd)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  删除
                                </button>
                              )}

                              {/* 关闭按钮：已发布状态且 HR 显示 */}
                              {jd.status === 'published' && isHR && (
                                <button
                                  className="px-2 py-1 text-sm text-orange-600 rounded hover:bg-orange-50 transition-colors flex items-center gap-1"
                                  onClick={() => openDialog('close', jd)}
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  关闭
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* 分页 */}
              {total > 0 && (
                <div className="mt-6">
                  <Pagination
                    currentPage={filters.page || 1}
                    pageSize={filters.page_size || 20}
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
            </>
          )}
        </CardContent>
      </Card>

      {/* 发布确认对话框 */}
      <Dialog open={dialogType === 'publish'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认发布</DialogTitle>
            <DialogDescription>
              确定要发布该 JD 吗？发布后将对外开放招聘。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button onClick={handlePublishConfirm} disabled={dialogLoading}>
              {dialogLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={dialogType === 'delete'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除该 JD 吗？删除后无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={dialogLoading}>
              {dialogLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              确定删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 关闭确认对话框 */}
      <Dialog open={dialogType === 'close'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认关闭</DialogTitle>
            <DialogDescription>
              确定要关闭该 JD 吗？关闭后将无法再接收简历。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleCloseConfirm} disabled={dialogLoading}>
              {dialogLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              确定关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
