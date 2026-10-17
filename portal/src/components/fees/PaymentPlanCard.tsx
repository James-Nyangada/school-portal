import { Chip, Paper, Typography } from '@mui/material';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { PlanSchedule, formatDate, formatKES } from '@/lib/finance';

/** The current term's installment milestones: what's due by when, and whether it has been met. */
export default function PaymentPlanCard({ schedule }: { schedule: PlanSchedule }) {
	return (
		<Paper className="flex flex-col gap-4 rounded-2xl p-6 shadow-sm">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<Typography className="text-lg font-bold">Payment plan</Typography>
					<Typography className="text-sm text-gray-500">{schedule.plan.name}</Typography>
				</div>
				{schedule.behindBy > 0 ? (
					<Chip
						color="error"
						label={`${formatKES(schedule.behindBy)} behind schedule`}
					/>
				) : (
					<Chip
						color="success"
						label="On track"
					/>
				)}
			</div>
			<ol className="flex flex-col gap-2">
				{schedule.milestones.map((m) => (
					<li
						key={m.week}
						className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-2 text-sm"
					>
						<span className="flex items-center gap-2">
							<FuseSvgIcon
								size={16}
								className={m.met ? 'text-green-600' : m.overdue ? 'text-red-600' : 'text-gray-400'}
							>
								{m.met ? 'lucide:circle-check' : m.overdue ? 'lucide:circle-alert' : 'lucide:circle'}
							</FuseSvgIcon>
							{m.percent}% by {m.dueDate ? formatDate(m.dueDate) : `week ${m.week}`}
						</span>
						<span className={`font-semibold ${m.overdue ? 'text-red-600' : ''}`}>
							{formatKES(m.amountDue)}
						</span>
					</li>
				))}
			</ol>
			{schedule.next && !schedule.next.overdue && (
				<Typography className="text-xs text-gray-500">
					Next: {formatKES(schedule.next.amountDue)} paid in total by{' '}
					{schedule.next.dueDate ? formatDate(schedule.next.dueDate) : `week ${schedule.next.week}`}.
				</Typography>
			)}
		</Paper>
	);
}
