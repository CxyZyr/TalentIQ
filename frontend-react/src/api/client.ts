import axios from 'axios';

// 使用相对路径 /api，通过代理访问后端
// 开发环境通过 setupProxy 代理到 localhost:7586
const API_BASE_URL = '/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 600000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加 token
client.interceptors.request.use(
  (config) => {
    // 从 zustand persist 存储中获取 token
    const userStorage = localStorage.getItem('user-storage');
    if (userStorage) {
      try {
        const parsed = JSON.parse(userStorage);
        const token = parsed?.state?.token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (e) {
        console.error('Failed to parse user storage:', e);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理错误和解包响应
client.interceptors.response.use(
  (response) => {
    const res = response.data;
    // 如果后端返回 code: 200，直接返回 data 字段
    if (res && res.code === 200) {
      return { ...response, data: res.data };
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // 清除 zustand persist 存储
      localStorage.removeItem('user-storage');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
