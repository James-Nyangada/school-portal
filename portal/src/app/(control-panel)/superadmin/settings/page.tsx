'use client';

import { useState } from 'react';
import {
	Paper,
	Typography,
	Tabs,
	Tab,
	TextField,
	Button,
	Switch,
	FormControlLabel,
	Grid,
	Divider,
	Chip
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

export default function SuperAdminSettings() {
	const [activeTab, setActiveTab] = useState(0);

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<div className="flex w-full flex-col">
							<Typography className="text-4xl font-extrabold tracking-tight">System Settings</Typography>
							<Typography className="text-secondary mt-8">
								Configure global school preferences and integrations.
							</Typography>
						</div>

						<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow">
							<Tabs
								value={activeTab}
								onChange={(e, val) => setActiveTab(val)}
								indicatorColor="primary"
								textColor="primary"
								variant="scrollable"
								scrollButtons="auto"
								className="border-b"
							>
								<Tab label="School Info" />
								<Tab label="Academic Calendar" />
								<Tab label="Fee Structure" />
								<Tab label="Feature Toggles" />
								<Tab label="Integrations" />
							</Tabs>

							<div className="mt-24">
								{activeTab === 0 && (
									<Grid
										container
										spacing={3}
									>
										<Grid size={{ xs: 12, md: 6 }}>
											<TextField
												fullWidth
												label="School Name"
												defaultValue="Jema Faith Academy"
											/>
										</Grid>
										<Grid size={{ xs: 12, md: 6 }}>
											<TextField
												fullWidth
												label="Domain"
												defaultValue="jemafaith.ac.ke"
											/>
										</Grid>
										<Grid size={{ xs: 12, md: 6 }}>
											<TextField
												fullWidth
												label="Contact Email"
												defaultValue="info@jemafaith.ac.ke"
											/>
										</Grid>
										<Grid size={{ xs: 12, md: 6 }}>
											<TextField
												fullWidth
												label="Contact Phone"
												defaultValue="+254 700 000000"
											/>
										</Grid>
										<Grid size={12}>
											<Button
												variant="contained"
												color="primary"
											>
												Save Changes
											</Button>
										</Grid>
									</Grid>
								)}

								{activeTab === 1 && (
									<Grid
										container
										spacing={3}
									>
										<Grid size={{ xs: 12, md: 6 }}>
											<TextField
												fullWidth
												label="Current Term Start Date"
												type="date"
												InputLabelProps={{ shrink: true }}
												defaultValue="2026-05-04"
											/>
										</Grid>
										<Grid size={{ xs: 12, md: 6 }}>
											<TextField
												fullWidth
												label="Current Term End Date"
												type="date"
												InputLabelProps={{ shrink: true }}
												defaultValue="2026-08-07"
											/>
										</Grid>
										<Grid size={12}>
											<Button
												variant="contained"
												color="primary"
											>
												Update Calendar
											</Button>
										</Grid>
									</Grid>
								)}

								{activeTab === 2 && (
									<div className="flex flex-col gap-16">
										<div>
											<Typography
												variant="subtitle1"
												gutterBottom
											>
												Fee Items (Tuition, Transport, Lunch, etc.)
											</Typography>
											<Typography className="text-secondary">
												Configure the standard fee structures for each grade.
											</Typography>
										</div>
										<div className="flex flex-col items-center rounded-xl border p-24 text-center">
											<FuseSvgIcon
												size={48}
												className="mb-8 text-gray-400"
											>
												lucide:wallet
											</FuseSvgIcon>
											<Typography>Fee structure configuration will be available soon.</Typography>
										</div>
									</div>
								)}

								{activeTab === 3 && (
									<div className="flex flex-col gap-16">
										<Typography variant="subtitle1">System Modules</Typography>
										<Divider />
										<FormControlLabel
											control={<Switch defaultChecked />}
											label="Enable M-Pesa Integration"
										/>
										<FormControlLabel
											control={<Switch defaultChecked />}
											label="Enable SMS Notifications"
										/>
										<FormControlLabel
											control={<Switch defaultChecked />}
											label="Enable CBC Mode (Competency Based Curriculum)"
										/>
										<FormControlLabel
											control={<Switch defaultChecked />}
											label="Enable Newsletter System"
										/>
										<div className="mt-16">
											<Button
												variant="contained"
												color="primary"
											>
												Save Toggles
											</Button>
										</div>
									</div>
								)}

								{activeTab === 4 && (
									<div className="flex flex-col gap-24">
										<div className="flex items-center justify-between">
											<div>
												<Typography
													variant="subtitle1"
													fontWeight="bold"
												>
													Daraja API (Safaricom M-Pesa)
												</Typography>
												<Typography className="text-secondary">
													For automated fee collection.
												</Typography>
											</div>
											<Chip
												label="Connected"
												color="success"
											/>
										</div>
										<Divider />
										<div className="flex items-center justify-between">
											<div>
												<Typography
													variant="subtitle1"
													fontWeight="bold"
												>
													Africa's Talking SMS Gateway
												</Typography>
												<Typography className="text-secondary">
													For parent notifications and alerts.
												</Typography>
											</div>
											<Chip
												label="Not Connected"
												color="default"
											/>
										</div>
										<Divider />
										<div className="flex items-center justify-between">
											<div>
												<Typography
													variant="subtitle1"
													fontWeight="bold"
												>
													SendGrid Email API
												</Typography>
												<Typography className="text-secondary">
													For system emails and newsletters.
												</Typography>
											</div>
											<Chip
												label="Connected"
												color="success"
											/>
										</div>
									</div>
								)}
							</div>
						</Paper>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
