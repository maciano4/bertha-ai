import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, CheckCircle, Circle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DailyPlan {
  id: string;
  date: string;
  title: string;
  description?: string;
  createdAt: string;
}

interface PlanActivity {
  id: string;
  planId: string;
  activity: string;
  time?: string;
  completed: boolean;
  remindAt?: string;
  createdAt: string;
}

interface TodaysPlanData {
  plan: DailyPlan;
  activities: PlanActivity[];
}

export function DailyPlanner() {
  const [isExpanded, setIsExpanded] = useState(false);
  const queryClient = useQueryClient();

  // Query for today's plan
  const { data: todaysPlan, isLoading } = useQuery({
    queryKey: ['plans', 'today'],
    queryFn: async (): Promise<TodaysPlanData | null> => {
      const response = await fetch('/api/plans/today');
      if (!response.ok) throw new Error('Failed to fetch today\'s plan');
      return response.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  if (isLoading) {
    return (
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!todaysPlan) {
    return (
      <Card className="mb-4 border-dashed border-2 border-gray-300 dark:border-gray-700">
        <CardContent className="p-4 text-center">
          <Calendar className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            No plan for today yet
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mb-3">
            Say "Bertha, plan my day" to get started
          </p>
        </CardContent>
      </Card>
    );
  }

  const completedActivities = todaysPlan.activities.filter(a => a.completed).length;
  const totalActivities = todaysPlan.activities.length;
  const completionPercentage = totalActivities > 0 ? (completedActivities / totalActivities) * 100 : 0;

  return (
    <Card className="mb-4">
      <CardHeader 
        className="pb-3 cursor-pointer" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            <div>
              <CardTitle className="text-lg">{todaysPlan.plan.title}</CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400">{today}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {totalActivities > 0 && (
              <Badge variant="secondary" className="text-xs">
                {completedActivities}/{totalActivities} done
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              data-testid="button-toggle-plan"
            >
              <Plus className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-45")} />
            </Button>
          </div>
        </div>
        
        {totalActivities > 0 && (
          <div className="mt-2">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {todaysPlan.plan.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {todaysPlan.plan.description}
            </p>
          )}

          {todaysPlan.activities.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Activities
              </h4>
              {todaysPlan.activities.map((activity) => (
                <div 
                  key={activity.id}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg border",
                    activity.completed 
                      ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" 
                      : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  )}
                >
                  {activity.completed ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <Circle className="h-4 w-4 text-gray-400" />
                  )}
                  
                  <div className="flex-1">
                    <p className={cn(
                      "text-sm",
                      activity.completed 
                        ? "text-green-800 dark:text-green-200 line-through" 
                        : "text-gray-900 dark:text-gray-100"
                    )}>
                      {activity.activity}
                    </p>
                    
                    {activity.time && (
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3 text-gray-500" />
                        <span className="text-xs text-gray-500">{activity.time}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 mb-2">No activities planned yet</p>
              <p className="text-xs text-gray-400">
                Say "Bertha, add [activity] to my plan" to add activities
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}