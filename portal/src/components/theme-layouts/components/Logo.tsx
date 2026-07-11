import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import MainProjectSelection from '@/components/MainProjectSelection';
import clsx from 'clsx';

const Root = styled('div')(({ theme }) => ({
	'& > .logo-icon': {
		transition: theme.transitions.create(['width', 'height'], {
			duration: theme.transitions.duration.shortest,
			easing: theme.transitions.easing.easeInOut
		})
	},
	'& > .badge': {
		transition: theme.transitions.create('opacity', {
			duration: theme.transitions.duration.shortest,
			easing: theme.transitions.easing.easeInOut
		})
	}
}));

type LogoProps = {
	className?: string;
};

/**
 * The logo component.
 */
function Logo(props: LogoProps) {
	const { className = '' } = props;
	return (
		<Root className={clsx('flex flex-shrink-0 flex-grow items-center gap-3', className)}>
			<div className="flex flex-1 items-center gap-2.5">
				<div
					className="logo-icon flex h-8 w-8 items-center justify-center rounded-lg"
					style={{
						background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
						boxShadow: '0 2px 8px rgba(59, 130, 246, 0.35)'
					}}
				>
					<img
						className="h-5 w-5"
						src="/assets/images/logo/logo.svg"
						alt="logo"
						style={{ filter: 'brightness(10)' }}
					/>
				</div>
				<div className="logo-text flex flex-auto flex-col gap-0.5">
					<Typography className="tracking-light text-lg leading-none font-bold">FUSE</Typography>
					<Typography
						className="tracking-light text-[11px] leading-none font-medium"
						color="text.secondary"
					>
						School Portal
					</Typography>
				</div>
			</div>
			<MainProjectSelection />
		</Root>
	);
}

export default Logo;
