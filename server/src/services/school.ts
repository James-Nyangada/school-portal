import { SchoolProfile } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type Term = {
  name: string;
  startDate: string;
  endDate: string;
  halfTermStart?: string | null;
  halfTermEnd?: string | null;
};

export async function getSchoolProfile(): Promise<SchoolProfile> {
  return (
    (await prisma.schoolProfile.findUnique({ where: { id: 1 } })) ??
    prisma.schoolProfile.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })
  );
}

/** What the public website may show: the whole profile plus the current term and its dates. */
export function publicSchoolDto(profile: SchoolProfile, currentTerm: string) {
  const { id: _id, ...rest } = profile;
  const terms = (profile.terms as Term[] | null) ?? [];

  return {
    ...rest,
    terms,
    currentTerm: terms.find((t) => t.name === currentTerm) ?? { name: currentTerm, startDate: null, endDate: null }
  };
}
