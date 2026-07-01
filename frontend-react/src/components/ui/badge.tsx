import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground border border-gray-300",
        success:
          "border-transparent bg-green-500 text-white",
        warning:
          "border-transparent bg-yellow-500 text-white",
        info:
          "border-transparent bg-gray-400 text-white",
        // 学校类型标签
        red: "bg-red-600 text-white",
        "red-subtle": "bg-red-100 text-red-700",
        pink: "bg-pink-600 text-white",
        "pink-subtle": "bg-pink-100 text-pink-700",
        green: "bg-green-600 text-white",
        "green-subtle": "bg-green-100 text-green-700",
        // AI 标签 - turbo 渐变风格
        turbo: "bg-gradient-to-r from-[#0096FF] to-[#6C47FF] text-white",
        // 其他颜色
        blue: "bg-blue-600 text-white",
        "blue-subtle": "bg-blue-100 text-blue-700",
        purple: "bg-purple-600 text-white",
        "purple-subtle": "bg-purple-100 text-purple-700",
        amber: "bg-amber-600 text-white",
        "amber-subtle": "bg-amber-100 text-amber-700",
        gray: "bg-gray-600 text-white",
        "gray-subtle": "bg-gray-100 text-gray-700",
        teal: "bg-teal-600 text-white",
        "teal-subtle": "bg-teal-100 text-teal-700",
      },
      size: {
        sm: "text-[10px] h-4 px-1.5",
        md: "text-[11px] h-5 px-2",
        lg: "text-xs h-6 px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
