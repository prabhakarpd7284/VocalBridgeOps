/**
 * Usage/Billing page
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign,
  Zap,
  MessageSquare,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import * as api from '../api/client';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

// Default to last 30 days
const getDefaultDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
};

export default function Usage() {
  const [groupBy, setGroupBy] = useState<'provider' | 'agent' | 'day'>('day');
  const [dateRange, setDateRange] = useState(getDefaultDateRange());
  const [tempDateRange, setTempDateRange] = useState(dateRange);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['usage', dateRange],
    queryFn: () => {
      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999); // Include entire end day

      return api.getUsageSummary({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
    },
  });

  const { data: breakdown, isLoading: breakdownLoading } = useQuery({
    queryKey: ['usageBreakdown', groupBy, dateRange],
    queryFn: () => {
      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999); // Include entire end day

      return api.getUsageBreakdown({
        groupBy,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
    },
  });

  const { data: topAgents, isLoading: topAgentsLoading } = useQuery({
    queryKey: ['topAgents', dateRange],
    queryFn: () => api.getTopAgents(),
  });

  const handleApplyDateRange = () => {
    setDateRange(tempDateRange);
  };

  const handleResetDateRange = () => {
    const defaultRange = getDefaultDateRange();
    setTempDateRange(defaultRange);
    setDateRange(defaultRange);
  };

  const stats = [
    {
      name: 'Total Cost',
      value: summary?.totals.costFormatted ?? '$0.00',
      icon: DollarSign,
      color: 'bg-green-500',
    },
    {
      name: 'Total Sessions',
      value: summary?.totals.sessions ?? 0,
      icon: MessageSquare,
      color: 'bg-blue-500',
    },
    {
      name: 'Total Messages',
      value: summary?.totals.messages ?? 0,
      icon: TrendingUp,
      color: 'bg-purple-500',
    },
    {
      name: 'Total Tokens',
      value: summary?.totals.totalTokens?.toLocaleString() ?? 0,
      icon: Zap,
      color: 'bg-orange-500',
    },
  ];

  const chartData =
    breakdown?.breakdown.map((b) => ({
      name: b.date || b.provider || b.agentName || 'Unknown',
      cost: b.costCents / 100,
      tokens: b.totalTokens,
      sessions: b.sessions,
    })) ?? [];

  const pieData =
    groupBy === 'provider'
      ? breakdown?.breakdown.map((b) => ({
          name: b.provider || 'Unknown',
          value: b.costCents,
        })) ?? []
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Usage & Billing</h1>
        <p className="text-gray-600">
          Monitor your AI gateway usage and costs
        </p>
      </div>

      {/* Date Range Selector */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={tempDateRange.startDate}
              onChange={(e) =>
                setTempDateRange({ ...tempDateRange, startDate: e.target.value })
              }
              className="input w-full"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={tempDateRange.endDate}
              onChange={(e) =>
                setTempDateRange({ ...tempDateRange, endDate: e.target.value })
              }
              className="input w-full"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleApplyDateRange}
              className="btn-primary flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              Apply
            </button>
            <button
              onClick={handleResetDateRange}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
        </div>
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
                  {summaryLoading ? '...' : stat.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Cost Breakdown</h2>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="input w-auto"
            >
              <option value="day">By Day</option>
              <option value="provider">By Provider</option>
              <option value="agent">By Agent</option>
            </select>
          </div>

          {breakdownLoading ? (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
                />
                <Bar dataKey="cost" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-gray-500">
              No usage data available
            </div>
          )}
        </div>

        {/* Pie Chart or Top Agents */}
        <div className="card">
          {groupBy === 'provider' && pieData.length > 0 ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Provider Distribution
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`$${(value / 100).toFixed(2)}`, 'Cost']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center space-x-4 mt-4">
                {pieData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-sm text-gray-600">{entry.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Top Agents
              </h2>
              {topAgentsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
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
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        >
                          {i + 1}
                        </div>
                        <div className="ml-3">
                          <p className="font-medium text-gray-900 text-sm">
                            {agent.agentName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {agent.sessions} sessions
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
                <p className="text-gray-500 text-center py-8">No usage data</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Token Breakdown */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Token Usage</h2>
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="text-sm text-gray-500">Input Tokens</p>
            <p className="text-3xl font-bold text-gray-900">
              {summary?.totals.tokensIn.toLocaleString() ?? 0}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Output Tokens</p>
            <p className="text-3xl font-bold text-gray-900">
              {summary?.totals.tokensOut.toLocaleString() ?? 0}
            </p>
          </div>
        </div>

        {summary && summary.totals.totalTokens > 0 && (
          <div className="mt-4">
            <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
              <div
                className="bg-blue-500 h-full"
                style={{
                  width: `${(summary.totals.tokensIn / summary.totals.totalTokens) * 100}%`,
                }}
              />
              <div
                className="bg-green-500 h-full"
                style={{
                  width: `${(summary.totals.tokensOut / summary.totals.totalTokens) * 100}%`,
                }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span className="flex items-center">
                <span className="w-3 h-3 bg-blue-500 rounded-full mr-1" />
                Input
              </span>
              <span className="flex items-center">
                <span className="w-3 h-3 bg-green-500 rounded-full mr-1" />
                Output
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Period Info */}
      {summary && (
        <div className="text-sm text-gray-500 text-center">
          Data from {new Date(summary.period.start).toLocaleDateString()} to{' '}
          {new Date(summary.period.end).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
