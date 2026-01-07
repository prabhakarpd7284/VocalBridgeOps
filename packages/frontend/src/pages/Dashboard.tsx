/**
 * Dashboard page
 */

import { useQuery } from '@tanstack/react-query';
import { Bot, MessageSquare, DollarSign, Zap, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import * as api from '../api/client';

export default function Dashboard() {
  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['usage'],
    queryFn: () => api.getUsageSummary(),
  });

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.listAgents(),
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.listSessions({ status: 'ACTIVE' }),
  });

  const { data: topAgents, isLoading: topAgentsLoading } = useQuery({
    queryKey: ['topAgents'],
    queryFn: () => api.getTopAgents(),
  });

  const stats = [
    {
      name: 'Total Agents',
      value: agents?.agents.length ?? 0,
      icon: Bot,
      color: 'bg-blue-500',
      link: '/agents',
    },
    {
      name: 'Active Sessions',
      value: sessions?.sessions.length ?? 0,
      icon: MessageSquare,
      color: 'bg-green-500',
      link: '/sessions?status=ACTIVE',
    },
    {
      name: 'Total Messages',
      value: usage?.totals.messages ?? 0,
      icon: Zap,
      color: 'bg-purple-500',
    },
    {
      name: 'Total Cost',
      value: usage?.totals.costFormatted ?? '$0.00',
      icon: DollarSign,
      color: 'bg-orange-500',
      link: '/usage',
    },
  ];

  const isLoading = usageLoading || agentsLoading || sessionsLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Overview of your AI agent gateway</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="card">
            <div className="flex items-center">
              <div className={`p-3 rounded-lg ${stat.color}`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">{stat.name}</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {isLoading ? '...' : stat.value}
                </p>
              </div>
            </div>
            {stat.link && (
              <Link
                to={stat.link}
                className="mt-4 text-sm text-blue-600 hover:text-blue-800 flex items-center"
              >
                View details →
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Agents */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Top Agents by Cost</h2>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          {topAgentsLoading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : topAgents?.topAgents.length ? (
            <div className="space-y-3">
              {topAgents.topAgents.slice(0, 5).map((agent, i) => (
                <div
                  key={agent.agentId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium">
                      {i + 1}
                    </div>
                    <div className="ml-3">
                      <p className="font-medium text-gray-900">{agent.agentName}</p>
                      <p className="text-xs text-gray-500">
                        {agent.sessions} sessions · {agent.totalTokens.toLocaleString()} tokens
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {agent.costFormatted}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No usage data yet</p>
          )}
        </div>

        {/* Recent Sessions */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Active Sessions</h2>
            <MessageSquare className="w-5 h-5 text-gray-400" />
          </div>
          {sessionsLoading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : sessions?.sessions.length ? (
            <div className="space-y-3">
              {sessions.sessions.slice(0, 5).map((session) => (
                <Link
                  key={session.id}
                  to={`/sessions/${session.id}`}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900">{session.agentName}</p>
                    <p className="text-xs text-gray-500">
                      Customer: {session.customerId} · {session.channel}
                    </p>
                  </div>
                  <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                    {session.status}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No active sessions</p>
          )}
          <Link
            to="/sessions?status=ACTIVE"
            className="mt-4 text-sm text-blue-600 hover:text-blue-800 flex items-center"
          >
            View all active sessions →
          </Link>
        </div>
      </div>

      {/* Usage Period */}
      {usage && (
        <div className="text-sm text-gray-500 text-center">
          Data from {new Date(usage.period.start).toLocaleDateString()} to{' '}
          {new Date(usage.period.end).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
