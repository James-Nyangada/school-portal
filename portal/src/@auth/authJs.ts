import NextAuth from 'next-auth';
import { createStorage } from 'unstorage';
import memoryDriver from 'unstorage/drivers/memory';
import vercelKVDriver from 'unstorage/drivers/vercel-kv';
import { UnstorageAdapter } from '@auth/unstorage-adapter';
import type { NextAuthConfig } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Credentials from 'next-auth/providers/credentials';

const storage = createStorage({
	driver: process.env.VERCEL
		? vercelKVDriver({
				url: process.env.AUTH_KV_REST_API_URL,
				token: process.env.AUTH_KV_REST_API_TOKEN,
				env: false
			})
		: memoryDriver()
});

export const providers: Provider[] = [
	Credentials({
		credentials: {
			identifier: { label: 'Identifier', type: 'text' },
			password: { label: 'Password', type: 'password' },
			role: { label: 'Role', type: 'text' }
		},
		authorize: async (credentials) => {
			try {
				const res = await fetch('http://localhost:4000/api/auth/login', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						identifier: credentials?.identifier,
						password: credentials?.password,
						role: credentials?.role
					})
				});
				const data = await res.json();

				if (res.ok && data?.user) {
					return {
						id: data.user.id,
						role: data.user.role,
						status: data.user.status,
						backendToken: data.token
						// name/email can be set if needed
					} as any;
				}
			} catch (error) {
				console.error('Login request failed', error);
			}
			return null;
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
		jwt({ token, user, trigger, session }) {
			if (user) {
				token.id = (user as any).id;
				token.role = (user as any).role;
				token.status = (user as any).status;
				token.backendToken = (user as any).backendToken;
			}

			if (trigger === 'update' && session?.status) {
				token.status = session.status;
			}

			return token;
		},
		async session({ session, token }) {
			session.user = {
				...session.user,
				id: token.id as string,
				role: token.role as string,
				status: token.status as string
			} as any;
			(session as any).backendToken = token.backendToken as string;
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
