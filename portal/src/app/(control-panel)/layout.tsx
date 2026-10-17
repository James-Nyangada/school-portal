import MainLayout from 'src/components/MainLayout';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import authRoles from '@auth/authRoles';
import ViewAsBanner from 'src/components/ViewAsBanner';

function Layout({ children }) {
	return (
		<AuthGuardRedirect auth={authRoles.allAuthenticated}>
			<MainLayout>{children}</MainLayout>
			<ViewAsBanner />
		</AuthGuardRedirect>
	);
}

export default Layout;
