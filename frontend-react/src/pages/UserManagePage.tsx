import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { Pagination } from '../components/ui/pagination';
import { Search, Plus, RefreshCw, Trash2, CheckCircle, XCircle, Edit, Power, Eye, EyeOff } from 'lucide-react';
import {
  getUserList,
  createUser,
  updateUser,
  toggleUserStatus,
  deleteUser,
  batchDeleteUsers,
  batchEnableUsers,
  batchDisableUsers,
  User,
  CreateUserData,
} from '../api/user';
import { useUserStore } from '../stores/userStore';
import { useDepartments } from '../hooks/useDepartments';

// 角色选项
const ROLE_OPTIONS = ['HR', 'CEO', '面试官'];

export function UserManagePage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user: currentUser } = useUserStore();
  const isHR = currentUser?.role === 'HR' || currentUser?.role === 'CEO';
  const { departmentNames: DEPARTMENT_OPTIONS } = useDepartments();

  const [loading, setLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // 密码可见性
  const [addPasswordVisible, setAddPasswordVisible] = useState(false);
  const [editPasswordVisible, setEditPasswordVisible] = useState(false);

  // Toast 通知
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 筛选条件
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 添加用户弹窗
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState<CreateUserData>({
    username: '',
    password: '',
    real_name: '',
    role: '',
    department: '',
    remark: '',
    email: '',
    phone: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // 编辑用户弹窗
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    id: 0,
    username: '',
    real_name: '',
    role: '',
    department: '',
    password: '',
    remark: '',
    email: '',
    phone: '',
  });

  // 删除确认弹窗
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  // 批量删除确认弹窗
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // 批量启用确认弹窗
  const [batchEnableDialogOpen, setBatchEnableDialogOpen] = useState(false);

  // 批量禁用确认弹窗
  const [batchDisableDialogOpen, setBatchDisableDialogOpen] = useState(false);

  // 单个启用/禁用确认弹窗
  const [toggleStatusDialogOpen, setToggleStatusDialogOpen] = useState(false);
  const [toggleStatusTarget, setToggleStatusTarget] = useState<User | null>(null);

  // 加载用户列表
  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getUserList();
      setAllUsers(data.items || []);
    } catch (error) {
      console.error('加载用户列表失败:', error);
      showToast('加载用户列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // 前端筛选
  const filteredUsers = useMemo(() => {
    let list = allUsers;
    if (keyword) {
      const kw = keyword.toLowerCase();
      list = list.filter(
        (u) =>
          (u.real_name && u.real_name.toLowerCase().includes(kw)) ||
          (u.username && u.username.toLowerCase().includes(kw))
      );
    }
    if (roleFilter) {
      list = list.filter((u) => u.role === roleFilter);
    }
    if (departmentFilter) {
      list = list.filter((u) => u.department === departmentFilter);
    }
    if (statusFilter) {
      if (statusFilter === 'active') {
        list = list.filter((u) => u.is_active);
      } else {
        list = list.filter((u) => !u.is_active);
      }
    }
    return list;
  }, [allUsers, keyword, roleFilter, departmentFilter, statusFilter]);

  const totalCount = filteredUsers.length;

  const tableData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  // 格式化时间
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    return dateStr.replace('T', ' ').slice(0, 19);
  };

  // 重置筛选
  const handleReset = () => {
    setKeyword('');
    setRoleFilter('');
    setDepartmentFilter('');
    setStatusFilter('');
    setCurrentPage(1);
  };

  // 多选处理
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(tableData.map((u) => u.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    }
  };

  const isAllSelected = tableData.length > 0 && tableData.every((u) => selectedIds.includes(u.id));

  // 打开切换状态确认弹窗
  const handleOpenToggleStatusDialog = (user: User) => {
    setToggleStatusTarget(user);
    setToggleStatusDialogOpen(true);
  };

  // 确认切换状态
  const handleConfirmToggleStatus = async () => {
    if (!toggleStatusTarget) return;
    if (toggleStatusTarget.id === currentUser?.id) {
      showToast('不能禁用/启用自己', 'warning');
      setToggleStatusDialogOpen(false);
      setToggleStatusTarget(null);
      return;
    }
    const action = toggleStatusTarget.is_active ? '禁用' : '启用';
    try {
      await toggleUserStatus(toggleStatusTarget.id);
      showToast(`${action}成功`);
      setToggleStatusDialogOpen(false);
      setToggleStatusTarget(null);
      loadUsers();
    } catch (error) {
      console.error(error);
      showToast(`${action}失败`, 'error');
    }
  };

  // 删除用户
  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.id === currentUser?.id) {
      showToast('不能删除自己', 'warning');
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      return;
    }
    try {
      await deleteUser(deleteTarget.id);
      showToast('删除成功');
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      loadUsers();
    } catch (error) {
      console.error(error);
      showToast('删除失败', 'error');
    }
  };

  // 批量操作
  const handleBatchDelete = async () => {
    try {
      await batchDeleteUsers(selectedIds);
      showToast('批量删除成功');
      setBatchDeleteDialogOpen(false);
      setSelectedIds([]);
      loadUsers();
    } catch (error) {
      console.error(error);
      showToast('批量删除失败', 'error');
    }
  };

  const handleBatchEnable = async () => {
    try {
      await batchEnableUsers(selectedIds);
      showToast('批量启用成功');
      setBatchEnableDialogOpen(false);
      setSelectedIds([]);
      loadUsers();
    } catch (error) {
      console.error(error);
      showToast('批量启用失败', 'error');
    }
  };

  const handleBatchDisable = async () => {
    try {
      await batchDisableUsers(selectedIds);
      showToast('批量禁用成功');
      setBatchDisableDialogOpen(false);
      setSelectedIds([]);
      loadUsers();
    } catch (error) {
      console.error(error);
      showToast('批量禁用失败', 'error');
    }
  };

  // 添加用户
  const handleOpenAddDialog = () => {
    setAddForm({
      username: '',
      password: '',
      real_name: '',
      role: '',
      department: '',
      remark: '',
      email: '',
      phone: '',
    });
    setAddPasswordVisible(false);
    setAddDialogOpen(true);
  };

  const handleSubmitAdd = async () => {
    if (!addForm.username || !addForm.password || !addForm.real_name || !addForm.role || !addForm.department) {
      showToast('请填写完整信息', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      await createUser(addForm);
      showToast('创建成功');
      setAddDialogOpen(false);
      loadUsers();
    } catch (error) {
      console.error(error);
      showToast('创建失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // 编辑用户
  const handleOpenEditDialog = (user: User) => {
    setEditForm({
      id: user.id,
      username: user.username,
      real_name: user.real_name || '',
      role: user.role,
      department: user.department || '',
      password: '',
      remark: user.remark || '',
      email: user.email || '',
      phone: user.phone || '',
    });
    setEditPasswordVisible(false);
    setEditDialogOpen(true);
  };

  const handleSubmitEdit = async () => {
    if (!editForm.username.trim()) {
      showToast('用户名不能为空', 'warning');
      return;
    }
    if (!editForm.department) {
      showToast('请选择部门', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const data: { username?: string; real_name?: string; role?: string; password?: string; department?: string; remark?: string; email?: string; phone?: string } = {
        username: editForm.username,
        real_name: editForm.real_name,
        role: editForm.role,
        department: editForm.department,
        remark: editForm.remark,
        email: editForm.email,
        phone: editForm.phone,
      };
      if (editForm.password) {
        data.password = editForm.password;
      }
      await updateUser(editForm.id, data);
      showToast('更新成功');
      setEditDialogOpen(false);
      loadUsers();
    } catch (error) {
      console.error(error);
      showToast('更新失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* 页面标题 */}
      {!embedded && (
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-slate-900">用户管理</h1>
        </div>
      )}

      {/* 筛选栏 */}
      <Card className="mb-4">
        <CardContent className="py-3">
          <div className="flex items-center gap-3 flex-nowrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="搜索用户姓名"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="pl-9 w-40 h-8 text-sm"
                autoComplete="off"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600 whitespace-nowrap">角色</label>
              <Select value={roleFilter || "all"} onValueChange={(v) => setRoleFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-28 h-8 text-sm text-gray-600">
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600 whitespace-nowrap">部门</label>
              <Select value={departmentFilter || "all"} onValueChange={(v) => setDepartmentFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-36 h-8 text-sm text-gray-600">
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {DEPARTMENT_OPTIONS.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600 whitespace-nowrap">状态</label>
              <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-24 h-8 text-sm text-gray-600">
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="active">启用</SelectItem>
                  <SelectItem value="inactive">禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <button
              className="h-8 px-3 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1 whitespace-nowrap"
              onClick={handleReset}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              重置
            </button>

            {isHR && (
              <button
                className="ml-auto h-8 px-4 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1 whitespace-nowrap shadow-sm shadow-black/5"
                onClick={handleOpenAddDialog}
              >
                <Plus className="w-4 h-4" />
                添加用户
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 用户列表 */}
      <div className="flex-1 bg-white rounded-md border border-gray-200 flex flex-col min-h-0">
        {/* 批量操作 */}
        {isHR && (
        <div className="px-4 py-3 border-b border-gray-200 flex gap-2">
          <button
            className={`px-3 py-1.5 text-xs rounded-md font-medium flex items-center gap-1 transition-colors ${
              selectedIds.length === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-red-200 text-red-900 hover:bg-red-300'
            }`}
            disabled={selectedIds.length === 0}
            onClick={() => setBatchDeleteDialogOpen(true)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            批量删除
          </button>
          <button
            className={`px-3 py-1.5 text-xs rounded-md font-medium flex items-center gap-1 transition-colors ${
              selectedIds.length === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-green-200 text-green-900 hover:bg-green-300'
            }`}
            disabled={selectedIds.length === 0}
            onClick={() => setBatchEnableDialogOpen(true)}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            批量启用
          </button>
          <button
            className={`px-3 py-1.5 text-xs rounded-md font-medium flex items-center gap-1 transition-colors ${
              selectedIds.length === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
            }`}
            disabled={selectedIds.length === 0}
            onClick={() => setBatchDisableDialogOpen(true)}
          >
            <XCircle className="w-3.5 h-3.5" />
            批量禁用
          </button>
        </div>
        )}

        {/* 表格 */}
        <div className="flex-1 overflow-auto min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                {isHR && (
                <TableHead className="w-12 align-middle">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                  </div>
                </TableHead>
                )}
                <TableHead className="w-16">ID</TableHead>
                <TableHead className="w-28">姓名</TableHead>
                <TableHead className="w-24">角色</TableHead>
                <TableHead className="w-36">所属部门</TableHead>
                <TableHead className="w-20">状态</TableHead>
                <TableHead className="w-44">创建时间</TableHead>
                {isHR && <TableHead className="w-40">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={isHR ? 8 : 6} className="text-center py-8 text-gray-500">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : tableData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isHR ? 8 : 6} className="text-center py-8 text-gray-500">
                    暂无用户数据
                  </TableCell>
                </TableRow>
              ) : (
                tableData.map((user) => (
                  <TableRow key={user.id}>
                    {isHR && (
                    <TableCell className="align-middle">
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(user.id)}
                          onChange={(e) => handleSelectOne(user.id, e.target.checked)}
                          className="rounded border-gray-300"
                        />
                      </div>
                    </TableCell>
                    )}
                    <TableCell>{user.id}</TableCell>
                    <TableCell>{user.real_name}</TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell>{user.department}</TableCell>
                    <TableCell>
                      {user.is_active ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          启用
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          禁用
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{formatDateTime(user.created_at)}</TableCell>
                    {isHR && (
                    <TableCell>
                      <div className="flex gap-3">
                        <button
                          className={`text-xs flex items-center gap-1 ${user.is_active ? 'text-amber-700 hover:text-amber-800' : 'text-green-700 hover:text-green-800'}`}
                          onClick={() => handleOpenToggleStatusDialog(user)}
                        >
                          <Power className="w-3.5 h-3.5" />
                          {user.is_active ? '禁用' : '启用'}
                        </button>
                        <button
                          className="text-xs text-blue-700 hover:text-blue-800 flex items-center gap-1"
                          onClick={() => handleOpenEditDialog(user)}
                        >
                          <Edit className="w-3.5 h-3.5" />
                          编辑
                        </button>
                        <button
                          className="text-xs text-red-700 hover:text-red-800 flex items-center gap-1"
                          onClick={() => {
                            setDeleteTarget(user);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          删除
                        </button>
                      </div>
                    </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* 分页 */}
        {totalCount > 0 && (
          <div className="px-4 py-3">
            <Pagination
              currentPage={currentPage}
              pageSize={pageSize}
              total={totalCount}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
            />
          </div>
        )}
      </div>

      {/* 添加用户弹窗 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>添加用户</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>用户名 <span className="text-red-500">*</span></Label>
              <Input
                value={addForm.username}
                onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                placeholder="输入用户名"
                className="h-9"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>密码 <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input
                  type={addPasswordVisible ? 'text' : 'password'}
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  placeholder="输入密码"
                  className="h-9 pr-9"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setAddPasswordVisible(!addPasswordVisible)}
                >
                  {addPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>姓名 <span className="text-red-500">*</span></Label>
              <Input
                value={addForm.real_name}
                onChange={(e) => setAddForm({ ...addForm, real_name: e.target.value })}
                placeholder="输入姓名"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label>角色 <span className="text-red-500">*</span></Label>
              <Select value={addForm.role} onValueChange={(v) => setAddForm({ ...addForm, role: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="请选择角色" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-2">
              <Label>部门 <span className="text-red-500">*</span></Label>
              <Select value={addForm.department} onValueChange={(v) => setAddForm({ ...addForm, department: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="请选择部门" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_OPTIONS.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>邮箱</Label>
              <Input
                value={addForm.email || ''}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                placeholder="输入邮箱地址"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label>电话</Label>
              <Input
                value={addForm.phone || ''}
                onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                placeholder="输入电话号码"
                className="h-9"
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>备注</Label>
              <Input
                value={addForm.remark}
                onChange={(e) => setAddForm({ ...addForm, remark: e.target.value })}
                placeholder="输入备注信息"
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleSubmitAdd}
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 shadow-sm shadow-black/5"
            >
              {submitting ? '创建中...' : '确认创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑用户弹窗 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>用户ID</Label>
              <Input value={editForm.id} disabled className="h-9" />
            </div>
            <div className="space-y-2">
              <Label>用户名</Label>
              <Input
                value={editForm.username}
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                placeholder="输入用户名"
                className="h-9"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>姓名</Label>
              <Input
                value={editForm.real_name}
                onChange={(e) => setEditForm({ ...editForm, real_name: e.target.value })}
                placeholder="输入姓名"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="请选择角色" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>所属部门</Label>
              <Select value={editForm.department} onValueChange={(v) => setEditForm({ ...editForm, department: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="请选择部门" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_OPTIONS.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>重置密码</Label>
              <div className="relative">
                <Input
                  type={editPasswordVisible ? 'text' : 'password'}
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="不修改请留空"
                  className="h-9 pr-9"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setEditPasswordVisible(!editPasswordVisible)}
                >
                  {editPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>邮箱</Label>
              <Input
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="输入邮箱地址"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label>电话</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="输入电话号码"
                className="h-9"
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>备注</Label>
              <Input
                value={editForm.remark}
                onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })}
                placeholder="输入备注信息"
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleSubmitEdit}
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 shadow-sm shadow-black/5"
            >
              {submitting ? '保存中...' : '保存修改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            确定要删除用户 <span className="font-medium">{deleteTarget?.real_name}</span> 吗？删除后该用户将不在列表中显示。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认弹窗 */}
      <Dialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认批量删除</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            确定要删除选中的 <span className="font-medium">{selectedIds.length}</span> 个用户吗？
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleBatchDelete}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量启用确认弹窗 */}
      <Dialog open={batchEnableDialogOpen} onOpenChange={setBatchEnableDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认批量启用</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            确定要启用选中的 <span className="font-medium">{selectedIds.length}</span> 个用户吗？启用后这些用户将可以登录系统。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchEnableDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleBatchEnable}>
              确认启用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量禁用确认弹窗 */}
      <Dialog open={batchDisableDialogOpen} onOpenChange={setBatchDisableDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认批量禁用</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            确定要禁用选中的 <span className="font-medium">{selectedIds.length}</span> 个用户吗？禁用后这些用户将无法登录系统。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDisableDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleBatchDisable}>
              确认禁用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 单个启用/禁用确认弹窗 */}
      <Dialog open={toggleStatusDialogOpen} onOpenChange={setToggleStatusDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              确认{toggleStatusTarget?.is_active ? '禁用' : '启用'}
            </DialogTitle>
          </DialogHeader>
          <p className="py-4">
            {toggleStatusTarget?.is_active ? (
              <>禁用后用户 <span className="font-medium">{toggleStatusTarget?.real_name}</span> 将无法登录系统，是否禁用？</>
            ) : (
              <>启用后用户 <span className="font-medium">{toggleStatusTarget?.real_name}</span> 将可以登录系统，是否启用？</>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToggleStatusDialogOpen(false)}>
              取消
            </Button>
            <Button
              variant={toggleStatusTarget?.is_active ? "destructive" : "default"}
              onClick={handleConfirmToggleStatus}
            >
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
}
