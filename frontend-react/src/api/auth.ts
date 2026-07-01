import client from './client';

export interface LoginParams {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: {
    id: number;
    username: string;
    email: string;
    role: string;
    department?: string;
  };
}

export const login = async (params: LoginParams): Promise<LoginResponse> => {
  const response = await client.post('/auth/login', params);
  // client 拦截器已经解包了 {code:200, data:...} 的响应
  return response.data;
};

export const logout = async (): Promise<void> => {
  await client.post('/auth/logout');
};

export const getCurrentUser = async () => {
  const response = await client.get('/auth/me');
  return response.data;
};
