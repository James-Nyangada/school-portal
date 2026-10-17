'use client';

import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import SchoolSettingsPage from '@/components/school/SchoolSettingsPage';

export default function AdminSchoolSettings() {
	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<SchoolSettingsPage
				title="School Settings"
				subtitle="School information for the website, and the academic calendar."
			/>
		</AuthGuardRedirect>
	);
}
