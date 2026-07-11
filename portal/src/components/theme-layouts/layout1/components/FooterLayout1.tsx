import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import { memo } from 'react';
import clsx from 'clsx';
import FooterTheme from '@/contexts/FooterTheme';
import Button from '@mui/material/Button';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import PoweredByLinks from '../../components/PoweredByLinks';

type FooterLayout1Props = { className?: string };

/**
 * The footer layout 1.
 */
function FooterLayout1(props: FooterLayout1Props) {
	const { className } = props;

	return (
		<FooterTheme>
			<AppBar
				id="fuse-footer"
				className={clsx('relative z-20 border-t border-gray-200', className)}
				color="default"
				sx={(theme) => ({
					backgroundColor: theme.vars.palette.background.paper,
					color: theme.vars.palette.text.primary,
					boxShadow: 'none'
				})}
			>
				<Toolbar className="flex min-h-[56px] items-center justify-between overflow-x-auto px-4 py-0 sm:px-6 md:min-h-[64px]">
					<div className="flex items-center gap-3">
						<Button
							className="rounded-full bg-gray-900 text-white hover:bg-gray-800 px-4 py-1.5"
							startIcon={<FuseSvgIcon size={16} className="text-white">lucide:graduation-cap</FuseSvgIcon>}
						>
							School Portal
						</Button>
						<Button
							className="rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-1.5"
							startIcon={<FuseSvgIcon size={16}>lucide:book-open</FuseSvgIcon>}
						>
							Documentation
						</Button>
					</div>
					<div className="flex items-center">
						<PoweredByLinks />
					</div>
				</Toolbar>
			</AppBar>
		</FooterTheme>
	);
}

export default memo(FooterLayout1);
