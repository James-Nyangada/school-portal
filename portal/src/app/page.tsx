'use client';

import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import useNavigate from '@fuse/hooks/useNavigate';
import FuseLoading from '@fuse/core/FuseLoading';

/**
 * Root page — redirects authenticated users to their role-appropriate dashboard.
 */
function RootPage() {
	const { data: session, status } = useSession();
	const navigate = useNavigate();

	useEffect(() => {
		if (status === 'loading') return;

		if (!session) {
			navigate('/sign-in');
			return;
		}

		const role = (session.user as any)?.role;
		const userStatus = (session.user as any)?.status;

		if (userStatus === 'PENDING_ACTIVATION') {
			navigate('/setup-password');
			return;
		}

		switch (role) {
			case 'SUPER_ADMIN':
				navigate('/superadmin/dashboard');
				break;
			case 'ADMIN':
				navigate('/admin/dashboard');
				break;
			case 'TEACHER':
				navigate('/teacher/dashboard');
				break;
			case 'FINANCE':
				navigate('/finance/dashboard');
				break;
			case 'PARENT':
				navigate('/parent/dashboard');
				break;
			case 'STUDENT':
				navigate('/student/dashboard');
				break;
			default:
				navigate('/sign-in');
		}
	}, [session, status, navigate]);

	return <FuseLoading />;
}

export default RootPage;
