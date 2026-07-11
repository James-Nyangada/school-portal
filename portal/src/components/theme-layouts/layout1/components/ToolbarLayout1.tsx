import Toolbar from '@mui/material/Toolbar';
import clsx from 'clsx';
import { memo } from 'react';
import NavbarToggleButton from 'src/components/theme-layouts/components/navbar/NavbarToggleButton';
import themeOptions from 'src/configs/themeOptions';
import _ from 'lodash';
import LightDarkModeToggle from 'src/components/LightDarkModeToggle';
import useFuseLayoutSettings from '@fuse/core/FuseLayout/useFuseLayoutSettings';
import AdjustFontSize from '../../components/AdjustFontSize';
import FullScreenToggle from '../../components/FullScreenToggle';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import NavigationShortcuts from '../../components/navigation/NavigationShortcuts';
import NavigationSearch from '../../components/navigation/NavigationSearch';
import QuickPanelToggleButton from '../../components/quickPanel/QuickPanelToggleButton';
import { Layout1ConfigDefaultsType } from '@/components/theme-layouts/layout1/Layout1Config';
import useThemeMediaQuery from '../../../../@fuse/hooks/useThemeMediaQuery';
import { AppBar, Divider, IconButton, Badge } from '@mui/material';
import ToolbarTheme from 'src/contexts/ToolbarTheme';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

type ToolbarLayout1Props = {
	className?: string;
};

/**
 * The toolbar layout 1.
 */
function ToolbarLayout1(props: ToolbarLayout1Props) {
	const { className } = props;

	const settings = useFuseLayoutSettings();
	const config = settings.config as Layout1ConfigDefaultsType;
	const isMobile = useThemeMediaQuery((theme) => theme.breakpoints.down('md'));

	return (
		<ToolbarTheme>
			<AppBar
				id="fuse-toolbar"
				position="static"
				className={clsx('sticky top-0 z-30 shrink-0 flex border-b border-gray-200', className)}
				sx={(theme) => ({
					backgroundColor: theme.vars.palette.background.paper,
					color: theme.vars.palette.text.primary,
					boxShadow: 'none'
				})}
			>
				<Toolbar className="min-h-[64px] p-0 md:min-h-[64px]">
					<div className="flex flex-1 items-center gap-3 px-4 md:px-6">
						{config.navbar.display && config.navbar.position === 'left' && (
							<>
								<NavbarToggleButton className="h-10 w-10 text-gray-500 hover:bg-gray-100" />

								<Divider
									orientation="vertical"
									flexItem
									variant="middle"
									className="mx-2 my-4 h-6 border-gray-200"
								/>
							</>
						)}

						{!isMobile && <NavigationShortcuts />}
					</div>

					<div className="flex items-center gap-1 overflow-x-auto px-4 py-2 md:px-6">
						<LanguageSwitcher />
						<AdjustFontSize />
						<FullScreenToggle />
						<LightDarkModeToggle
							lightTheme={_.find(themeOptions, { id: 'Default' })}
							darkTheme={_.find(themeOptions, { id: 'Default Dark' })}
						/>
						<NavigationSearch />
						
						<IconButton className="h-10 w-10 text-gray-500 hover:bg-gray-100">
							<Badge color="error" variant="dot" overlap="circular" anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
								<FuseSvgIcon size={20}>lucide:bell</FuseSvgIcon>
							</Badge>
						</IconButton>
						
						<QuickPanelToggleButton />
					</div>

					{config.navbar.display && config.navbar.position === 'right' && (
						<>
							{!isMobile && (
								<>
									<Divider
										orientation="vertical"
										flexItem
										variant="middle"
										className="mx-2 my-4 h-6 border-gray-200"
									/>
									<NavbarToggleButton className="h-10 w-10 text-gray-500 hover:bg-gray-100" />
								</>
							)}

							{isMobile && <NavbarToggleButton className="h-10 w-10 p-0 sm:mx-2 text-gray-500 hover:bg-gray-100" />}
						</>
					)}
				</Toolbar>
			</AppBar>
		</ToolbarTheme>
	);
}

export default memo(ToolbarLayout1);
