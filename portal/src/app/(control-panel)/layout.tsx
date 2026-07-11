import MainLayout from 'src/components/MainLayout';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import authRoles from '@auth/authRoles';

function Layout({ children }) {
	return (
		<AuthGuardRedirect auth={authRoles.allAuthenticated}>
			<MainLayout>{children}</MainLayout>
		</AuthGuardRedirect>
	);
}

export default Layout;
