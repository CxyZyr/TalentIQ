import { useState, useEffect } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { getCurrentUserInfo, updateSelf, type User } from '../api/user';
import { useToast } from '../components/ui/toast';

const ProfilePage = () => {
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const { showToast } = useToast();

  const [form, setForm] = useState({
    real_name: '',
    email: '',
    phone: '',
    password: '',
  });

  const loadUserInfo = async () => {
    try {
      setLoading(true);
      const data = await getCurrentUserInfo();
      setUserInfo(data);
      setForm({
        real_name: data.real_name || '',
        email: data.email || '',
        phone: data.phone || '',
        password: '',
      });
    } catch (error) {
      console.error('获取用户信息失败:', error);
      showToast('获取用户信息失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUserInfo();
  }, []);

  const handleSave = () => {
    if (!form.real_name.trim()) {
      showToast('姓名不能为空', 'warning');
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      const updateData: Record<string, string> = {};
      if (form.real_name !== (userInfo?.real_name || '')) {
        updateData.real_name = form.real_name;
      }
      if (form.email !== (userInfo?.email || '')) {
        updateData.email = form.email;
      }
      if (form.phone !== (userInfo?.phone || '')) {
        updateData.phone = form.phone;
      }
      if (form.password) {
        updateData.password = form.password;
      }

      if (Object.keys(updateData).length === 0) {
        showToast('没有需要更新的内容', 'warning');
        return;
      }

      await updateSelf(updateData);
      showToast('个人信息更新成功');
      setForm((prev) => ({ ...prev, password: '' }));
      loadUserInfo();
    } catch (error) {
      console.error('更新失败:', error);
      showToast('更新失败，请稍后重试', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toast */}
      {/* 页面标题 */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-800">个人信息</h1>
      </div>

      {/* 内容卡片 - 占满剩余空间 */}
      <Card className="flex-1">
        <CardContent className="p-6">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-500">加载中...</span>
            </div>
          ) : (
            <div className="space-y-8">
              {/* 基本信息（只读） */}
              <div>
                <h2 className="text-sm font-medium text-gray-500 mb-4">基本信息</h2>
                <div className="grid grid-cols-5 gap-6">
                  <div>
                    <Label className="text-xs text-gray-400">用户ID</Label>
                    <div className="mt-1.5 text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-md px-3 py-2">
                      {userInfo?.id}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">用户名</Label>
                    <div className="mt-1.5 text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-md px-3 py-2">
                      {userInfo?.username}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">角色</Label>
                    <div className="mt-1.5 text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-md px-3 py-2">
                      {userInfo?.role}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">所属部门</Label>
                    <div className="mt-1.5 text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-md px-3 py-2">
                      {userInfo?.department || '-'}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">创建时间</Label>
                    <div className="mt-1.5 text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-md px-3 py-2">
                      {userInfo?.created_at ? new Date(userInfo.created_at).toLocaleString('zh-CN') : '-'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100" />

              {/* 可编辑信息 */}
              <div>
                <h2 className="text-sm font-medium text-gray-500 mb-4">编辑信息</h2>
                <div className="grid grid-cols-4 gap-6">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">姓名 <span className="text-red-500">*</span></Label>
                    <Input
                      value={form.real_name}
                      onChange={(e) => setForm({ ...form, real_name: e.target.value })}
                      className="h-9"
                      placeholder="输入姓名"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">邮箱</Label>
                    <Input
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="h-9"
                      placeholder="输入邮箱"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">电话</Label>
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="h-9"
                      placeholder="输入电话号码"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">重置密码</Label>
                    <div className="relative">
                      <Input
                        type={passwordVisible ? 'text' : 'password'}
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        className="h-9 pr-9"
                        placeholder="留空则不修改"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() => setPasswordVisible(!passwordVisible)}
                      >
                        {passwordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 保存按钮 */}
                <div className="flex justify-end mt-6">
                  <Button
                    onClick={handleSave}
                    disabled={submitting}
                    className="bg-blue-600 hover:bg-blue-700 px-8"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        保存中...
                      </>
                    ) : (
                      '保存'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 确认弹窗 */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认修改</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">确定要保存个人信息的修改吗？</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmSave} className="bg-blue-600 hover:bg-blue-700">
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProfilePage;
