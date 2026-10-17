'use client';

import MessagesPage from '@/components/newsletter/MessagesPage';

export default function ParentMessages() {
	return <MessagesPage auth={['PARENT']} />;
}
