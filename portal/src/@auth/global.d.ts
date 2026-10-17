import { User } from '@auth/user';

declare module 'next-auth' {
	interface Session {
		accessToken?: string;
		backendToken?: string;
		/** Set while a Super Admin is viewing the portal as this user */
		viewAs?: { superAdminName: string } | null;
		db?: User;
		user: {
			name?: string | null;
			email?: string | null;
			image?: string | null;
			role?: string;
			status?: string;
		};
	}
	interface JWT {
		accessToken?: string;
		backendToken?: string;
		role?: string;
		status?: string;
	}
}
