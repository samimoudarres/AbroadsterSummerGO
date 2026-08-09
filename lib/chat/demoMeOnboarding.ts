import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveSchoolVisual, getProgramByName } from '../schools/catalog';
import {
  loadDemoState,
  patchDemoMeProfile,
  refreshExplorerScoresNow,
  ensureDemoMeHostPassport,
  syncDemoMeCommunitiesToProfile,
} from './demoStore';

const ONBOARDING_KEY = 'abroadster.demo.meOnboarding.v1';

export type DemoMeOnboarding = {
  firstName: string;
  lastName: string;
  avatarUri: string | null;
  isVerifiedStudent: boolean;
  studentEmail: string | null;
  phoneNumber: string | null;
  dateOfBirth: string | null;
  bio?: string | null;
  homeUniversity?: string | null;
  studyAbroadProgram?: string | null;
  semester?: string | null;
  hostCity?: string | null;
  hostCountry?: string | null;
};

/** Persist + apply name/avatar/schools onto the demo "me" profile. */
export async function applyOnboardingToDemoMe(
  data: DemoMeOnboarding,
): Promise<void> {
  let merged = data;
  try {
    const prevRaw = await AsyncStorage.getItem(ONBOARDING_KEY);
    if (prevRaw) {
      const prev = JSON.parse(prevRaw) as DemoMeOnboarding;
      merged = { ...prev, ...data };
    }
  } catch {
    // ignore
  }

  // Backfill host city/country from selected abroad program when missing
  const progName = merged.studyAbroadProgram?.trim();
  if (progName) {
    const prog = getProgramByName(progName);
    if (prog) {
      if (!merged.hostCity?.trim() && prog.city) merged.hostCity = prog.city;
      if (!merged.hostCountry?.trim() && prog.country) {
        merged.hostCountry = prog.country;
      }
    }
  }

  await AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify(merged));
  await loadDemoState();

  const homeVisual = resolveSchoolVisual({
    name: merged.homeUniversity || '',
  });
  const abroadVisual = resolveSchoolVisual({
    name: merged.studyAbroadProgram || '',
  });

  patchDemoMeProfile({
    firstName: merged.firstName,
    lastName: merged.lastName,
    fullName: `${merged.firstName} ${merged.lastName}`.trim(),
    // Always pass avatar when set so it survives reloads
    avatar: merged.avatarUri || undefined,
    isVerifiedStudent: merged.isVerifiedStudent,
    studentEmail: merged.studentEmail,
    phoneNumber: merged.phoneNumber,
    dateOfBirth: merged.dateOfBirth,
    bio: merged.bio,
    homeUniversity: merged.homeUniversity || undefined,
    studyAbroadProgram: merged.studyAbroadProgram || undefined,
    semester: merged.semester,
    hostCity: merged.hostCity,
    hostCountry: merged.hostCountry,
    homeAccent: homeVisual.accent,
    abroadAccent: abroadVisual.accent,
  });

  syncDemoMeCommunitiesToProfile();
  ensureDemoMeHostPassport();
  refreshExplorerScoresNow();
}
