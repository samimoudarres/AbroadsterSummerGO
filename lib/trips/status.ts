import { colors } from '../../constants/theme';
import type { ChatTrip } from '../../data/chatTypes';
import { parseISODate } from './dates';

export type TripDisplayStatus = 'planning' | 'upcoming' | 'past';

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Effective lifecycle for UI: past wins when dates are over. */
export function getTripDisplayStatus(
  trip: Pick<ChatTrip, 'status' | 'dateStart' | 'dateEnd'>,
): TripDisplayStatus {
  const end = parseISODate(trip.dateEnd) ?? parseISODate(trip.dateStart);
  if (end) {
    const today = startOfLocalDay(new Date());
    const endDay = startOfLocalDay(end);
    if (endDay.getTime() < today.getTime()) return 'past';
  }
  return trip.status === 'upcoming' ? 'upcoming' : 'planning';
}

export function tripStatusLabel(status: TripDisplayStatus): string {
  switch (status) {
    case 'past':
      return 'Past Trip';
    case 'upcoming':
      return 'Upcoming Trip';
    default:
      return 'Planning Trip';
  }
}

export function tripStatusColor(status: TripDisplayStatus): string {
  switch (status) {
    case 'past':
      return colors.filterGray;
    case 'upcoming':
      return colors.statusOrange;
    default:
      return colors.statusYellow;
  }
}

export function tripPlannerLine(
  plannerName: string,
  status: TripDisplayStatus,
): string {
  const name = plannerName?.trim() || 'Someone';
  switch (status) {
    case 'past':
      return `${name} went on this trip`;
    case 'upcoming':
      return `${name} has an upcoming trip`;
    default:
      return `${name} is planning a trip`;
  }
}

/** Whether a non-member can request / unrequest to join. */
export function canRequestTripJoin(
  trip: ChatTrip | null | undefined,
  opts: { isMember?: boolean; isInvited?: boolean } = {},
): boolean {
  if (!trip) return false;
  if (opts.isMember || opts.isInvited) return false;
  if (!trip.openToJoin) return false;
  if (trip.myJoinStatus === 'accepted') return false;
  const display = getTripDisplayStatus(trip);
  return display === 'planning' || display === 'upcoming';
}
