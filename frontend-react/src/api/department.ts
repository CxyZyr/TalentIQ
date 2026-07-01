import client from './client';

export interface Department {
  id: number;
  name: string;
  parent_id?: number | null;
  sort_order: number;
  is_active: boolean;
}

/** 获取部门列表（扁平，含 parent_id，前端自行组树） */
export async function getDepartmentList(includeInactive = false): Promise<Department[]> {
  const response = await client.get('/department/list', {
    params: includeInactive ? { include_inactive: true } : {},
  });
  return response.data.items;
}

/** 创建部门 */
export async function createDepartment(data: { name: string; parent_id?: number | null; sort_order?: number }) {
  const response = await client.post('/department/create', data);
  return response.data;
}

/** 更新部门（仅传需要修改的字段；parent_id 传 null = 移到顶级） */
export async function updateDepartment(
  id: number,
  data: { name?: string; parent_id?: number | null; sort_order?: number }
) {
  const response = await client.put(`/department/update/${id}`, data);
  return response.data;
}

/** 切换部门启用/禁用 */
export async function toggleDepartment(id: number) {
  const response = await client.post(`/department/toggle/${id}`);
  return response.data;
}

/** 删除部门（有子部门或被用户/职位引用时会被后端拒绝） */
export async function deleteDepartment(id: number) {
  const response = await client.delete(`/department/delete/${id}`);
  return response.data;
}
