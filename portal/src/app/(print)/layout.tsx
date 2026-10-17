import MainLayout from 'src/components/MainLayout';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import authRoles from '@auth/authRoles';

/** Bare layout for printable pages: no navbar, toolbar or footer, so only the document prints. */
function Layout({ children }) {
	return (
		<AuthGuardRedirect auth={authRoles.allAuthenticated}>
			<MainLayout
				navbar={false}
				toolbar={false}
				leftSidePanel={false}
				rightSidePanel={false}
				footer={false}
			>
				{children}
			</MainLayout>
		</AuthGuardRedirect>
	);
}

export default Layout;
