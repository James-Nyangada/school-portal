'use client';

import { BACKEND_URL } from '@/lib/backend';
import { useTtApi } from '@/components/timetable/api';

export { errorMessage } from '@/components/timetable/api';

export type SocialLinks = Partial<
	Record<'facebook' | 'instagram' | 'x' | 'youtube' | 'tiktok' | 'linkedin', string | null>
>;
export type Highlight = { label: string; value: string };
export type Facility = { name: string; description: string };
export type Term = {
	name: string;
	startDate: string;
	endDate: string;
	halfTermStart?: string | null;
	halfTermEnd?: string | null;
};

export interface SchoolProfile {
	name: string;
	shortName: string | null;
	motto: string | null;
	tagline: string | null;
	logoUrl: string | null;
	heroImageUrl: string | null;
	foundedYear: number | null;
	registrationNumber: string | null;
	curriculum: string | null;
	schoolType: string | null;
	gender: string | null;
	levelsOffered: string | null;

	about: string | null;
	history: string | null;
	mission: string | null;
	vision: string | null;
	coreValues: string[];

	principalName: string | null;
	principalTitle: string | null;
	principalPhotoUrl: string | null;
	principalMessage: string | null;

	email: string | null;
	phone: string | null;
	altPhone: string | null;
	whatsapp: string | null;
	postalAddress: string | null;
	physicalAddress: string | null;
	county: string | null;
	mapUrl: string | null;
	officeHours: string | null;
	website: string | null;
	socialLinks: SocialLinks;

	highlights: Highlight[];
	facilities: Facility[];
	admissionsOpen: boolean;
	admissionsInfo: string | null;
	admissionRequirements: string[];

	academicYear: string | null;
	terms: Term[];
	updatedAt: string;
}

export type SchoolProfileResponse = { profile: SchoolProfile; currentTerm: string };

/** Fetch wrapper for /api/school (School Settings). */
export const useSchoolApi = () => useTtApi(`${BACKEND_URL}/api/school`);
