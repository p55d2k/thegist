"use client";

import { FC } from "react";
import {
  FiCpu,
  FiScissors,
  FiMail,
  FiFileText,
  FiSearch,
  FiZap,
  FiHome,
  FiUser,
  FiSettings,
  FiHeart,
  FiStar,
  FiClock,
  FiCalendar,
  FiCamera,
  FiMusic,
  FiVideo,
  FiPhone,
  FiMap,
  FiGlobe,
  FiLock,
  FiUnlock,
  FiEye,
  FiEyeOff,
  FiDownload,
  FiUpload,
  FiTrash,
  FiEdit,
  FiPlus,
  FiMinus,
  FiCheck,
  FiX,
  FiArrowRight,
  FiArrowLeft,
  FiChevronUp,
  FiChevronDown,
} from "react-icons/fi";

interface IconProps {
  name: string;
  className?: string;
}

const gradients = [
  "from-blue-400 to-blue-600",
  "from-pink-400 to-pink-600",
  "from-emerald-400 to-emerald-600",
  "from-yellow-400 to-yellow-600",
  "from-indigo-400 to-indigo-600",
  "from-red-400 to-red-600",
  "from-purple-400 to-purple-600",
  "from-orange-400 to-orange-600",
  "from-teal-400 to-teal-600",
  "from-rose-400 to-rose-600",
  "from-cyan-400 to-cyan-600",
  "from-lime-400 to-lime-600",
  "from-violet-400 to-violet-600",
  "from-amber-400 to-amber-600",
  "from-sky-400 to-sky-600",
  "from-fuchsia-400 to-fuchsia-600",
  "from-stone-400 to-stone-600",
  "from-slate-400 to-slate-600",
  "from-gray-400 to-gray-600",
  "from-neutral-400 to-neutral-600",
  "from-zinc-400 to-zinc-600",
  "from-green-400 to-green-600",
];

const iconMap: Record<string, FC<any>> = {
  robot: FiCpu,
  cut: FiScissors,
  mail: FiMail,
  newspaper: FiFileText,
  search: FiSearch,
  spark: FiZap,
  home: FiHome,
  user: FiUser,
  settings: FiSettings,
  heart: FiHeart,
  star: FiStar,
  clock: FiClock,
  calendar: FiCalendar,
  camera: FiCamera,
  music: FiMusic,
  video: FiVideo,
  phone: FiPhone,
  map: FiMap,
  globe: FiGlobe,
  lock: FiLock,
  unlock: FiUnlock,
  eye: FiEye,
  eyeOff: FiEyeOff,
  download: FiDownload,
  upload: FiUpload,
  trash: FiTrash,
  edit: FiEdit,
  plus: FiPlus,
  minus: FiMinus,
  check: FiCheck,
  x: FiX,
  arrowRight: FiArrowRight,
  arrowLeft: FiArrowLeft,
  chevronUp: FiChevronUp,
  chevronDown: FiChevronDown,
};

const Icon: FC<IconProps> = ({ name, className = "" }) => {
  const gradientIndex =
    name.split("").reduce((a, b) => a + b.charCodeAt(0), 0) % gradients.length;
  const gradient = gradients[gradientIndex];
  const IconComponent = iconMap[name];

  if (!IconComponent) return null;

  return (
    <div
      className={`grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br ${gradient} shadow-md ${className}`}
    >
      <IconComponent className="h-5 w-5 text-white" />
    </div>
  );
};

export default Icon;
