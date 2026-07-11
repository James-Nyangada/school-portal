import { useSession, signOut } from 'next-auth/react';
import { useMemo } from 'react';
import { User } from '@auth/user';

type useUser = {
	data: User | null;
	isGuest: boolean;
	signOut: () => Promise<void>;
};

function useUser(): useUser {
	const { data: session } = useSession();

	const user = useMemo(() => {
		if (!session?.user) return null;

		const sessionUser = session.user as any;

		return {
			id: sessionUser.id || '',
			role: sessionUser.role ? [sessionUser.role] : [],
			status: sessionUser.status || '',
			displayName: sessionUser.name || sessionUser.email || 'User',
			email: sessionUser.email || '',
			photoURL: sessionUser.image || ''
		} as User;
	}, [session]);

	const isGuest = useMemo(() => !user?.role || user?.role?.length === 0, [user]);

	async function handleSignOut() {
		return signOut();
	}

	return {
		data: user,
		isGuest,
		signOut: handleSignOut
	};
}

export default useUser;
