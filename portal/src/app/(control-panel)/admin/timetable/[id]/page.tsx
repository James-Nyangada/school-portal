import { redirect } from 'next/navigation';

export default async function TimetableIndex({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	redirect(`/admin/timetable/${id}/lessons`);
}
