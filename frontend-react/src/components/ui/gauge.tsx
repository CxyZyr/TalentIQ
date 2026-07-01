import React from "react";

const sizes = {
  tiny: 20,
  small: 32,
  medium: 48,
  large: 64,
};

interface GaugeProps {
  size?: keyof typeof sizes;
  value: number;
  maxValue?: number;
  colors?: { [key: string]: string };
  showValue?: boolean;
  label?: string;
}

const defaultColors = {
  "0": "#ef4444",   // red
  "40": "#f59e0b",  // amber
  "60": "#3b82f6",  // blue
  "80": "#22c55e",  // green
};

export const Gauge = ({
  size = "small",
  value,
  maxValue = 100,
  colors = defaultColors,
  showValue = true,
  label,
}: GaugeProps) => {
  const percentage = Math.min(100, Math.max(0, (value / maxValue) * 100));
  const r = 40;
  const circumference = 2 * r * Math.PI;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference * (1 - percentage / 100);

  // 根据百分比获取颜色
  const getColor = () => {
    const thresholds = Object.keys(colors)
      .map(Number)
      .sort((a, b) => b - a);
    for (const threshold of thresholds) {
      if (percentage >= threshold) {
        return colors[threshold.toString()];
      }
    }
    return colors["0"] || "#ef4444";
  };

  const strokeColor = getColor();
  const sizeValue = sizes[size];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: sizeValue, height: sizeValue }}>
        <svg
          width={sizeValue}
          height={sizeValue}
          viewBox="0 0 100 100"
          className="-rotate-90"
        >
          {/* 背景圆环 */}
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          {/* 进度圆环 */}
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500 ease-out"
          />
        </svg>
        {/* 中心数值 */}
        {showValue && size !== "tiny" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="font-semibold text-gray-800"
              style={{
                fontSize: size === "small" ? "10px" : size === "medium" ? "12px" : "16px",
              }}
            >
              {Math.round(value)}
            </span>
          </div>
        )}
      </div>
      {/* 标签 */}
      {label && (
        <span className="text-xs text-gray-500 whitespace-nowrap">{label}</span>
      )}
    </div>
  );
};

export default Gauge;
