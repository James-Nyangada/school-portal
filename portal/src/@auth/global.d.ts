import { User } from '@auth/user';

declare module 'next-auth' {
	interface Session {
		accessToken?: string;
		backendToken?: string;
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
