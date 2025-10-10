"use client";

import { FC } from "react";
import {
  FiCpu,
  FiScissors,
  FiMail,
  FiFileText,
  FiSearch,
  FiZap,
} from "react-icons/fi";

interface IconProps {
  name: string;
  className?: string;
}

const colorMap: Record<string, string> = {
  robot: "from-blue-400 to-blue-600",
  cut: "from-pink-400 to-pink-600",
  mail: "from-emerald-400 to-emerald-600",
  newspaper: "from-yellow-400 to-yellow-600",
  search: "from-indigo-400 to-indigo-600",
  spark: "from-red-400 to-red-600",
};

const Icon: FC<IconProps> = ({ name, className = "" }) => {
  const gradient = colorMap[name] ?? "from-slate-400 to-slate-600";

  const content =
    name === "robot" ? (
      <FiCpu className="h-5 w-5 text-white" />
    ) : name === "cut" ? (
      <FiScissors className="h-5 w-5 text-white" />
    ) : name === "mail" ? (
      <FiMail className="h-5 w-5 text-white" />
    ) : name === "newspaper" ? (
      <FiFileText className="h-5 w-5 text-white" />
    ) : name === "search" ? (
      <FiSearch className="h-5 w-5 text-white" />
    ) : name === "spark" ? (
      <FiZap className="h-5 w-5 text-white" />
    ) : null;

  return (
    <div
      className={`grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br ${gradient} shadow-md ${className}`}
    >
      {content}
    </div>
  );
};

export default Icon;
