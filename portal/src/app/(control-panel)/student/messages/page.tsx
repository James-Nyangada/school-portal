'use client';

import MessagesPage from '@/components/newsletter/MessagesPage';

export default function StudentMessages() {
	return <MessagesPage auth={['STUDENT']} />;
}
