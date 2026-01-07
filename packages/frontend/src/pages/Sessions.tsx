/**
 * Sessions page
 */

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { MessageSquare, Plus, Search, Filter, X } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api/client';
import { useAuth } from '../hooks/useAuth';

export default function Sessions() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Initialize filters from URL params
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ENDED' | 'ERROR'>(
    (searchParams.get('status') as any) || 'ALL'
  );
  const [agentFilter, setAgentFilter] = useState<string>(
    searchParams.get('agent') || 'ALL'
  );
  const [searchQuery, setSearchQuery] = useState(
    searchParams.get('search') || ''
  );

  // Sync state with URL params when URL changes (e.g., navigation from sidebar)
  useEffect(() => {
    setStatusFilter((searchParams.get('status') as any) || 'ALL');
    setAgentFilter(searchParams.get('agent') || 'ALL');
    setSearchQuery(searchParams.get('search') || '');
  }, [searchParams]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (agentFilter !== 'ALL') params.set('agent', agentFilter);
    if (searchQuery) params.set('search', searchQuery);
    setSearchParams(params, { replace: true });
  }, [statusFilter, agentFilter, searchQuery, setSearchParams]);

  // Clear all filters
  const handleClearFilters = () => {
    setStatusFilter('ALL');
    setAgentFilter('ALL');
    setSearchQuery('');
  };

  // Check if any filters are active
  const hasActiveFilters = statusFilter !== 'ALL' || agentFilter !== 'ALL' || searchQuery !== '';

  const { data, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.listSessions(),
  });

  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.listAgents(),
  });

  // Filter and search sessions
  const filteredSessions = useMemo(() => {
    if (!data?.sessions) return [];

    return data.sessions.filter((session) => {
      // Status filter
      if (statusFilter !== 'ALL' && session.status !== statusFilter) {
        return false;
      }

      // Agent filter
      if (agentFilter !== 'ALL' && session.agentId !== agentFilter) {
        return false;
      }

      // Search query (searches in agent name, customer ID, and session ID)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesAgentName = session.agentName?.toLowerCase().includes(query);
        const matchesCustomerId = session.customerId.toLowerCase().includes(query);
        const matchesSessionId = session.id.toLowerCase().includes(query);

        if (!matchesAgentName && !matchesCustomerId && !matchesSessionId) {
          return false;
        }
      }

      return true;
    });
  }, [data?.sessions, statusFilter, agentFilter, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
          <p className="text-gray-600">View and manage conversation sessions</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Session
          </button>
        )}
      </div>

      {/* Filters and Search */}
      <div className="card">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[250px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by agent, customer ID, or session ID..."
                className="input pl-10 w-full"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="min-w-[150px]">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="input w-full"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="ENDED">Ended</option>
              <option value="ERROR">Error</option>
            </select>
          </div>

          {/* Agent Filter */}
          <div className="min-w-[200px]">
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="input w-full"
            >
              <option value="ALL">All Agents</option>
              {agentsData?.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md flex items-center gap-2"
              title="Clear all filters"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>

        {/* Results count */}
        {data?.sessions && (
          <div className="mt-3 text-sm text-gray-500 flex items-center justify-between">
            <span>
              Showing {filteredSessions.length} of {data.sessions.length} sessions
            </span>
            {hasActiveFilters && (
              <span className="text-blue-600 text-xs">
                Filters active
              </span>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredSessions.length ? (
        <div className="space-y-4">
          {filteredSessions.map((session) => (
            <Link
              key={session.id}
              to={`/sessions/${session.id}`}
              className="card flex items-center justify-between hover:shadow-md transition-shadow"
            >
              <div className="flex items-center">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                </div>
                <div className="ml-4">
                  <h3 className="font-medium text-gray-900">{session.agentName}</h3>
                  <p className="text-sm text-gray-500">
                    Customer: {session.customerId} · {session.channel}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-500">
                  {new Date(session.createdAt).toLocaleString()}
                </span>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    session.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-700'
                      : session.status === 'ENDED'
                      ? 'bg-gray-100 text-gray-600'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {session.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : data?.sessions.length ? (
        <div className="card text-center py-12">
          <Filter className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No matching sessions</h3>
          <p className="text-gray-500 mb-4">Try adjusting your filters or search query</p>
        </div>
      ) : (
        <div className="card text-center py-12">
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No sessions yet</h3>
          <p className="text-gray-500 mb-4">Start a new conversation session</p>
          {isAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Session
            </button>
          )}
        </div>
      )}

      {showCreateModal && (
        <CreateSessionModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => navigate(`/sessions/${id}`)}
        />
      )}
    </div>
  );
}

function CreateSessionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.listAgents(),
  });

  const [formData, setFormData] = useState({
    agentId: '',
    customerId: '',
    channel: 'CHAT' as const,
  });

  const mutation = useMutation({
    mutationFn: api.createSession,
    onSuccess: (session) => {
      onCreated(session.id);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">New Session</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Agent</label>
            <select
              value={formData.agentId}
              onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
              className="input"
              required
            >
              <option value="">Select an agent...</option>
              {agents?.agents
                .filter((a) => a.isActive)
                .map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="label">Customer ID</label>
            <input
              type="text"
              value={formData.customerId}
              onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
              placeholder="customer_123"
              className="input"
              required
            />
          </div>

          <div>
            <label className="label">Channel</label>
            <select
              value={formData.channel}
              onChange={(e) =>
                setFormData({ ...formData, channel: e.target.value as any })
              }
              className="input"
            >
              <option value="CHAT">Chat</option>
              <option value="VOICE">Voice</option>
            </select>
          </div>

          {mutation.error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg">
              {(mutation.error as any).message || 'Failed to create session'}
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary"
            >
              {mutation.isPending ? 'Creating...' : 'Start Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
