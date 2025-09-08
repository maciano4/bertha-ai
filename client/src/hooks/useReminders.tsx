import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export interface Reminder {
  id: string;
  message: string;
  remindAt: string;
  completed: boolean;
  createdAt: string;
}

export interface ReminderNotification {
  id: string;
  message: string;
  timestamp: Date;
}

export function useReminders() {
  const [notifications, setNotifications] = useState<ReminderNotification[]>([]);
  const queryClient = useQueryClient();

  // Query for due reminders
  const { data: dueReminders = [], isLoading } = useQuery({
    queryKey: ['reminders', 'due'],
    queryFn: async (): Promise<Reminder[]> => {
      const response = await fetch('/api/reminders/due');
      if (!response.ok) throw new Error('Failed to fetch due reminders');
      return response.json();
    },
    refetchInterval: 30000, // Check every 30 seconds
  });

  // Check for new notifications
  const checkReminders = useCallback(async () => {
    try {
      const response = await fetch('/api/reminders/check');
      if (!response.ok) return;
      
      const data = await response.json();
      
      if (data.notifications && data.notifications.length > 0) {
        const newNotifications = data.notifications.map((msg: string) => ({
          id: `reminder-${Date.now()}-${Math.random()}`,
          message: msg,
          timestamp: new Date(),
        }));
        
        setNotifications(prev => [...prev, ...newNotifications]);
        
        // Refresh the due reminders query
        queryClient.invalidateQueries({ queryKey: ['reminders', 'due'] });
      }
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  }, [queryClient]);

  // Poll for reminders every minute
  useEffect(() => {
    const interval = setInterval(checkReminders, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [checkReminders]);

  // Dismiss a notification
  const dismissNotification = useCallback((notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  }, []);

  // Dismiss all notifications
  const dismissAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    dueReminders,
    isLoading,
    notifications,
    dismissNotification,
    dismissAllNotifications,
    checkReminders,
  };
}