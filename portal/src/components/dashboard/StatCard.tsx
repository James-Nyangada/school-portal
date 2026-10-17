import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import React from 'react';

interface StatCardProps {
  icon: string;
  iconColor: string;       // e.g. "text-blue-600"
  iconBg: string;          // e.g. "bg-blue-50"
  label: string;           // e.g. "Total Users"
  value: React.ReactNode;  // e.g. 10 or <span...
  caption: React.ReactNode;         // e.g. "Registered across all roles"
  onMenuClick?: () => void;
  footer?: React.ReactNode;
}

export function StatCard({
  icon,
  iconColor,
  iconBg,
  label,
  value,
  caption,
  onMenuClick,
  footer
}: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4 h-full">
      {/* Row 1: icon chip + label + kebab */}
      <div className="flex items-start justify-between gap-2">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
          <FuseSvgIcon className={`w-4.5 h-4.5 ${iconColor}`} size={18}>{icon}</FuseSvgIcon>
        </div>
        <span className="flex-1 min-w-0 text-right text-[11px] font-semibold tracking-wide text-gray-400 uppercase leading-tight mt-1">
          {label}
        </span>
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="text-gray-400 hover:text-gray-600 shrink-0"
            aria-label="Card options"
          >
            <FuseSvgIcon size={16}>lucide:ellipsis-vertical</FuseSvgIcon>
          </button>
        )}
      </div>

      {/* Row 2: big number */}
      <div className="text-3xl font-bold text-gray-900 leading-none mt-2">
        {value}
      </div>

      {/* Row 3: caption */}
      <p className="text-sm text-gray-500 leading-snug">{caption}</p>

      {/* Optional Row 4: footer */}
      {footer && (
        <div className="mt-auto">
          {footer}
        </div>
      )}
    </div>
  );
}
