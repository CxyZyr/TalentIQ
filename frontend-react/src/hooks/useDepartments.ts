import { useState, useEffect } from 'react';
import { getDepartmentList, Department } from '../api/department';

let cachedDepartments: Department[] | null = null;
let fetchPromise: Promise<Department[]> | null = null;

export function useDepartments() {
  const [departments, setDepartments] = useState<Department[]>(cachedDepartments || []);
  const [loading, setLoading] = useState(!cachedDepartments);

  useEffect(() => {
    if (cachedDepartments) return;

    // 避免多个组件同时发请求
    if (!fetchPromise) {
      fetchPromise = getDepartmentList().then((data) => {
        cachedDepartments = data;
        fetchPromise = null;
        return data;
      });
    }

    fetchPromise.then((data) => {
      setDepartments(data);
      setLoading(false);
    });
  }, []);

  const refresh = async () => {
    const data = await getDepartmentList();
    cachedDepartments = data;
    setDepartments(data);
  };

  return {
    departments,
    departmentNames: departments.map((d) => d.name),
    loading,
    refresh,
  };
}
