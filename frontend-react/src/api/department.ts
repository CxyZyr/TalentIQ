import client from './client';

export interface Department {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

/** 获取部门列表 */
export async function getDepartmentList(includeInactive = false): Promise<Department[]> {
  const response = await client.get('/department/list', {
    params: includeInactive ? { include_inactive: true } : {},
  });
  return response.data.items;
}

/** 创建部门 */
export async function createDepartment(data: { name: string; sort_order?: number }) {
  const response = await client.post('/department/create', data);
  return response.data;
}

/** 更新部门 */
export async function updateDepartment(id: number, data: { name?: string; sort_order?: number }) {
  const response = await client.put(`/department/update/${id}`, data);
  return response.data;
}

/** 切换部门状态 */
export async function toggleDepartment(id: number) {
  const response = await client.post(`/department/toggle/${id}`);
  return response.data;
}
