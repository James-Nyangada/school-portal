'use client';

import MessagesPage from '@/components/newsletter/MessagesPage';

export default function TeacherMessages() {
	return <MessagesPage auth={['TEACHER']} />;
}
