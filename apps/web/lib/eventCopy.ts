import type { EventType } from "@aerotrack/shared";

// Card titles. Calm, plain, never a cause.
export const EVENT_TITLE: Record<EventType, string> = {
  climb: "Climbing",
  descent: "Descending",
  turn: "Turning",
  circling: "Possibly circling",
  rapid_descent: "Descending quickly",
  signal_lost: "No recent position",
  glitch: "Altitude reading ignored",
  gap: "Gap in the data",
  emergency: "Emergency code",
  takeoff: "Took off",
  landing: "Landed",
};

export const eventTitle = (type: EventType) => EVENT_TITLE[type];

export const CARD_LABELS = {
  seen: "What we see",
  commonly: "What this commonly means",
  cannotTell: "What we can't tell",
  howWeKnow: "How we know",
} as const;
