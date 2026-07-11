import React from 'react';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

export interface ActivityItem {
  title: string;
  timestamp: string; // pre-formatted, e.g. "2 Jul, 10:42 AM"
  actor?: string;     // e.g. "Super Admin"
}

export function RecentActivityCard({ items }: { items: ActivityItem[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 h-full flex flex-col">
      <h3 className="font-semibold text-gray-900 mb-4">Recent Activity</h3>

      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-400 py-6 text-center">
            No recent activity yet.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 flex-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">{item.title}</p>
                <span className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                  <FuseSvgIcon size={12}>lucide:clock</FuseSvgIcon>
                  {item.timestamp}
                  {item.actor && <span className="ml-1">· {item.actor}</span>}
                </span>
              </div>
              <FuseSvgIcon size={16} className="text-gray-300">lucide:chevron-right</FuseSvgIcon>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
