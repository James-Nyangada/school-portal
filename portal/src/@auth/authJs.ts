import NextAuth, { CredentialsSignin } from 'next-auth';
import { createStorage } from 'unstorage';
import memoryDriver from 'unstorage/drivers/memory';
import vercelKVDriver from 'unstorage/drivers/vercel-kv';
import { UnstorageAdapter } from '@auth/unstorage-adapter';
import type { NextAuthConfig } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Credentials from 'next-auth/providers/credentials';
import { BACKEND_URL } from '@/lib/backend';

const storage = createStorage({
	driver: process.env.VERCEL
		? vercelKVDriver({
				url: process.env.AUTH_KV_REST_API_URL,
				token: process.env.AUTH_KV_REST_API_TOKEN,
				env: false
			})
		: memoryDriver()
});

function isBackendTokenExpired(backendToken?: string) {
	if (!backendToken) return true;

	try {
		const payload = JSON.parse(Buffer.from(backendToken.split('.')[1], 'base64url').toString());
		return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
	} catch {
		return true;
	}
}

type SessionIdentity = {
	id: string;
	role: string;
	status: string;
	name: string | null;
	email: string | null;
	backendToken: string;
};

const identityOf = (token: Record<string, unknown>): SessionIdentity => ({
	id: token.id as string,
	role: token.role as string,
	status: token.status as string,
	name: (token.name as string | null) ?? null,
	email: (token.email as string | null) ?? null,
	backendToken: token.backendToken as string
});

/**
 * View-as (Super Admin, dashboard spec §1.2). The token comes from the client, so before switching the session
 * to it we check with the API that it is valid, was issued to this Super Admin, and belongs to the user it claims.
 */
async function verifyViewAsToken(viewAsToken: string, superAdminId: string): Promise<SessionIdentity | null> {
	try {
		const claims = JSON.parse(Buffer.from(viewAsToken.split('.')[1], 'base64url').toString());

		if (claims.impersonatorId !== superAdminId) return null;

		const res = await fetch(`${BACKEND_URL}/api/users/me`, { headers: { Authorization: `Bearer ${viewAsToken}` } });

		if (!res.ok) return null;

		const me = await res.json();

		if (me.id !== claims.userId) return null;

		return {
			id: me.id,
			role: me.role,
			status: me.status,
			name: [me.firstName, me.lastName].filter(Boolean).join(' ') || null,
			email: me.email || me.phone || null,
			backendToken: viewAsToken
		};
	} catch {
		return null;
	}
}

/** Carries the backend's reason (locked, suspended, …) to signIn() as `result.code`; codes are mapped to messages in SignInPageForm. */
class LoginError extends CredentialsSignin {
	constructor(code: 'invalid' | 'locked' | 'inactive' | 'unavailable') {
		super();
		this.code = code;
	}
}

export const providers: Provider[] = [
	Credentials({
		credentials: {
			identifier: { label: 'Identifier', type: 'text' },
			password: { label: 'Password', type: 'password' },
			role: { label: 'Role', type: 'text' }
		},
		authorize: async (credentials) => {
			let res: Response;
			let data: any;

			try {
				res = await fetch(`${BACKEND_URL}/api/auth/login`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						identifier: credentials?.identifier,
						password: credentials?.password,
						role: credentials?.role
					})
				});
				data = await res.json();
			} catch (error) {
				console.error('Login request failed', error);
				throw new LoginError('unavailable');
			}

			if (res.ok && data?.user) {
				return {
					id: data.user.id,
					role: data.user.role,
					status: data.user.status,
					backendToken: data.token,
					name: [data.user.firstName, data.user.lastName].filter(Boolean).join(' ') || null,
					email: data.user.email || data.user.phone || null
				} as any;
			}

			if (res.status === 403) throw new LoginError(/locked/i.test(data?.error ?? '') ? 'locked' : 'inactive');

			if (res.status === 401) throw new LoginError('invalid');

			throw new LoginError('unavailable');
		}
	})
];

const config = {
	theme: { logo: '/assets/images/logo/logo.svg' },
	adapter: UnstorageAdapter(storage),
	pages: {
		signIn: '/sign-in'
	},
	providers,
	basePath: '/auth',
	trustHost: true,
	callbacks: {
		authorized() {
			/** Checkout information to how to use middleware for authorization
			 * https://next-auth.js.org/configuration/nextjs#middleware
			 */
			return true;
		},
		async jwt({ token, user, trigger, session }) {
			if (user) {
				token.id = (user as any).id;
				token.role = (user as any).role;
				token.status = (user as any).status;
				token.backendToken = (user as any).backendToken;
				token.name = user.name;
				token.email = user.email;
			}

			if (trigger === 'update' && session?.status) {
				token.status = session.status;
			}

			const impersonator = token.impersonator as SessionIdentity | undefined;

			if (trigger === 'update' && session?.viewAs?.token && token.role === 'SUPER_ADMIN' && !impersonator) {
				const target = await verifyViewAsToken(session.viewAs.token, token.id as string);

				if (target) {
					token.impersonator = identityOf(token);
					Object.assign(token, target);
				}
			}

			// Exiting view-as, or the 30-minute view-as token ran out: back to the Super Admin's own session
			if (
				impersonator &&
				((trigger === 'update' && session?.endViewAs) || isBackendTokenExpired(token.backendToken as string))
			) {
				Object.assign(token, impersonator);
				delete token.impersonator;
			}

			// Backend tokens expire well before the 30-day session; end the session with them
			if (isBackendTokenExpired(token.backendToken as string | undefined)) {
				return null;
			}

			return token;
		},
		async session({ session, token }) {
			session.user = {
				...session.user,
				id: token.id as string,
				name: token.name,
				email: token.email,
				role: token.role as string,
				status: token.status as string
			} as any;
			(session as any).backendToken = token.backendToken as string;
			const impersonator = token.impersonator as SessionIdentity | undefined;
			session.viewAs = impersonator
				? { superAdminName: impersonator.name ?? impersonator.email ?? 'Super Admin' }
				: null;
			return session;
		}
	},
	experimental: {
		enableWebAuthn: true
	},
	session: {
		strategy: 'jwt',
		maxAge: 30 * 24 * 60 * 60 // 30 days
	},
	debug: process.env.NODE_ENV !== 'production'
} satisfies NextAuthConfig;

export type AuthJsProvider = {
	id: string;
	name: string;
	style?: {
		text?: string;
		bg?: string;
	};
};

export const authJsProviderMap: AuthJsProvider[] = providers
	.map((provider) => {
		const providerData = typeof provider === 'function' ? provider() : provider;

		return {
			id: providerData.id,
			name: providerData.name,
			style: {
				text: (providerData as { style?: { text: string } }).style?.text,
				bg: (providerData as { style?: { bg: string } }).style?.bg
			}
		};
	})
	.filter((provider) => provider.id !== 'credentials');

export const { handlers, auth, signIn, signOut } = NextAuth(config);
