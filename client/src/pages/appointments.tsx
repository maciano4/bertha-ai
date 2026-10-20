import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Bell, CalendarDays, CalendarPlus, Clock3,
  MapPin, Pencil, RotateCw, X, Check, CalendarRange,
} from "lucide-react";
import { format, isSameDay, startOfDay, addMinutes } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Appointment = {
  id: string | number;
  title: string;
  startsAt: string;
  endAt: string;
  timeZone: string;
  location: string | null;
  notes: string | null;
  reminderMinutes: number;
  status: "scheduled" | "cancelled";
  createdAt: string;
  updatedAt: string;
};
type AppointmentPayload = {
  title: string;
  startsAt: string;
  endAt: string;
  timeZone: string;
  location?: string | null;
  notes?: string | null;
  reminderMinutes: number;
};
type AppointmentDraft = {
  title: string;
  startsAt: string;
  endAt: string;
  location: string;
  notes: string;
  reminderMinutes: string;
};

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const queryKey = ["appointments"];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the status message when the server does not return JSON.
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function localDateTime(date: Date) {
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateAtSelectedDay(day: Date, hours = 10) {
  const date = new Date(day);
  date.setHours(hours, 0, 0, 0);
  return date;
}

function makeDraft(day: Date, appointment?: Appointment | null): AppointmentDraft {
  if (appointment) {
    return {
      title: appointment.title,
      startsAt: localDateTime(new Date(appointment.startsAt)),
      endAt: localDateTime(new Date(appointment.endAt)),
      location: appointment.location ?? "",
      notes: appointment.notes ?? "",
      reminderMinutes: String(appointment.reminderMinutes ?? 30),
    };
  }
  const start = dateAtSelectedDay(day, 10);
  const end = addMinutes(start, 60);
  return {
    title: "",
    startsAt: localDateTime(start),
    endAt: localDateTime(end),
    location: "",
    notes: "",
    reminderMinutes: "30",
  };
}

function toPayload(draft: AppointmentDraft): AppointmentPayload {
  return {
    title: draft.title.trim(),
    startsAt: new Date(draft.startsAt).toISOString(),
    endAt: new Date(draft.endAt).toISOString(),
    timeZone,
    location: draft.location.trim() || null,
    notes: draft.notes.trim() || null,
    reminderMinutes: Number(draft.reminderMinutes),
  };
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function Appointments() {
  const queryClient = useQueryClient();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDay, setSelectedDay] = useState<Date>(today);
  const [month, setMonth] = useState<Date>(today);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);

  const appointmentsQuery = useQuery({
    queryKey,
    queryFn: () => requestJson<Appointment[]>("/api/appointments"),
  });
  const appointments = appointmentsQuery.data ?? [];
  const scheduled = appointments.filter((item) => item.status === "scheduled");
  const selectedAppointments = appointments
    .filter((item) => item.status === "scheduled" || showCancelled)
    .filter((item) => isSameDay(new Date(item.startsAt), selectedDay))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const upcoming = scheduled
    .filter((item) => new Date(item.startsAt).getTime() >= Date.now())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 5);
  const markedDays = scheduled.map((item) => new Date(item.startsAt));

  const refreshAppointments = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["appointments"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] }),
    ]);
  };
  const saveMutation = useMutation({
    mutationFn: ({ id, payload }: { id?: string | number; payload: AppointmentPayload }) =>
      requestJson<Appointment>(id ? `/api/appointments/${encodeURIComponent(String(id))}` : "/api/appointments", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: refreshAppointments,
  });
  const cancelMutation = useMutation({
    mutationFn: (appointment: Appointment) =>
      requestJson<Appointment>(`/api/appointments/${encodeURIComponent(String(appointment.id))}`, { method: "DELETE" }),
    onSuccess: refreshAppointments,
  });

  const openCreate = (day = selectedDay) => {
    setSelectedDay(day);
    setEditing(null);
    saveMutation.reset();
    setFormOpen(true);
  };
  const openEdit = (appointment: Appointment) => {
    setEditing(appointment);
    saveMutation.reset();
    setFormOpen(true);
  };
  const submitDraft = async (draft: AppointmentDraft) => {
    await saveMutation.mutateAsync({ id: editing?.id, payload: toPayload(draft) });
    setFormOpen(false);
    setEditing(null);
  };
  const confirmCancel = async () => {
    if (!cancelTarget) return;
    await cancelMutation.mutateAsync(cancelTarget);
    setCancelTarget(null);
  };

  return (
    <main className="min-h-[100dvh] bg-[#111416] text-[#edf0eb]">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 opacity-[0.16]"
        style={{ backgroundImage: "radial-gradient(ellipse at 80% 0%, rgba(157,185,153,.22), transparent 34%), radial-gradient(ellipse at 0% 95%, rgba(120,143,130,.1), transparent 35%)" }} />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-[1440px] flex-col px-4 pb-7 sm:px-7 lg:px-10">
        <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-2 border-b border-white/[0.09] py-3">
          <Link href="/" className="inline-flex items-center gap-2 rounded-sm text-sm text-[#aab2ad] transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9c4a4]">
            <ArrowLeft className="h-4 w-4" /> Back to chat
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-1 sm:gap-3">
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-[#aab2ad] transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9c4a4]"><CalendarRange className="h-4 w-4" /><span>Conversations</span></Link>
            <span aria-current="page" className="inline-flex items-center gap-2 rounded-md bg-white/[0.06] px-2 py-2 text-xs font-medium text-[#dce7d7]"><CalendarDays className="h-4 w-4" /><span>Appointments</span></span>
          </nav>
        </header>

        <section className="flex flex-col justify-between gap-5 pb-7 pt-9 sm:flex-row sm:items-end sm:pb-9 sm:pt-12">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9aaa94]">Personal schedule</p>
            <h1 className="font-display text-[clamp(2.4rem,5vw,4.15rem)] leading-[0.98] tracking-[-0.055em] text-[#f0f2ec]">Make room<br className="hidden sm:block" /> for what matters.</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#9ba39e]">Plan your day, keep the important details close, and stay on top of what’s next.</p>
          </div>
          <Button onClick={() => openCreate()} className="h-11 w-full rounded-md bg-[#d1e0ca] px-5 text-[#1b241d] hover:bg-[#e1eadb] sm:w-auto"><CalendarPlus className="mr-2 h-4 w-4" />Add appointment</Button>
        </section>

        <section aria-label="Appointment overview" className="mb-7 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-white/[0.09] bg-white/[0.09] sm:grid-cols-3">
          <Overview icon={<CalendarDays className="h-4 w-4" />} label="Scheduled" value={appointmentsQuery.isLoading ? "—" : String(scheduled.length)} />
          <Overview icon={<Clock3 className="h-4 w-4" />} label="Today" value={appointmentsQuery.isLoading ? "—" : String(scheduled.filter((item) => isSameDay(new Date(item.startsAt), today)).length)} />
          <Overview icon={<MapPin className="h-4 w-4" />} label="Your time zone" value={timeZone} />
        </section>

        {appointmentsQuery.isLoading ? <LoadingState /> :
          appointmentsQuery.isError ? <ErrorState onRetry={() => appointmentsQuery.refetch()} /> :
          <section className="grid min-w-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(330px,.88fr)]">
            <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(300px,.88fr)_minmax(0,1.12fr)]">
              <section aria-label="Appointment calendar" className="min-w-0 rounded-xl border border-white/[0.1] bg-[#171b1d]/90 p-3 sm:p-5">
                <div className="mb-3 flex items-center justify-between px-1">
                  <div><h2 className="text-sm font-semibold text-[#e9ece6]">Calendar</h2><p className="mt-1 text-xs text-[#849088]">Choose a date to see its schedule</p></div>
                  <span className="rounded-md bg-[#27302a] px-2 py-1 font-mono text-[10px] text-[#a9c4a4]">{scheduled.length} active</span>
                </div>
                <Calendar
                  mode="single"
                  selected={selectedDay}
                  onSelect={(day) => {
                    if (day) {
                      setSelectedDay(day);
                      setMonth(day);
                    }
                  }}
                  month={month}
                  onMonthChange={setMonth}
                  modifiers={{ hasAppointment: markedDays }}
                  modifiersClassNames={{ hasAppointment: "after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-[#a9c4a4] after:content-['']" }}
                  aria-label="Choose appointment date"
                  className="mx-auto w-full p-0 text-[#e5e9e3]"
                  classNames={{
                    months: "w-full",
                    month: "w-full min-w-0 space-y-4",
                    table: "w-full table-fixed border-collapse",
                    head_row: "grid grid-cols-7",
                    row: "mt-2 grid w-full grid-cols-7",
                    cell: "relative h-11 min-w-0 p-0 text-center text-sm",
                    caption_label: "text-sm font-medium text-[#e4e9e1]",
                    head_cell: "min-w-0 rounded-md text-[.72rem] font-normal text-[#7f8a82]",
                    day: "relative h-11 w-full !min-w-0 rounded-md p-0 font-normal text-[#c4cbc4] hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#a9c4a4]",
                    day_selected: "bg-[#d1e0ca] text-[#1b241d] hover:bg-[#d1e0ca] hover:text-[#1b241d] focus:bg-[#d1e0ca] focus:text-[#1b241d]",
                    day_today: "border border-[#8fa78b] text-[#dce7d7]",
                    day_outside: "text-[#59635c] opacity-60",
                    nav_button: "h-8 w-8 border-white/[0.12] text-[#aeb8b0] hover:bg-white/[0.08] hover:text-white",
                  }}
                />
                <p className="mt-2 flex items-center justify-center gap-2 text-[10px] text-[#77827a]"><span className="h-1.5 w-1.5 rounded-full bg-[#a9c4a4]" />Scheduled appointment</p>
              </section>

              <section aria-labelledby="selected-day-heading" className="rounded-xl border border-white/[0.1] bg-[#171b1d]/90">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#89958d]">Selected day</p>
                    <h2 id="selected-day-heading" className="mt-1 truncate text-lg font-semibold text-[#edf0eb]">{format(selectedDay, "EEEE, MMMM d")}</h2>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <label className="hidden cursor-pointer items-center gap-1.5 text-[10px] text-[#98a29b] sm:flex">
                      <input type="checkbox" checked={showCancelled} onChange={(event) => setShowCancelled(event.target.checked)} className="h-3.5 w-3.5 accent-[#a9c4a4]" />
                      Cancelled
                    </label>
                    <Button variant="outline" size="sm" onClick={() => openCreate(selectedDay)} className="border-white/[0.14] bg-transparent text-[#d8e0d5] hover:bg-white/[0.07] hover:text-white"><CalendarPlus className="mr-2 h-3.5 w-3.5" /><span className="hidden sm:inline">Add</span></Button>
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-2 border-b border-white/[0.08] px-5 py-2 text-[11px] text-[#98a29b] sm:hidden">
                  <input type="checkbox" checked={showCancelled} onChange={(event) => setShowCancelled(event.target.checked)} className="h-3.5 w-3.5 accent-[#a9c4a4]" />
                  Include cancelled appointments
                </label>
                {showCancelled && <div className="border-b border-white/[0.08] px-5 py-2 text-xs text-[#a8b2aa]">Cancelled appointments are included.</div>}
                {selectedAppointments.length ? <ul className="divide-y divide-white/[0.06]">
                  {selectedAppointments.map((appointment) => <li key={appointment.id}><AppointmentRow appointment={appointment} onEdit={openEdit} onCancel={setCancelTarget} /></li>)}
                </ul> : <EmptyDay day={selectedDay} onCreate={() => openCreate(selectedDay)} />}
              </section>
            </div>

            <section aria-labelledby="upcoming-heading" className="rounded-xl border border-white/[0.1] bg-[#171b1d]/90">
              <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-4 sm:px-5">
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#89958d]">Ahead of you</p><h2 id="upcoming-heading" className="mt-1 text-lg font-semibold text-[#edf0eb]">Upcoming</h2></div>
                <span className="font-mono text-[10px] text-[#7f8a82]">{upcoming.length} scheduled</span>
              </div>
              {upcoming.length ? <ul className="divide-y divide-white/[0.06]">
                {upcoming.map((appointment) => <li key={appointment.id}>
                  <AppointmentRow appointment={appointment} onEdit={openEdit} onCancel={setCancelTarget} compact />
                </li>)}
              </ul> : <div className="px-5 py-12 text-center">
                <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.1] bg-[#202628] text-[#a9c4a4]"><Check className="h-5 w-5" /></div>
                <p className="text-sm font-medium text-[#d9dfd7]">Nothing coming up</p>
                <p className="mt-2 text-xs leading-5 text-[#89938c]">Your future appointments will appear here.</p>
                <Button variant="outline" size="sm" onClick={() => openCreate(today)} className="mt-4 border-white/[0.14] bg-transparent text-[#d8e0d5] hover:bg-white/[0.07]"><CalendarPlus className="mr-2 h-3.5 w-3.5" />Plan something</Button>
              </div>}
              <div className="border-t border-white/[0.08] px-5 py-3 text-[10px] leading-5 text-[#748078]">Appointments persist. In-chat reminders are available while the app is open.</div>
            </section>
          </section>}

        <footer className="py-5 text-center text-[11px] leading-5 text-[#748078]">Showing your appointment details in {timeZone}. Times are entered and displayed in your browser’s time zone.</footer>
      </div>

      <AppointmentDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        appointment={editing}
        day={selectedDay}
        busy={saveMutation.isPending}
        error={saveMutation.error instanceof Error ? saveMutation.error.message : null}
        onSubmit={submitDraft}
      />
      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent className="border-white/[0.12] bg-[#1a1f20] text-[#edf0eb]">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#a0aaa2]">“{cancelTarget?.title}” will be marked cancelled. It will remain in your appointment history.</AlertDialogDescription>
          </AlertDialogHeader>
          {cancelMutation.isError && <p role="alert" className="text-sm text-rose-300">{cancelMutation.error instanceof Error ? cancelMutation.error.message : "Could not cancel appointment."}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending} className="border-white/[0.14] bg-transparent text-[#d8e0d5] hover:bg-white/[0.07]">Keep appointment</AlertDialogCancel>
            <AlertDialogAction disabled={cancelMutation.isPending} onClick={(event) => { event.preventDefault(); void confirmCancel().catch(() => undefined); }} className="bg-[#c97870] text-[#271a18] hover:bg-[#d58b82]">
              {cancelMutation.isPending ? "Cancelling…" : "Cancel appointment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Overview({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 bg-[#171b1d] px-4 py-4 sm:px-5">
    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#27302a] text-[#a9c4a4]">{icon}</span>
    <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f8a82]">{label}</p><p className="mt-1 truncate text-sm font-medium text-[#e2e7e0]">{value}</p></div>
  </div>;
}

function AppointmentRow({ appointment, onEdit, onCancel, compact = false }: {
  appointment: Appointment;
  onEdit: (appointment: Appointment) => void;
  onCancel: (appointment: Appointment) => void;
  compact?: boolean;
}) {
  const isCancelled = appointment.status === "cancelled";
  return <article className={`group px-4 py-4 sm:px-5 ${isCancelled ? "opacity-60" : ""}`}>
    <div className="flex gap-3">
      <div className="flex w-[54px] shrink-0 flex-col items-center border-r border-white/[0.08] pr-3 pt-0.5">
        <span className="font-mono text-xs font-semibold text-[#dce7d7]">{formatClock(appointment.startsAt)}</span>
        <span className="mt-1 text-[10px] text-[#77827a]">{format(new Date(appointment.startsAt), "a")}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-[#e7eae4]">{appointment.title}</h3>
          {isCancelled && <span className="rounded bg-[#3b2929] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#d6a29d]">Cancelled</span>}
        </div>
        <p className="mt-1 text-xs text-[#8c9790]">
          {compact ? `${format(new Date(appointment.startsAt), "EEE, MMM d")} · ` : ""}
          {formatClock(appointment.startsAt)}–{formatClock(appointment.endAt)}
        </p>
        {appointment.location && <p className="mt-2 flex items-center gap-1.5 truncate text-xs text-[#a4ada6]"><MapPin className="h-3 w-3 shrink-0 text-[#8fa78b]" />{appointment.location}</p>}
        {!compact && appointment.notes && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-[#89938c]">{appointment.notes}</p>}
        {!compact && <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[#758078]"><Bell className="h-3 w-3" />Reminder {appointment.reminderMinutes} minutes before</p>}
      </div>
      {!isCancelled && <div className="flex shrink-0 items-start gap-1">
        <button type="button" onClick={() => onEdit(appointment)} aria-label={`Edit ${appointment.title}`} className="rounded-md p-2 text-[#89938c] transition hover:bg-white/[0.07] hover:text-[#e7eae4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9c4a4]"><Pencil className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => onCancel(appointment)} aria-label={`Cancel ${appointment.title}`} className="rounded-md p-2 text-[#89938c] transition hover:bg-rose-400/10 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"><X className="h-3.5 w-3.5" /></button>
      </div>}
    </div>
  </article>;
}

function AppointmentDialog({ open, onOpenChange, appointment, day, busy, error, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment | null;
  day: Date;
  busy: boolean;
  error: string | null;
  onSubmit: (draft: AppointmentDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AppointmentDraft>(() => makeDraft(day));
  const [formError, setFormError] = useState("");
  useEffect(() => {
    if (open) {
      setDraft(makeDraft(day, appointment));
      setFormError("");
    }
  }, [open, day, appointment]);
  const change = (key: keyof AppointmentDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    if (!draft.title.trim()) {
      setFormError("Add a title for this appointment.");
      return;
    }
    const start = new Date(draft.startsAt);
    const end = new Date(draft.endAt);
    if (!draft.startsAt || !draft.endAt || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setFormError("Choose a valid start and end time.");
      return;
    }
    if (end <= start) {
      setFormError("The end time must be after the start time.");
      return;
    }
    try {
      await onSubmit(draft);
    } catch {
      // Error details are rendered from the mutation state.
    }
  };

  return <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto border-white/[0.12] bg-[#1a1f20] text-[#edf0eb] sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl tracking-[-0.03em]">{appointment ? "Edit appointment" : "New appointment"}</DialogTitle>
        <DialogDescription className="text-[#98a39b]">Set the details and timing. Times use {timeZone}.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="appointment-title" className="mb-1.5 block text-xs font-medium text-[#c3cbc4]">Title <span className="text-rose-300">*</span></label>
          <Input id="appointment-title" autoFocus required maxLength={160} value={draft.title} onChange={(event) => change("title", event.target.value)} placeholder="What’s happening?"
            className="border-white/[0.12] bg-[#111416] text-[#edf0eb] placeholder:text-[#707b74] focus-visible:ring-[#a9c4a4]" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label htmlFor="appointment-start" className="mb-1.5 block text-xs font-medium text-[#c3cbc4]">Starts</label>
            <Input id="appointment-start" type="datetime-local" required value={draft.startsAt} onChange={(event) => change("startsAt", event.target.value)} className="border-white/[0.12] bg-[#111416] text-[#edf0eb] [color-scheme:dark] focus-visible:ring-[#a9c4a4]" /></div>
          <div><label htmlFor="appointment-end" className="mb-1.5 block text-xs font-medium text-[#c3cbc4]">Ends</label>
            <Input id="appointment-end" type="datetime-local" required value={draft.endAt} onChange={(event) => change("endAt", event.target.value)} className="border-white/[0.12] bg-[#111416] text-[#edf0eb] [color-scheme:dark] focus-visible:ring-[#a9c4a4]" /></div>
        </div>
        <div>
          <label htmlFor="appointment-location" className="mb-1.5 block text-xs font-medium text-[#c3cbc4]">Location <span className="font-normal text-[#758078]">Optional</span></label>
          <Input id="appointment-location" maxLength={240} value={draft.location} onChange={(event) => change("location", event.target.value)} placeholder="Address or place"
            className="border-white/[0.12] bg-[#111416] text-[#edf0eb] placeholder:text-[#707b74] focus-visible:ring-[#a9c4a4]" />
        </div>
        <div>
          <label htmlFor="appointment-notes" className="mb-1.5 block text-xs font-medium text-[#c3cbc4]">Notes <span className="font-normal text-[#758078]">Optional</span></label>
          <Textarea id="appointment-notes" maxLength={2000} rows={3} value={draft.notes} onChange={(event) => change("notes", event.target.value)} placeholder="Anything you want to remember"
            className="resize-y border-white/[0.12] bg-[#111416] text-sm text-[#edf0eb] placeholder:text-[#707b74] focus-visible:ring-[#a9c4a4]" />
        </div>
        <div>
          <label htmlFor="appointment-reminder" className="mb-1.5 block text-xs font-medium text-[#c3cbc4]">In-chat reminder</label>
          <select id="appointment-reminder" value={draft.reminderMinutes} onChange={(event) => change("reminderMinutes", event.target.value)}
            className="h-10 w-full rounded-md border border-white/[0.12] bg-[#111416] px-3 text-sm text-[#edf0eb] focus:outline-none focus:ring-2 focus:ring-[#a9c4a4]">
            <option value="5">5 minutes before</option><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option>
          </select>
          <p className="mt-1.5 text-[10px] leading-4 text-[#77827a]">Reminders appear in chat while the app is open.</p>
        </div>
        {(formError || error) && <p role="alert" className="rounded-md border border-rose-300/20 bg-rose-400/[0.07] px-3 py-2 text-sm text-rose-200">{formError || error}</p>}
        <DialogFooter className="gap-2 pt-1">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)} className="border-white/[0.14] bg-transparent text-[#d8e0d5] hover:bg-white/[0.07]">Close</Button>
          <Button type="submit" disabled={busy} className="bg-[#d1e0ca] text-[#1b241d] hover:bg-[#e1eadb]">{busy ? "Saving…" : appointment ? "Save changes" : "Create appointment"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function LoadingState() {
  return <div aria-label="Loading appointments" className="grid gap-5 lg:grid-cols-2">
    {[0, 1].map((item) => <div key={item} className="min-h-[430px] animate-pulse rounded-xl border border-white/[0.08] bg-[#171b1d] p-5">
      <div className="mb-8 h-4 w-36 rounded bg-white/[0.08]" />
      <div className="grid grid-cols-7 gap-3">{Array.from({ length: 35 }, (_, index) => <div key={index} className="aspect-square rounded bg-white/[0.05]" />)}</div>
      <div className="mt-8 h-16 rounded bg-white/[0.05]" />
    </div>)}
  </div>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="rounded-xl border border-white/[0.1] bg-[#171b1d] px-5 py-16 text-center">
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#2b2422] text-[#d6a29d]"><CalendarDays className="h-5 w-5" /></div>
    <h2 className="text-base font-semibold text-[#e7eae4]">Appointments aren’t available right now</h2>
    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#89938c]">We couldn’t load your schedule. Your appointments haven’t been changed.</p>
    <Button variant="outline" onClick={onRetry} className="mt-5 border-white/[0.14] bg-transparent text-[#d8e0d5] hover:bg-white/[0.07]"><RotateCw className="mr-2 h-4 w-4" />Try again</Button>
  </div>;
}

function EmptyDay({ day, onCreate }: { day: Date; onCreate: () => void }) {
  return <div className="px-5 py-12 text-center">
    <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.1] bg-[#202628] text-[#a9c4a4]"><CalendarDays className="h-5 w-5" /></div>
    <p className="text-sm font-medium text-[#d9dfd7]">A little breathing room</p>
    <p className="mt-2 text-xs leading-5 text-[#89938c]">No scheduled appointments for {format(day, "MMMM d")}.</p>
    <Button variant="outline" size="sm" onClick={onCreate} className="mt-4 border-white/[0.14] bg-transparent text-[#d8e0d5] hover:bg-white/[0.07]"><CalendarPlus className="mr-2 h-3.5 w-3.5" />Add to this day</Button>
  </div>;
}
