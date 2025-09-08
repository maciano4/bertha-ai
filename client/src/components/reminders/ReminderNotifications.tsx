import { useState, useEffect } from 'react';
import { useReminders } from '../../hooks/useReminders';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ReminderNotifications() {
  const { notifications, dismissNotification, dismissAllNotifications } = useReminders();
  const [isVisible, setIsVisible] = useState(false);

  // Show notifications when there are any
  useEffect(() => {
    if (notifications.length > 0) {
      setIsVisible(true);
    }
  }, [notifications]);

  // Auto-hide after 10 seconds if user doesn't interact
  useEffect(() => {
    if (notifications.length === 0) {
      setIsVisible(false);
      return;
    }

    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 10000);

    return () => clearTimeout(timer);
  }, [notifications]);

  if (!isVisible || notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notification) => (
        <Card 
          key={notification.id}
          className={cn(
            "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950",
            "shadow-lg animate-in slide-in-from-right-5"
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className="p-1.5 rounded-full bg-orange-100 dark:bg-orange-900">
                  <Bell className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {notification.timestamp.toLocaleTimeString()}
                  </Badge>
                </div>
                
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {notification.message}
                </p>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dismissNotification(notification.id)}
                className="flex-shrink-0 h-8 w-8 p-0 hover:bg-orange-100 dark:hover:bg-orange-900"
                data-testid={`button-dismiss-reminder-${notification.id}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      
      {notifications.length > 1 && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={dismissAllNotifications}
            className="bg-white dark:bg-gray-950 shadow-sm"
            data-testid="button-dismiss-all-reminders"
          >
            Dismiss All ({notifications.length})
          </Button>
        </div>
      )}
    </div>
  );
}