import type { ContactKind } from './validation';

export type AuthScreen =
  | 'welcome'
  | 'login'
  | 'signup'
  | 'forgot-password'
  | 'reset-password';

export type SignupStep =
  | 'name'
  | 'contact'
  | 'password'
  | 'birthday'
  | 'homeSchool'
  | 'abroadProgram'
  | 'terms'
  | 'photo';

export interface SignupDraft {
  firstName: string;
  lastName: string;
  contactKind: ContactKind;
  contactValue: string;
  password: string;
  rememberLogin: boolean;
  birthday: Date;
  homeUniversity: string;
  studyAbroadProgram: string;
  hostCity: string;
  hostCountry: string;
  avatarUri: string | null;
  agreedToTerms: boolean;
}

export interface AuthSession {
  userId: string;
  /** Email or phone the user typed (display). */
  identifier: string;
  authEmail: string;
  firstName: string;
  lastName: string;
  isVerifiedStudent: boolean;
  /** 'supabase' | 'local' */
  source: 'supabase' | 'local';
}

export interface LocalAccount {
  id: string;
  authEmail: string;
  identifier: string;
  contactKind: ContactKind;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  isVerifiedStudent: boolean;
  studentEmail: string | null;
  phoneNumber: string | null;
  loginEmail: string | null;
  avatarUri: string | null;
  homeUniversity: string;
  studyAbroadProgram: string;
  hostCity: string;
  hostCountry: string;
  createdAt: string;
}
