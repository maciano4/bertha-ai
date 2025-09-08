import { db } from "./db";
import { reminders, dailyPlans, planActivities, type InsertReminder, type InsertDailyPlan, type InsertPlanActivity } from "@shared/schema";
import { eq, lte, and } from "drizzle-orm";
import OpenAI from "openai";

// Use the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ReminderParseResult {
  hasReminder: boolean;
  reminderMessage?: string;
  reminderTime?: Date;
  hasPlanningRequest?: boolean;
  planningType?: 'create_plan' | 'add_activity' | 'view_plan';
  planningDetails?: any;
}

export class ReminderService {
  // Parse reminder commands from natural language
  async parseReminderCommand(message: string): Promise<ReminderParseResult> {
    try {
      const prompt = `
      Analyze this message for reminder requests or planning requests. Return JSON with this structure:
      {
        "hasReminder": boolean,
        "reminderMessage": "what to remind about" (if hasReminder is true),
        "reminderTime": "ISO datetime string" (if hasReminder is true),
        "hasPlanningRequest": boolean,
        "planningType": "create_plan" | "add_activity" | "view_plan" (if hasPlanningRequest is true),
        "planningDetails": object with relevant details (if hasPlanningRequest is true)
      }

      Examples:
      - "remind me at 3pm to call mom" → hasReminder: true, reminderMessage: "call mom", reminderTime: today at 3pm (or tomorrow if 3pm has passed)
      - "remind me in 30 minutes to take medication" → hasReminder: true, reminderMessage: "take medication", reminderTime: 30 minutes from now
      - "plan my day" → hasPlanningRequest: true, planningType: "create_plan"
      - "add go to gym at 6pm to my plan" → hasPlanningRequest: true, planningType: "add_activity", planningDetails: {activity: "go to gym", time: "6pm"}
      - "add to my planner for today to call doctor" → hasPlanningRequest: true, planningType: "add_activity", planningDetails: {activity: "call doctor"}
      - "put in my planner meeting at 2pm" → hasPlanningRequest: true, planningType: "add_activity", planningDetails: {activity: "meeting", time: "2pm"}
      - "what's on my schedule today" → hasPlanningRequest: true, planningType: "view_plan"
      - "show me my daily activities" → hasPlanningRequest: true, planningType: "view_plan"
      - "what am I supposed to do today" → hasPlanningRequest: true, planningType: "view_plan"

      IMPORTANT: If someone asks for a time that has already passed today (like 2pm when it's currently 6pm), 
      set the reminder for that time TOMORROW, not today.

      Current time: ${new Date().toISOString()}
      Current local time: ${new Date().toLocaleString()}
      Message: "${message}"
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are an expert at parsing reminder and planning requests from natural language. Respond only with valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      return result as ReminderParseResult;
    } catch (error) {
      console.error("Error parsing reminder command:", error);
      return { hasReminder: false };
    }
  }

  // Create a new reminder
  async createReminder(message: string, remindAt: Date): Promise<string> {
    try {
      const now = new Date();
      const isToday = remindAt.toDateString() === now.toDateString();
      const isTomorrow = remindAt.getTime() > now.getTime() && 
                        Math.abs(remindAt.getTime() - now.getTime()) <= 24 * 60 * 60 * 1000;

      const [reminder] = await db
        .insert(reminders)
        .values({
          message,
          remindAt,
          completed: false,
        })
        .returning();

      if (remindAt.getTime() <= now.getTime()) {
        return `That time has already passed today. I'll remind you to ${message} tomorrow at ${remindAt.toLocaleTimeString()}.`;
      } else if (isTomorrow && !isToday) {
        return `Since it's past that time today, I'll remind you to ${message} tomorrow at ${remindAt.toLocaleTimeString()}.`;
      } else {
        return `I'll remind you to ${message} at ${remindAt.toLocaleTimeString()}.`;
      }
    } catch (error) {
      console.error("Error creating reminder:", error);
      return "Sorry, I couldn't set that reminder right now.";
    }
  }

  // Get due reminders (including activity reminders)
  async getDueReminders(): Promise<Array<{ id: string; message: string; remindAt: Date; type?: string }>> {
    try {
      const now = new Date();
      
      // Get regular reminders
      const dueReminders = await db
        .select()
        .from(reminders)
        .where(
          and(
            lte(reminders.remindAt, now),
            eq(reminders.completed, false)
          )
        );

      // Get activity reminders
      const dueActivityReminders = await db
        .select({
          id: planActivities.id,
          message: planActivities.activity,
          remindAt: planActivities.remindAt,
          time: planActivities.time
        })
        .from(planActivities)
        .where(
          and(
            lte(planActivities.remindAt, now),
            eq(planActivities.completed, false)
          )
        );

      // Combine and format
      const allReminders = [
        ...dueReminders.map(r => ({ ...r, type: 'reminder' })),
        ...dueActivityReminders
          .filter(a => a.remindAt) // Only include activities with remind_at set
          .map(a => ({ 
            id: a.id, 
            message: `${a.message}${a.time ? ` (scheduled for ${a.time})` : ''}`,
            remindAt: a.remindAt!,
            type: 'activity'
          }))
      ];

      return allReminders;
    } catch (error) {
      console.error("Error getting due reminders:", error);
      return [];
    }
  }

  // Mark reminder as completed
  async completeReminder(id: string, type?: string): Promise<void> {
    try {
      if (type === 'activity') {
        // For activity reminders, we don't mark the activity as completed,
        // just remove the remindAt so it doesn't trigger again
        await db
          .update(planActivities)
          .set({ remindAt: null })
          .where(eq(planActivities.id, id));
      } else {
        // Regular reminders
        await db
          .update(reminders)
          .set({ completed: true })
          .where(eq(reminders.id, id));
      }
    } catch (error) {
      console.error("Error completing reminder:", error);
    }
  }

  // Create a daily plan
  async createDailyPlan(date: string, title: string, description?: string): Promise<string> {
    try {
      const [plan] = await db
        .insert(dailyPlans)
        .values({
          date,
          title,
          description,
        })
        .returning();

      return `I've created your plan for ${date}: ${title}`;
    } catch (error) {
      console.error("Error creating daily plan:", error);
      return "Sorry, I couldn't create that plan right now.";
    }
  }

  // Add activity to plan
  async addActivityToPlan(planId: string, activity: string, time?: string, remindAt?: Date): Promise<string> {
    try {
      // Calculate reminder time if activity has a scheduled time
      let autoRemindAt = remindAt;
      if (time && !autoRemindAt) {
        autoRemindAt = this.calculateReminderTime(time);
      }

      await db
        .insert(planActivities)
        .values({
          planId,
          activity,
          time,
          remindAt: autoRemindAt,
          completed: false,
        });

      let response = `I've added "${activity}" to your plan${time ? ` at ${time}` : ''}.`;
      
      if (autoRemindAt) {
        response += ` I'll remind you 5 minutes before at ${autoRemindAt.toLocaleTimeString()}.`;
      }

      return response;
    } catch (error) {
      console.error("Error adding activity to plan:", error);
      return "Sorry, I couldn't add that activity right now.";
    }
  }

  // Calculate reminder time (5 minutes before activity)
  private calculateReminderTime(timeString: string): Date | undefined {
    try {
      const today = new Date();
      const timeMatch = timeString.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm|AM|PM)?/);
      
      if (!timeMatch) return undefined;

      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || '0');
      const period = timeMatch[3]?.toLowerCase();

      // Convert to 24-hour format
      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;

      const activityTime = new Date(today);
      activityTime.setHours(hours, minutes, 0, 0);

      // If the time has passed today, schedule for tomorrow
      if (activityTime.getTime() <= Date.now()) {
        activityTime.setDate(activityTime.getDate() + 1);
      }

      // Calculate 5 minutes before
      const reminderTime = new Date(activityTime.getTime() - 5 * 60 * 1000);
      
      return reminderTime;
    } catch (error) {
      console.error("Error calculating reminder time:", error);
      return undefined;
    }
  }

  // Get today's plan
  async getTodaysPlan(): Promise<{ plan: any; activities: any[] } | null> {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      const [plan] = await db
        .select()
        .from(dailyPlans)
        .where(eq(dailyPlans.date, today));

      if (!plan) return null;

      const activities = await db
        .select()
        .from(planActivities)
        .where(eq(planActivities.planId, plan.id));

      return { plan, activities };
    } catch (error) {
      console.error("Error getting today's plan:", error);
      return null;
    }
  }

  // Process reminder and planning requests
  async processReminderRequest(message: string): Promise<string> {
    const parseResult = await this.parseReminderCommand(message);

    if (parseResult.hasReminder && parseResult.reminderMessage && parseResult.reminderTime) {
      return await this.createReminder(
        parseResult.reminderMessage,
        new Date(parseResult.reminderTime)
      );
    }

    if (parseResult.hasPlanningRequest) {
      const today = new Date().toISOString().split('T')[0];
      
      switch (parseResult.planningType) {
        case 'create_plan':
          return await this.createDailyPlan(today, "Daily Plan", "Your plan for today");
        
        case 'view_plan':
          const todaysPlan = await this.getTodaysPlan();
          if (!todaysPlan) {
            return "You don't have any plans for today yet. Would you like me to help you create one?";
          }
          
          let planText = `Here's your plan for today:\n${todaysPlan.plan.title}`;
          if (todaysPlan.activities.length > 0) {
            planText += "\n\nActivities:";
            todaysPlan.activities.forEach((activity: any) => {
              planText += `\n- ${activity.activity}${activity.time ? ` at ${activity.time}` : ''}${activity.completed ? ' ✓' : ''}`;
            });
          }
          return planText;
        
        case 'add_activity':
          const plan = await this.getTodaysPlan();
          if (!plan) {
            // Create a plan first
            await this.createDailyPlan(today, "Daily Plan", "Your plan for today");
            const newPlan = await this.getTodaysPlan();
            if (newPlan && parseResult.planningDetails?.activity) {
              return await this.addActivityToPlan(
                newPlan.plan.id,
                parseResult.planningDetails.activity,
                parseResult.planningDetails.time
              );
            }
          } else if (parseResult.planningDetails?.activity) {
            return await this.addActivityToPlan(
              plan.plan.id,
              parseResult.planningDetails.activity,
              parseResult.planningDetails.time
            );
          }
          break;
      }
    }

    return "I didn't detect a reminder or planning request in that message.";
  }

  // Check for due reminders (called periodically)
  async checkAndNotifyDueReminders(): Promise<string[]> {
    const dueReminders = await this.getDueReminders();
    const notifications: string[] = [];

    for (const reminder of dueReminders) {
      const prefix = reminder.type === 'activity' ? 'Activity reminder: ' : 'Reminder: ';
      notifications.push(`${prefix}${reminder.message}`);
      await this.completeReminder(reminder.id, reminder.type);
    }

    return notifications;
  }
}

export const reminderService = new ReminderService();