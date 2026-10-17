import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import Link from '@fuse/core/Link';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { darken } from '@mui/material/styles';
import clsx from 'clsx';
import Popover, { PopoverProps } from '@mui/material/Popover';
import useUser from '@auth/useUser';

type UserMenuProps = {
	className?: string;
	popoverProps?: Partial<PopoverProps>;
	arrowIcon?: string;
	dense?: boolean;
	onlyAvatar?: boolean;
};

/**
 * The user menu.
 */
function UserMenu(props: UserMenuProps) {
	const { className, popoverProps, arrowIcon = 'lucide:chevron-up', dense = false, onlyAvatar = false } = props;
	const { data: user, signOut, isGuest } = useUser();
	const [userMenu, setUserMenu] = useState<HTMLElement | null>(null);
	const userMenuClick = (event: React.MouseEvent<HTMLElement>) => {
		setUserMenu(event.currentTarget);
	};

	const userMenuClose = () => {
		setUserMenu(null);
	};

	if (!user) {
		return null;
	}

	const role = Array.isArray(user.role) ? user.role[0] : user.role;
	const roleLabel = role
		? role
				.toLowerCase()
				.split('_')
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(' ')
		: '';

	return (
		<>
			<Button
				className={clsx(
					'user-menu flex shrink-0 justify-start rounded-xl px-2 py-2 hover:bg-gray-50',
					onlyAvatar ? 'min-w-0 p-0' : dense ? 'min-h-10 gap-2' : 'min-h-14 gap-3',
					className
				)}
				onClick={userMenuClick}
				color="inherit"
			>
				{user?.photoURL ? (
					<Avatar
						sx={(theme) => ({
							background: theme.vars.palette.background.default,
							color: theme.vars.palette.text.secondary
						})}
						className={clsx('avatar rounded-full', dense ? 'h-8 w-8' : 'h-10 w-10')}
						alt="user photo"
						src={user?.photoURL}
					/>
				) : (
					<Avatar
						sx={(theme) => ({
							background: (theme) => darken(theme.palette.background.default, 0.05),
							color: theme.vars.palette.text.secondary
						})}
						className={clsx('avatar rounded-full', dense ? 'h-8 w-8' : 'h-10 w-10')}
					>
						{user?.displayName?.[0]}
					</Avatar>
				)}
				{!onlyAvatar && (
					<>
						<div className={clsx('flex min-w-0 flex-auto flex-col items-start', dense ? '' : 'gap-0.5')}>
							<Typography
								component="span"
								className={clsx(
									'title w-full truncate text-left font-bold tracking-tight text-gray-900',
									dense ? 'text-sm' : 'text-[14px]'
								)}
							>
								{user.displayName}
							</Typography>
							{user.email && user.email !== user.displayName && (
								<Typography
									className={clsx(
										'w-full truncate text-left font-medium text-gray-500',
										dense ? 'text-xs' : 'text-[12px]'
									)}
								>
									{user.email}
								</Typography>
							)}
							{roleLabel && (
								<span className="mt-0.5 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-blue-700 uppercase">
									{roleLabel}
								</span>
							)}
						</div>
						<div className="flex shrink-0 items-center text-gray-400">
							<FuseSvgIcon
								className="arrow"
								size={16}
							>
								{arrowIcon}
							</FuseSvgIcon>
						</div>
					</>
				)}
			</Button>
			<Popover
				open={Boolean(userMenu)}
				anchorEl={userMenu}
				onClose={userMenuClose}
				anchorOrigin={{
					vertical: 'top',
					horizontal: 'right'
				}}
				transformOrigin={{
					vertical: 'top',
					horizontal: 'left'
				}}
				classes={{
					paper: 'min-w-48 rounded-xl shadow-lg border border-gray-100'
				}}
				{...popoverProps}
			>
				{isGuest ? (
					<>
						<MenuItem
							component={Link}
							to="/sign-in"
							role="button"
						>
							<ListItemIcon>
								<FuseSvgIcon size={18}>lucide:lock</FuseSvgIcon>
							</ListItemIcon>
							<ListItemText primary="Sign In" />
						</MenuItem>
						<MenuItem
							component={Link}
							to="/sign-up"
							role="button"
						>
							<ListItemIcon>
								<FuseSvgIcon size={18}>lucide:user-plus</FuseSvgIcon>
							</ListItemIcon>
							<ListItemText primary="Sign up" />
						</MenuItem>
					</>
				) : (
					<>
						<MenuItem
							component={Link}
							to="/apps/profile"
							onClick={userMenuClose}
							role="button"
						>
							<ListItemIcon>
								<FuseSvgIcon size={18}>lucide:circle-user</FuseSvgIcon>
							</ListItemIcon>
							<ListItemText primary="My Profile" />
						</MenuItem>
						<MenuItem
							component={Link}
							to="/apps/mailbox"
							onClick={userMenuClose}
							role="button"
						>
							<ListItemIcon>
								<FuseSvgIcon size={18}>lucide:mail</FuseSvgIcon>
							</ListItemIcon>
							<ListItemText primary="Inbox" />
						</MenuItem>
						<MenuItem
							onClick={() => {
								signOut();
							}}
						>
							<ListItemIcon>
								<FuseSvgIcon size={18}>lucide:square-arrow-right</FuseSvgIcon>
							</ListItemIcon>
							<ListItemText primary="Sign out" />
						</MenuItem>
					</>
				)}
			</Popover>
		</>
	);
}

export default UserMenu;
