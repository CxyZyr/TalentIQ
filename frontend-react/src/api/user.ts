import client from './client';

export interface User {
  id: number;
  username: string;
  real_name: string;
  email?: string;
  phone?: string;
  role: string;
  department: string;
  is_active: boolean;
  remark?: string;
  created_at: string;
}

export interface GetUsersResponse {
  items: User[];
  total: number;
}

export interface CreateUserData {
  username: string;
  password: string;
  real_name: string;
  role: string;
  department: string;
  remark?: string;
  email?: string;
  phone?: string;
}

export interface UpdateUserData {
  username?: string;
  real_name?: string;
  role?: string;
  password?: string;
  department?: string;
  remark?: string;
  email?: string;
  phone?: string;
}

export interface UpdateSelfData {
  real_name?: string;
  email?: string;
  phone?: string;
  password?: string;
}

// 获取用户列表
export const getUserList = async (): Promise<GetUsersResponse> => {
  const response = await client.get('/user/list');
  return response.data;
};

// 创建用户
export const createUser = async (data: CreateUserData): Promise<void> => {
  await client.post('/user/create', data);
};

// 更新用户
export const updateUser = async (userId: number, data: UpdateUserData): Promise<void> => {
  await client.put(`/user/update/${userId}`, data);
};

// 切换用户状态
export const toggleUserStatus = async (userId: number): Promise<void> => {
  await client.post(`/user/toggle-status/${userId}`);
};

// 删除用户
export const deleteUser = async (userId: number): Promise<void> => {
  await client.post(`/user/delete/${userId}`);
};

// 批量删除用户
export const batchDeleteUsers = async (ids: number[]): Promise<void> => {
  await client.post('/user/batch-delete', { ids });
};

// 批量启用用户
export const batchEnableUsers = async (ids: number[]): Promise<void> => {
  await client.post('/user/batch-enable', { ids });
};

// 批量禁用用户
export const batchDisableUsers = async (ids: number[]): Promise<void> => {
  await client.post('/user/batch-disable', { ids });
};

// 获取当前用户信息
export const getCurrentUserInfo = async (): Promise<User> => {
  const response = await client.get('/user/me');
  return response.data;
};

// 更新自己的信息
export const updateSelf = async (data: UpdateSelfData): Promise<void> => {
  await client.put('/user/update-self', data);
};
