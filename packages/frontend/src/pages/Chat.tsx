/**
 * Chat/Session detail page
 */

import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Send,
  User,
  Bot,
  Loader2,
  StopCircle,
  Wrench,
} from 'lucide-react';
import * as api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import VoiceRecorder from '../components/VoiceRecorder';

export default function Chat() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [showVoice, setShowVoice] = useState(false);

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: (query) =>
      query.state.data?.status === 'ACTIVE' ? 5000 : false,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api.sendMessage(sessionId!, content, `msg_${Date.now()}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  const endMutation = useMutation({
    mutationFn: () => api.endSession(sessionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMutation.isPending) return;

    sendMutation.mutate(input.trim());
    setInput('');
  };

  const handleVoiceTranscript = () => {
    // The voice recorder handles the message sending internally
    // We just need to refresh the session data
    queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
  };

  const handleVoiceResponse = (audioUrl: string) => {
    // Audio URL received, could be used for additional UI feedback
    console.log('Voice response received:', audioUrl);
  };

  useEffect(() => {
    // Check if agent has voice enabled
    if (session?.channel === 'VOICE') {
      setShowVoice(true);
    }
  }, [session?.channel]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Session not found</h2>
        <button onClick={() => navigate('/sessions')} className="btn-primary mt-4">
          Back to Sessions
        </button>
      </div>
    );
  }

  const isActive = session.status === 'ACTIVE';

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div className="flex items-center">
          <button
            onClick={() => navigate('/sessions')}
            className="p-2 mr-2 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {session.agentName}
            </h1>
            <p className="text-sm text-gray-500">
              Customer: {session.customerId} · {session.channel}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {session.demoMode && (
            <span className="px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-700">
              Demo Mode (No Billing)
            </span>
          )}
          <span
            className={`px-3 py-1 text-sm font-medium rounded-full ${
              isActive
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {session.status}
          </span>
          {isAdmin && isActive && (
            <button
              onClick={() => endMutation.mutate()}
              disabled={endMutation.isPending}
              className="btn-secondary text-red-600 hover:bg-red-50"
            >
              <StopCircle className="w-4 h-4 mr-2" />
              End Session
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {session.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {sendMutation.isPending && (
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
              <Bot className="w-5 h-5 text-gray-400" />
            </div>
            <div className="bg-gray-100 rounded-lg p-3">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {isActive && isAdmin ? (
        <div className="pt-4 border-t border-gray-200 space-y-3">
          {/* Voice/Text toggle */}
          <div className="flex items-center justify-center space-x-2">
            <button
              type="button"
              onClick={() => setShowVoice(false)}
              className={`px-3 py-1 text-sm rounded ${
                !showVoice
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Text
            </button>
            <button
              type="button"
              onClick={() => setShowVoice(true)}
              className={`px-3 py-1 text-sm rounded ${
                showVoice
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Voice
            </button>
          </div>

          {showVoice ? (
            /* Voice input */
            <div className="flex items-center justify-center">
              <VoiceRecorder
                sessionId={sessionId!}
                onTranscriptReceived={handleVoiceTranscript}
                onResponseReceived={handleVoiceResponse}
                disabled={sendMutation.isPending}
              />
            </div>
          ) : (
            /* Text input */
            <form onSubmit={handleSubmit}>
              <div className="flex items-center space-x-4">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message..."
                  className="input flex-1"
                  disabled={sendMutation.isPending}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || sendMutation.isPending}
                  className="btn-primary"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              {sendMutation.error && (
                <p className="mt-2 text-sm text-red-600">
                  {(sendMutation.error as any).message || 'Failed to send message'}
                </p>
              )}
            </form>
          )}
        </div>
      ) : !isActive ? (
        <div className="pt-4 border-t border-gray-200 text-center text-gray-500">
          This session has ended.
        </div>
      ) : (
        <div className="pt-4 border-t border-gray-200 text-center text-gray-500">
          Only admins can send messages.
        </div>
      )}

      {/* Session Summary */}
      <div className="pt-4 flex items-center justify-center space-x-6 text-sm text-gray-500">
        <span>{session.summary.messageCount} messages</span>
        <span>·</span>
        <span>{session.summary.totalTokens.toLocaleString()} tokens</span>
        <span>·</span>
        <span>${(session.summary.totalCostCents / 100).toFixed(2)} cost</span>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: api.Message }) {
  const isUser = message.role === 'USER';
  const isTool = message.role === 'TOOL';

  return (
    <div className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser
            ? 'bg-blue-100'
            : isTool
            ? 'bg-purple-100'
            : 'bg-gray-100'
        }`}
      >
        {isUser ? (
          <User className="w-5 h-5 text-blue-600" />
        ) : isTool ? (
          <Wrench className="w-5 h-5 text-purple-600" />
        ) : (
          <Bot className="w-5 h-5 text-gray-600" />
        )}
      </div>
      <div className={`max-w-[70%] ${isUser ? 'text-right' : ''}`}>
        <div
          className={`rounded-lg p-3 ${
            isUser
              ? 'bg-blue-600 text-white'
              : isTool
              ? 'bg-purple-50 text-purple-900 border border-purple-200'
              : 'bg-gray-100 text-gray-900'
          }`}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>

          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200/50">
              <p className="text-xs opacity-75 mb-1">Tool calls:</p>
              {message.toolCalls.map((tc, i) => (
                <div key={i} className="text-xs bg-white/10 rounded p-2 mt-1">
                  <span className="font-medium">{tc.name}</span>
                  {tc.result !== undefined && tc.result !== null && (
                    <pre className="mt-1 overflow-x-auto">
                      {String(JSON.stringify(tc.result, null, 2))}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {new Date(message.createdAt).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
