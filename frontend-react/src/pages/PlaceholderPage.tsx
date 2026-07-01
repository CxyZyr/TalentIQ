"use client";

import React from "react";
import { motion } from "framer-motion";
import { Construction } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export function PlaceholderPage({ title, description, icon }: PlaceholderPageProps) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-[60vh]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 mb-6">
        {icon || <Construction className="w-10 h-10 text-blue-500" />}
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">{title}</h1>
      <p className="text-slate-500 text-center max-w-md">
        {description || "此功能正在开发中，敬请期待..."}
      </p>
    </motion.div>
  );
}

export default PlaceholderPage;
