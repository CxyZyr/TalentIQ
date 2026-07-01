'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  UserIcon,
  LockIcon,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { login } from '../api/auth';
import { useUserStore } from '../stores/userStore';

interface LoginPageProps {
  onLoginSuccess?: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login: storeLogin } = useUserStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await login({ username, password });
      storeLogin(response.access_token, response.user);
      onLoginSuccess?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative md:h-screen md:overflow-hidden lg:grid lg:grid-cols-2">
      <div className="bg-muted/60 relative hidden h-full flex-col border-r p-10 lg:flex">
        <div className="from-background absolute inset-0 z-10 bg-gradient-to-t to-transparent" />
        <div className="z-10 flex items-center gap-2">
          <Sparkles className="size-7 text-indigo-600" />
          <p className="text-xl font-semibold">TalentIQ</p>
        </div>
        <div className="z-10 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-xl">
              &ldquo;Intelligent recruitment, reshaping the future. Making every talent match precise and efficient.&rdquo;
            </p>
            <footer className="font-mono text-sm font-semibold">
              ~ TalentIQ · AI Recruitment Platform
            </footer>
          </blockquote>
        </div>
        <div className="absolute inset-0">
          <FloatingPaths position={1} />
          <FloatingPaths position={-1} />
        </div>
      </div>
      <div className="relative flex min-h-screen flex-col justify-center p-4">
        <div
          aria-hidden
          className="absolute inset-0 isolate contain-strict -z-10 opacity-60"
        >
          <div className="bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(220,70%,50%,0.06)_0,hsla(0,0%,55%,.02)_50%,hsla(220,70%,50%,0.01)_80%)] absolute top-0 right-0 h-[320px] w-[140px] -translate-y-[87.5px] rounded-full" />
          <div className="bg-[radial-gradient(50%_50%_at_50%_50%,hsla(220,70%,50%,0.04)_0,hsla(220,70%,50%,0.01)_80%,transparent_100%)] absolute top-0 right-0 h-[320px] w-[60px] translate-x-[5%] -translate-y-1/2 rounded-full" />
          <div className="bg-[radial-gradient(50%_50%_at_50%_50%,hsla(220,70%,50%,0.04)_0,hsla(220,70%,50%,0.01)_80%,transparent_100%)] absolute top-0 right-0 h-[320px] w-[60px] -translate-y-[87.5px] rounded-full" />
        </div>

        <div className="mx-auto space-y-4 w-full max-w-sm">
          <div className="flex items-center gap-2 lg:hidden">
            <Sparkles className="size-7 text-indigo-600" />
            <p className="text-xl font-semibold">TalentIQ</p>
          </div>

          <div className="flex flex-col space-y-1">
            <h1 className="font-heading text-2xl font-bold tracking-wide">
              欢迎回来
            </h1>
            <p className="text-muted-foreground text-base">
              登录您的账户
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}

          <form className="space-y-2" onSubmit={handleSubmit}>
            <p className="text-muted-foreground text-start text-xs">
              请输入您的用户名或姓名和密码登录系统
            </p>
            <div className="relative h-max">
              <Input
                placeholder="用户名"
                className="peer ps-9"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
              <div className="text-muted-foreground pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
                <UserIcon className="size-4" aria-hidden="true" />
              </div>
            </div>

            <div className="relative h-max">
              <Input
                placeholder="密码"
                className="peer ps-9"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <div className="text-muted-foreground pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
                <LockIcon className="size-4" aria-hidden="true" />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  登录中...
                </>
              ) : (
                <span>登 录</span>
              )}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    color: `rgba(15,23,42,${0.1 + i * 0.03})`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        className="h-full w-full text-slate-950 dark:text-white"
        viewBox="0 0 696 316"
        fill="none"
      >
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.1 + path.id * 0.03}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.3, 0.6, 0.3],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'linear',
            }}
          />
        ))}
      </svg>
    </div>
  );
}

export default LoginPage;
