import { useState } from 'react';
import { ChevronDown, ChevronUp, Brain, Target, Heart, MessageCircle, Clock, Tag } from 'lucide-react';

interface NLPAnalysis {
  intent: string;
  entities: Array<{ type: string; value: string; confidence: number }>;
  sentiment: {
    sentiment: string;
    confidence: number;
    emotions: string[];
  };
  context: {
    currentTopic: string;
    conversationTone: string;
    urgency: string;
  };
  language: string;
  keywords: string[];
  summary: string;
  requiresAction: boolean;
}

interface NLPInsightsProps {
  analysis: NLPAnalysis;
  className?: string;
}

export function NLPInsights({ analysis, className = "" }: NLPInsightsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-600 bg-green-50 border-green-200';
      case 'negative': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getIntentIcon = (intent: string) => {
    switch (intent) {
      case 'question': return <Target className="w-3 h-3" />;
      case 'command': return <MessageCircle className="w-3 h-3" />;
      case 'conversation': return <MessageCircle className="w-3 h-3" />;
      case 'greeting': return <Heart className="w-3 h-3" />;
      default: return <Brain className="w-3 h-3" />;
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-green-600 bg-green-50';
    }
  };

  return (
    <div className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 ${className}`}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid="nlp-insights-header"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-white/90">AI Understanding</span>
          {analysis.requiresAction && (
            <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-full">
              Action Required
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-white/70" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/70" />
        )}
      </div>

      {/* Quick Summary */}
      <div className="px-3 pb-2 flex items-center gap-4 text-xs text-white/70">
        <div className="flex items-center gap-1">
          {getIntentIcon(analysis.intent)}
          <span className="capitalize">{analysis.intent.replace('_', ' ')}</span>
        </div>
        <div className={`px-2 py-0.5 rounded-full border ${getSentimentColor(analysis.sentiment.sentiment)}`}>
          {analysis.sentiment.sentiment} ({Math.round(analysis.sentiment.confidence * 100)}%)
        </div>
        <div className={`px-2 py-0.5 rounded-full ${getUrgencyColor(analysis.context.urgency)}`}>
          {analysis.context.urgency} priority
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-white/10 p-3 space-y-3" data-testid="nlp-insights-details">
          {/* Context & Topics */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <MessageCircle className="w-3 h-3 text-white/60" />
                <span className="text-xs font-medium text-white/80">Topic</span>
              </div>
              <p className="text-xs text-white/70">{analysis.context.currentTopic}</p>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Clock className="w-3 h-3 text-white/60" />
                <span className="text-xs font-medium text-white/80">Tone</span>
              </div>
              <p className="text-xs text-white/70 capitalize">{analysis.context.conversationTone}</p>
            </div>
          </div>

          {/* Keywords */}
          {analysis.keywords.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-2">
                <Tag className="w-3 h-3 text-white/60" />
                <span className="text-xs font-medium text-white/80">Key Concepts</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {analysis.keywords.slice(0, 6).map((keyword, index) => (
                  <span 
                    key={index}
                    className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-300 rounded-full"
                    data-testid={`keyword-${index}`}
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Entities */}
          {analysis.entities.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-2">
                <Target className="w-3 h-3 text-white/60" />
                <span className="text-xs font-medium text-white/80">Detected Entities</span>
              </div>
              <div className="space-y-1">
                {analysis.entities.slice(0, 4).map((entity, index) => (
                  <div key={index} className="flex items-center justify-between text-xs">
                    <span className="text-white/70">
                      <span className="capitalize text-white/50">{entity.type}:</span> {entity.value}
                    </span>
                    <span className="text-white/50">{Math.round(entity.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Emotions */}
          {analysis.sentiment.emotions.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-2">
                <Heart className="w-3 h-3 text-white/60" />
                <span className="text-xs font-medium text-white/80">Emotions Detected</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {analysis.sentiment.emotions.slice(0, 4).map((emotion, index) => (
                  <span 
                    key={index}
                    className="px-2 py-0.5 text-xs bg-pink-500/20 text-pink-300 rounded-full capitalize"
                    data-testid={`emotion-${index}`}
                  >
                    {emotion}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Language & Summary */}
          <div className="pt-2 border-t border-white/10 text-xs text-white/60">
            <div className="flex items-center justify-between">
              <span>Language: <span className="uppercase text-white/70">{analysis.language}</span></span>
              <span className="text-white/50">AI Analysis Complete</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}