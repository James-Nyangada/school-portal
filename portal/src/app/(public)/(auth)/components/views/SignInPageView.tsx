'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import SignInPageTitle from '../ui/SignInPageTitle';
import SignInPageForm from '../forms/SignInPageForm';

function SignInPageView() {
	const [selectedRole, setSelectedRole] = useState<'STUDENT' | 'PARENT' | 'TEACHER' | 'ADMIN' | 'FINANCE'>('STUDENT');

	const handleTabChange = (event: React.SyntheticEvent, newValue: string) => {
		setSelectedRole(newValue as any);
	};

	return (
		<div className="flex min-h-screen min-w-0 flex-auto flex-col items-center bg-gradient-to-br from-indigo-50 via-white to-cyan-50 sm:flex-row sm:justify-center md:items-start md:justify-start">
			<Paper className="mt-10 h-full w-full border border-white/40 px-4 py-8 backdrop-blur-md sm:h-auto sm:w-auto sm:rounded-2xl sm:p-12 sm:shadow-2xl md:flex md:w-full md:max-w-xl md:items-center md:justify-center md:p-16">
				<div className="mx-auto flex w-full flex-col gap-6">
					<SignInPageTitle />

					<Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
						<Tabs
							value={selectedRole}
							onChange={handleTabChange}
							variant="scrollable"
							scrollButtons="auto"
							textColor="secondary"
							indicatorColor="secondary"
							aria-label="Role selection tabs"
						>
							<Tab
								label="Student"
								value="STUDENT"
							/>
							<Tab
								label="Parent"
								value="PARENT"
							/>
							<Tab
								label="Teacher"
								value="TEACHER"
							/>
							<Tab
								label="Admin"
								value="ADMIN"
							/>
							<Tab
								label="Finance"
								value="FINANCE"
							/>
						</Tabs>
					</Box>

					<SignInPageForm selectedRole={selectedRole} />
				</div>
			</Paper>
		</div>
	);
}

export default SignInPageView;
