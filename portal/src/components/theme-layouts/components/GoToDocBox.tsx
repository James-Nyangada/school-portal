import { Box } from '@mui/material';
import Typography from '@mui/material/Typography';
import clsx from 'clsx';
import Link from '@fuse/core/Link';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

type GoToDocBoxProps = {
	className?: string;
};

function GoToDocBox(props: GoToDocBoxProps) {
	const { className } = props;
	return (
		<Box
			className={clsx('flex flex-col gap-2 rounded-xl p-4', className)}
			sx={{
				backgroundColor: 'rgba(59, 130, 246, 0.04)',
				border: '1px solid',
				borderColor: 'divider'
			}}
		>
			<Typography className="text-[13px] font-semibold" color="text.primary">
				Need assistance to get started?
			</Typography>
			<Typography
				className="flex items-center gap-1 text-[13px] font-medium"
				component={Link}
				to="/documentation"
				sx={{ color: '#3B82F6', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
			>
				View documentation <FuseSvgIcon size={14}>lucide:arrow-right</FuseSvgIcon>
			</Typography>
		</Box>
	);
}

export default GoToDocBox;
