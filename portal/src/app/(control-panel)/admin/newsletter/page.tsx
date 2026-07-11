'use client';

import {
	Typography,
	Paper,
	TextField,
	Button,
	Radio,
	RadioGroup,
	FormControlLabel,
	FormControl,
	FormLabel,
	Divider
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

export default function AdminNewsletter() {
	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<Typography className="text-4xl font-extrabold tracking-tight">
							Newsletter & Communications
						</Typography>

						<div className="mx-auto flex w-full max-w-4xl flex-col gap-32">
							<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow">
								<Typography
									variant="h6"
									gutterBottom
								>
									Compose Newsletter
								</Typography>
								<div className="mt-16 flex flex-col gap-24">
									<TextField
										label="Subject"
										fullWidth
										variant="outlined"
									/>

									<FormControl component="fieldset">
										<FormLabel component="legend">Audience</FormLabel>
										<RadioGroup
											row
											defaultValue="all"
										>
											<FormControlLabel
												value="all"
												control={<Radio />}
												label="All Parents"
											/>
											<FormControlLabel
												value="specific"
												control={<Radio />}
												label="Specific Class"
											/>
											<FormControlLabel
												value="outstanding"
												control={<Radio />}
												label="Parents with Outstanding Balances"
											/>
										</RadioGroup>
									</FormControl>

									<TextField
										label="Message Body"
										multiline
										rows={8}
										fullWidth
										variant="outlined"
										placeholder="Write your newsletter here..."
									/>

									<div className="flex justify-end gap-16">
										<Button
											variant="outlined"
											color="inherit"
										>
											Save Draft
										</Button>
										<Button
											variant="contained"
											color="primary"
											startIcon={<FuseSvgIcon>lucide:send</FuseSvgIcon>}
										>
											Send Now
										</Button>
									</div>
								</div>
							</Paper>

							<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-24 text-center shadow">
								<Typography
									variant="h6"
									align="left"
									gutterBottom
								>
									Delivery History
								</Typography>
								<Divider className="mb-32" />
								<FuseSvgIcon
									size={48}
									className="mx-auto mb-8 text-gray-400"
								>
									lucide:mail-x
								</FuseSvgIcon>
								<Typography color="textSecondary">No newsletters sent yet.</Typography>
							</Paper>
						</div>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
