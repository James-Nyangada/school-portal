import i18n from '@i18n';
import { FuseNavItemType } from '@fuse/core/FuseNavigation/types/FuseNavItemType';
import ar from './navigation-i18n/ar';
import en from './navigation-i18n/en';
import tr from './navigation-i18n/tr';

i18n.addResourceBundle('en', 'navigation', en);
i18n.addResourceBundle('tr', 'navigation', tr);
i18n.addResourceBundle('ar', 'navigation', ar);

/**
 * The navigationConfig defines role-based sidebar navigation for the School Dashboard.
 * Each item's `auth` property controls visibility per role.
 */
const navigationConfig: FuseNavItemType[] = [
	// ── SUPER ADMIN ──────────────────────────────────────────
	{
		id: 'superadmin-group',
		title: 'System Administration',
		type: 'group',
		icon: 'lucide:shield',
		auth: ['SUPER_ADMIN'],
		children: [
			{
				id: 'superadmin-overview',
				title: 'Overview',
				type: 'item',
				icon: 'lucide:layout-dashboard',
				url: '/superadmin/dashboard',
				auth: ['SUPER_ADMIN']
			},
			{
				id: 'superadmin-users',
				title: 'User Management',
				type: 'item',
				icon: 'lucide:users',
				url: '/superadmin/users',
				auth: ['SUPER_ADMIN']
			},
			{
				id: 'superadmin-audit',
				title: 'Audit Logs',
				type: 'item',
				icon: 'lucide:scroll-text',
				url: '/superadmin/audit-logs',
				auth: ['SUPER_ADMIN']
			},
			{
				id: 'superadmin-settings',
				title: 'System Settings',
				type: 'item',
				icon: 'lucide:settings',
				url: '/superadmin/settings',
				auth: ['SUPER_ADMIN']
			},
			{
				id: 'superadmin-roles',
				title: 'Roles & Permissions',
				type: 'item',
				icon: 'lucide:lock',
				url: '/superadmin/roles',
				auth: ['SUPER_ADMIN']
			}
		]
	},

	// ── ADMIN ────────────────────────────────────────────────
	{
		id: 'admin-group',
		title: 'School Administration',
		type: 'group',
		icon: 'lucide:building-2',
		auth: ['SUPER_ADMIN', 'ADMIN'],
		children: [
			{
				id: 'admin-overview',
				title: 'Overview',
				type: 'item',
				icon: 'lucide:layout-dashboard',
				url: '/admin/dashboard',
				auth: ['SUPER_ADMIN', 'ADMIN']
			},
			{
				id: 'admin-admissions',
				title: 'Admissions',
				type: 'item',
				icon: 'lucide:user-plus',
				url: '/admin/admissions',
				auth: ['SUPER_ADMIN', 'ADMIN']
			},
			{
				id: 'admin-staff-students',
				title: 'Staff & Students',
				type: 'item',
				icon: 'lucide:users',
				url: '/admin/staff-students',
				auth: ['SUPER_ADMIN', 'ADMIN']
			},
			{
				id: 'admin-classes',
				title: 'Classes & Streams',
				type: 'item',
				icon: 'lucide:school',
				url: '/admin/classes',
				auth: ['SUPER_ADMIN', 'ADMIN']
			},
			{
				id: 'admin-subjects',
				title: 'Subjects Registry',
				type: 'item',
				icon: 'lucide:book-marked',
				url: '/admin/subjects',
				auth: ['SUPER_ADMIN', 'ADMIN']
			},
			{
				id: 'admin-report-cards',
				title: 'Report Cards Engine',
				type: 'item',
				icon: 'lucide:printer',
				url: '/admin/report-cards',
				auth: ['SUPER_ADMIN', 'ADMIN']
			},
			{
				id: 'admin-timetable',
				title: 'Timetable Builder',
				type: 'item',
				icon: 'lucide:calendar-days',
				url: '/admin/timetable',
				auth: ['SUPER_ADMIN', 'ADMIN']
			},
			{
				id: 'admin-grade-approvals',
				title: 'Grade Approvals',
				type: 'item',
				icon: 'lucide:check-circle',
				url: '/admin/grade-approvals',
				auth: ['SUPER_ADMIN', 'ADMIN']
			},
			{
				id: 'admin-analytics',
				title: 'Analytics',
				type: 'item',
				icon: 'lucide:bar-chart-3',
				url: '/admin/analytics',
				auth: ['SUPER_ADMIN', 'ADMIN']
			},
			{
				id: 'admin-newsletter',
				title: 'Newsletter',
				type: 'item',
				icon: 'lucide:mail',
				url: '/admin/newsletter',
				auth: ['SUPER_ADMIN', 'ADMIN']
			}
		]
	},

	// ── TEACHER ──────────────────────────────────────────────
	{
		id: 'teacher-group',
		title: 'Teaching',
		type: 'group',
		icon: 'lucide:book-open',
		auth: ['SUPER_ADMIN', 'TEACHER'],
		children: [
			{
				id: 'teacher-overview',
				title: 'Overview',
				type: 'item',
				icon: 'lucide:layout-dashboard',
				url: '/teacher/dashboard',
				auth: ['SUPER_ADMIN', 'TEACHER']
			},
			{
				id: 'teacher-timetable',
				title: 'My Timetable',
				type: 'item',
				icon: 'lucide:calendar-days',
				url: '/teacher/timetable',
				auth: ['SUPER_ADMIN', 'TEACHER']
			},
			{
				id: 'teacher-gradebook',
				title: 'Gradebook',
				type: 'item',
				icon: 'lucide:notebook-pen',
				url: '/teacher/gradebook',
				auth: ['SUPER_ADMIN', 'TEACHER']
			},
			{
				id: 'teacher-attendance',
				title: 'Attendance',
				type: 'item',
				icon: 'lucide:clipboard-check',
				url: '/teacher/attendance',
				auth: ['SUPER_ADMIN', 'TEACHER']
			},
			{
				id: 'teacher-assignments',
				title: 'Assignments & Quizzes',
				type: 'item',
				icon: 'lucide:file-text',
				url: '/teacher/assignments',
				auth: ['SUPER_ADMIN', 'TEACHER']
			},
			{
				id: 'teacher-calendar',
				title: 'Calendar',
				type: 'item',
				icon: 'lucide:calendar',
				url: '/teacher/calendar',
				auth: ['SUPER_ADMIN', 'TEACHER']
			}
		]
	},

	// ── FINANCE ──────────────────────────────────────────────
	{
		id: 'finance-group',
		title: 'Finance',
		type: 'group',
		icon: 'lucide:wallet',
		auth: ['SUPER_ADMIN', 'FINANCE'],
		children: [
			{
				id: 'finance-overview',
				title: 'Overview',
				type: 'item',
				icon: 'lucide:layout-dashboard',
				url: '/finance/dashboard',
				auth: ['SUPER_ADMIN', 'FINANCE']
			},
			{
				id: 'finance-fee-records',
				title: 'Fee Records',
				type: 'item',
				icon: 'lucide:receipt',
				url: '/finance/fee-records',
				auth: ['SUPER_ADMIN', 'FINANCE']
			},
			{
				id: 'finance-record-payment',
				title: 'Record Payment',
				type: 'item',
				icon: 'lucide:circle-plus',
				url: '/finance/record-payment',
				auth: ['SUPER_ADMIN', 'FINANCE']
			},
			{
				id: 'finance-reports',
				title: 'Reports',
				type: 'item',
				icon: 'lucide:file-bar-chart',
				url: '/finance/reports',
				auth: ['SUPER_ADMIN', 'FINANCE']
			}
		]
	},

	// ── PARENT ───────────────────────────────────────────────
	{
		id: 'parent-group',
		title: 'My Children',
		type: 'group',
		icon: 'lucide:heart',
		auth: ['SUPER_ADMIN', 'PARENT'],
		children: [
			{
				id: 'parent-overview',
				title: 'Overview',
				type: 'item',
				icon: 'lucide:layout-dashboard',
				url: '/parent/dashboard',
				auth: ['SUPER_ADMIN', 'PARENT']
			},
			{
				id: 'parent-fees',
				title: 'Fees & Payment',
				type: 'item',
				icon: 'lucide:wallet',
				url: '/parent/fees',
				auth: ['SUPER_ADMIN', 'PARENT']
			},
			{
				id: 'parent-grades',
				title: 'Grades',
				type: 'item',
				icon: 'lucide:graduation-cap',
				url: '/parent/grades',
				auth: ['SUPER_ADMIN', 'PARENT']
			},
			{
				id: 'parent-timetable',
				title: 'Timetable',
				type: 'item',
				icon: 'lucide:calendar-days',
				url: '/parent/timetable',
				auth: ['SUPER_ADMIN', 'PARENT']
			},
			{
				id: 'parent-attendance',
				title: 'Attendance',
				type: 'item',
				icon: 'lucide:clipboard-check',
				url: '/parent/attendance',
				auth: ['SUPER_ADMIN', 'PARENT']
			},
			{
				id: 'parent-calendar',
				title: 'Calendar',
				type: 'item',
				icon: 'lucide:calendar',
				url: '/parent/calendar',
				auth: ['SUPER_ADMIN', 'PARENT']
			}
		]
	},

	// ── STUDENT ──────────────────────────────────────────────
	{
		id: 'student-group',
		title: 'My School',
		type: 'group',
		icon: 'lucide:backpack',
		auth: ['SUPER_ADMIN', 'STUDENT'],
		children: [
			{
				id: 'student-overview',
				title: 'Overview',
				type: 'item',
				icon: 'lucide:layout-dashboard',
				url: '/student/dashboard',
				auth: ['SUPER_ADMIN', 'STUDENT']
			},
			{
				id: 'student-grades',
				title: 'Grades',
				type: 'item',
				icon: 'lucide:graduation-cap',
				url: '/student/grades',
				auth: ['SUPER_ADMIN', 'STUDENT']
			},
			{
				id: 'student-timetable',
				title: 'Timetable',
				type: 'item',
				icon: 'lucide:calendar-days',
				url: '/student/timetable',
				auth: ['SUPER_ADMIN', 'STUDENT']
			},
			{
				id: 'student-fees',
				title: 'Fees',
				type: 'item',
				icon: 'lucide:wallet',
				url: '/student/fees',
				auth: ['SUPER_ADMIN', 'STUDENT']
			},
			{
				id: 'student-assignments',
				title: 'Assignments',
				type: 'item',
				icon: 'lucide:file-text',
				url: '/student/assignments',
				auth: ['SUPER_ADMIN', 'STUDENT']
			},
			{
				id: 'student-calendar',
				title: 'Calendar',
				type: 'item',
				icon: 'lucide:calendar',
				url: '/student/calendar',
				auth: ['SUPER_ADMIN', 'STUDENT']
			}
		]
	}
];

export default navigationConfig;
