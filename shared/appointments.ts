import { z } from "zod";

export const appointmentInput = z.object({
  title: z.string().trim().min(1).max(200),
  startsAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  timeZone: z.string().max(80).refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
    catch { return false; }
  }, "Choose a valid time zone."),
  location: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  reminderMinutes: z.number().int().min(0).max(10080).default(30),
});

export type AppointmentInput = z.infer<typeof appointmentInput>;
export interface Appointment extends AppointmentInput {
  id: string;
  status: "scheduled" | "cancelled";
  createdAt: string;
  updatedAt: string;
}
