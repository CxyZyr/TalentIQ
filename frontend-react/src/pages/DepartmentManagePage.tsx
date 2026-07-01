'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Power,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderPlus,
  Building2,
} from 'lucide-react';
import {
  getDepartmentList,
  createDepartment,
  updateDepartment,
  toggleDepartment,
  deleteDepartment,
  Department,
} from '../api/department';
import { useUserStore } from '../stores/userStore';
import { useToast } from '../components/ui/toast';

interface TreeNode extends Department {
  children: TreeNode[];
  depth: number;
}

function buildTree(list: Department[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  list.forEach((d) => map.set(d.id, { ...d, children: [], depth: 0 }));
  const roots: TreeNode[] = [];
  list.forEach((d) => {
    const node = map.get(d.id)!;
    if (d.parent_id != null && map.has(d.parent_id)) {
      map.get(d.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const assignDepth = (nodes: TreeNode[], depth: number) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order);
    nodes.forEach((n) => {
      n.depth = depth;
      assignDepth(n.children, depth + 1);
    });
  };
  assignDepth(roots, 0);
  return roots;
}

function collectDescendants(list: Department[], id: number): Set<number> {
  const childrenMap = new Map<number, number[]>();
  list.forEach((d) => {
    if (d.parent_id != null) {
      const arr = childrenMap.get(d.parent_id) || [];
      arr.push(d.id);
      childrenMap.set(d.parent_id, arr);
    }
  });
  const result = new Set<number>();
  const stack = [...(childrenMap.get(id) || [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (result.has(cur)) continue;
    result.add(cur);
    stack.push(...(childrenMap.get(cur) || []));
  }
  return result;
}

export function DepartmentManagePage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useUserStore();
  const canManage = user?.role === 'HR' || user?.role === 'CEO';

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { showToast } = useToast();

  // 新增/编辑弹窗
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formId, setFormId] = useState(0);
  const [formName, setFormName] = useState('');
  const [formParentId, setFormParentId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getDepartmentList(true);
      setDepartments(list);
    } catch (e) {
      showToast('加载部门失败', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tree = useMemo(() => buildTree(departments), [departments]);

  const visibleRows = useMemo(() => {
    const rows: TreeNode[] = [];
    const walk = (nodes: TreeNode[]) => {
      nodes.forEach((n) => {
        rows.push(n);
        if (n.children.length && expanded.has(n.id)) walk(n.children);
      });
    };
    walk(tree);
    return rows;
  }, [tree, expanded]);

  const selected = useMemo(
    () => departments.find((d) => d.id === selectedId) || null,
    [departments, selectedId]
  );
  const selectedParentName = useMemo(() => {
    if (!selected || selected.parent_id == null) return '顶级部门';
    return departments.find((d) => d.id === selected.parent_id)?.name || '—';
  }, [selected, departments]);
  const selectedChildCount = useMemo(
    () => (selected ? departments.filter((d) => d.parent_id === selected.id).length : 0),
    [selected, departments]
  );

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = (parentId: number | null) => {
    setFormMode('create');
    setFormId(0);
    setFormName('');
    setFormParentId(parentId);
    setFormOpen(true);
    if (parentId != null) setExpanded((p) => new Set(p).add(parentId));
  };

  const openEdit = (d: Department) => {
    setFormMode('edit');
    setFormId(d.id);
    setFormName(d.name);
    setFormParentId(d.parent_id ?? null);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim()) {
      showToast('请输入部门名称', 'error');
      return;
    }
    setSubmitting(true);
    try {
      if (formMode === 'create') {
        const created = await createDepartment({ name: formName.trim(), parent_id: formParentId });
        showToast('创建成功');
        setFormOpen(false);
        await loadData();
        if (created?.id) setSelectedId(created.id);
      } else {
        await updateDepartment(formId, { name: formName.trim(), parent_id: formParentId });
        showToast('保存成功');
        setFormOpen(false);
        await loadData();
      }
    } catch (e: any) {
      showToast(e.response?.data?.detail || '操作失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (d: Department) => {
    try {
      await toggleDepartment(d.id);
      await loadData();
    } catch (e: any) {
      showToast(e.response?.data?.detail || '操作失败', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDepartment(deleteTarget.id);
      showToast('删除成功');
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
      await loadData();
    } catch (e: any) {
      showToast(e.response?.data?.detail || '删除失败', 'error');
      setDeleteTarget(null);
    }
  };

  const parentOptions = useMemo(() => {
    const exclude = formMode === 'edit' ? collectDescendants(departments, formId) : new Set<number>();
    if (formMode === 'edit') exclude.add(formId);
    return departments.filter((d) => !exclude.has(d.id));
  }, [departments, formMode, formId]);

  if (!canManage) {
    return (
      <div className="flex items-center justify-center flex-1 text-slate-400">
        仅 HR / CEO 可管理部门
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* 标题 */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">部门管理</h1>
            <p className="text-sm text-slate-500 mt-0.5">自由组合多级部门层级与名称（HR / CEO）</p>
          </div>
        </div>
      )}

      {/* 左右分栏 */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* 左：部门树 */}
        <Card className="w-72 flex-shrink-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-medium text-slate-700">组织架构</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => loadData()}
                title="刷新"
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-md"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => openCreate(null)}
                title="新增顶级部门"
                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md inline-flex items-center gap-1 text-xs font-medium"
              >
                <Plus className="w-4 h-4" /> 顶级
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-sm">加载中...</div>
            ) : visibleRows.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm px-4">
                暂无部门，点击右上「顶级」新增
              </div>
            ) : (
              visibleRows.map((node) => (
                <div
                  key={node.id}
                  onClick={() => setSelectedId(node.id)}
                  className={`flex items-center gap-1 pr-2 py-1.5 cursor-pointer text-sm rounded-md mx-1 ${
                    selectedId === node.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  style={{ paddingLeft: `${6 + node.depth * 18}px` }}
                >
                  {node.children.length > 0 ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(node.id);
                      }}
                      className="p-0.5 text-slate-400 hover:text-slate-600"
                    >
                      {expanded.has(node.id) ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ) : (
                    <span className="inline-block w-4" />
                  )}
                  {node.children.length > 0 && expanded.has(node.id) ? (
                    <FolderOpen className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  ) : node.children.length > 0 ? (
                    <Folder className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  ) : (
                    <Folder className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  )}
                  <span className={`truncate ${!node.is_active ? 'line-through text-slate-400' : ''}`}>
                    {node.name}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* 右：详情与操作 */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardContent className="p-6 flex-1 overflow-y-auto">
            {!selected ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300">
                <Building2 className="w-14 h-14 mb-3" />
                <p className="text-sm text-slate-400">从左侧选择一个部门查看详情与操作</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 头部 */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <FolderOpen className="w-6 h-6 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-slate-900 truncate">{selected.name}</h2>
                    <span
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mt-1 ${
                        selected.is_active
                          ? 'bg-green-50 text-green-600'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          selected.is_active ? 'bg-green-500' : 'bg-slate-400'
                        }`}
                      />
                      {selected.is_active ? '启用中' : '已禁用'}
                    </span>
                  </div>
                </div>

                {/* 信息 */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-slate-100 pt-5">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">上级部门</div>
                    <div className="text-sm text-slate-800">{selectedParentName}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">直属子部门</div>
                    <div className="text-sm text-slate-800">{selectedChildCount} 个</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">排序号</div>
                    <div className="text-sm text-slate-800">{selected.sort_order}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">部门 ID</div>
                    <div className="text-sm text-slate-800">{selected.id}</div>
                  </div>
                </div>

                {/* 操作 */}
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-5">
                  <Button variant="outline" size="sm" onClick={() => openEdit(selected)}>
                    <Pencil className="w-4 h-4 mr-1.5" /> 编辑 / 移动
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openCreate(selected.id)}>
                    <FolderPlus className="w-4 h-4 mr-1.5" /> 加子部门
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleToggle(selected)}>
                    <Power className="w-4 h-4 mr-1.5" /> {selected.is_active ? '禁用' : '启用'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteTarget(selected)}
                    className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" /> 删除
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 新增 / 编辑弹窗 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formMode === 'create' ? '新增部门' : '编辑部门'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm text-slate-600 mb-1 block">部门名称</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="请输入部门名称"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">上级部门</label>
              <select
                value={formParentId ?? ''}
                onChange={(e) => setFormParentId(e.target.value ? Number(e.target.value) : null)}
                className="w-full h-9 px-3 rounded-md border border-slate-300 text-sm bg-white"
              >
                <option value="">（顶级部门）</option>
                {parentOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除部门</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-slate-600">
            确定删除部门「{deleteTarget?.name}」吗？若该部门有子部门或已关联用户 / 职位，将无法删除。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DepartmentManagePage;
