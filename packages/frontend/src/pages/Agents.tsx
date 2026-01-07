/**
 * Agents page
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bot, Plus, Settings, Trash2, MessageSquare } from 'lucide-react';
import * as api from '../api/client';
import { useAuth } from '../hooks/useAuth';

export default function Agents() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: api.listAgents,
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setDeleteError(null);
    },
    onError: (error: any) => {
      setDeleteError(error.message || 'Failed to delete agent');
    },
  });

  const demoSessionMutation = useMutation({
    mutationFn: api.createDemoSession,
    onSuccess: (session) => {
      navigate(`/sessions/${session.id}`);
    },
  });

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      setDeleteError(null);
      deleteMutation.mutate(id);
    }
  };

  const handleTryChat = (agentId: string) => {
    demoSessionMutation.mutate(agentId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
          <p className="text-gray-600">Manage your AI agents</p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Agent
          </button>
        )}
      </div>

      {deleteError && (
        <div className="p-4 text-sm text-red-600 bg-red-50 rounded-lg flex items-center justify-between">
          <span>{deleteError}</span>
          <button
            onClick={() => setDeleteError(null)}
            className="text-red-600 hover:text-red-800 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-2/3 mb-4" />
              <div className="h-4 bg-gray-100 rounded w-full mb-2" />
              <div className="h-4 bg-gray-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : data?.agents?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.agents.map((agent: any) => (
            <div key={agent.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Bot className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="ml-3">
                    <h3 className="font-medium text-gray-900">{agent.name}</h3>
                    <p className="text-sm text-gray-500">
                      {agent.primaryProvider}
                      {agent.fallbackProvider && ` → ${agent.fallbackProvider}`}
                    </p>
                  </div>
                </div>

                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    agent.isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {agent.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {agent.description && (
                <p className="mt-3 text-sm text-gray-600 line-clamp-2">
                  {agent.description}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {agent.enabledTools.map((tool: string) => (
                  <span
                    key={tool}
                    className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full"
                  >
                    {tool}
                  </span>
                ))}
                {agent.voiceEnabled && (
                  <span className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded-full">
                    Voice
                  </span>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  <span>Temp: {agent.temperature}</span>
                  <span className="mx-2">·</span>
                  <span>Max: {agent.maxTokens} tokens</span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleTryChat(agent.id)}
                    disabled={demoSessionMutation.isPending}
                    className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Try this agent in a demo chat (no billing)"
                  >
                    <MessageSquare className="w-3 h-3 mr-1" />
                    Try Chat
                  </button>

                  {isAdmin && (
                    <>
                      <button
                        onClick={() => setEditingAgent(agent)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <Settings className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDelete(agent.id, agent.name)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <Bot className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No agents yet
          </h3>
          <p className="text-gray-500 mb-4">
            Create your first AI agent to get started
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Agent
            </button>
          )}
        </div>
      )}

      {(showCreateModal || editingAgent) && (
        <CreateAgentModal
          agent={editingAgent}
          onClose={() => {
            setShowCreateModal(false);
            setEditingAgent(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create Agent Modal (USED FOR CREATE + EDIT, UNCHANGED UI)           */
/* ------------------------------------------------------------------ */

function CreateAgentModal({
  onClose,
  agent,
}: {
  onClose: () => void;
  agent?: any;
}) {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: agent?.name || '',
    description: agent?.description || '',
    primaryProvider: (agent?.primaryProvider || 'VENDOR_A') as
      | 'VENDOR_A'
      | 'VENDOR_B',
    fallbackProvider: (agent?.fallbackProvider || '') as
      | ''
      | 'VENDOR_A'
      | 'VENDOR_B',
    systemPrompt:
      agent?.systemPrompt || 'You are a helpful AI assistant.',
    temperature: agent?.temperature ?? 0.7,
    maxTokens: agent?.maxTokens ?? 1024,
    enabledTools: agent?.enabledTools || [],
    voiceEnabled: agent?.voiceEnabled || false,
  });

  const mutation = useMutation({
    mutationFn: (data: typeof formData) =>
      agent
        ? api.updateAgent(agent.id, {
            ...data,
            fallbackProvider:
              data.fallbackProvider === '' ? null : data.fallbackProvider,
          })
        : api.createAgent({
            ...data,
            fallbackProvider:
              data.fallbackProvider === '' ? null : data.fallbackProvider,
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {agent ? 'Edit Agent' : 'Create Agent'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="input"
              required
            />
          </div>

          <div>
            <label className="label">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  description: e.target.value,
                })
              }
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Primary Provider</label>
              <select
                value={formData.primaryProvider}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    primaryProvider: e.target.value as any,
                  })
                }
                className="input"
              >
                <option value="VENDOR_A">Vendor A</option>
                <option value="VENDOR_B">Vendor B</option>
              </select>
            </div>

            <div>
              <label className="label">Fallback Provider</label>
              <select
                value={formData.fallbackProvider}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    fallbackProvider: e.target.value as any,
                  })
                }
                className="input"
              >
                <option value="">None</option>
                <option value="VENDOR_A">Vendor A</option>
                <option value="VENDOR_B">Vendor B</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">System Prompt</label>
            <textarea
              value={formData.systemPrompt}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  systemPrompt: e.target.value,
                })
              }
              className="input h-24"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">
                Temperature ({formData.temperature})
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={formData.temperature}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    temperature: parseFloat(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>

            <div>
              <label className="label">Max Tokens</label>
              <input
                type="number"
                value={formData.maxTokens}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxTokens: parseInt(e.target.value),
                  })
                }
                className="input"
                min="1"
                max="4096"
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.enabledTools.includes('InvoiceLookup')}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    enabledTools: e.target.checked
                      ? ['InvoiceLookup']
                      : [],
                  })
                }
                className="mr-2"
              />
              Enable InvoiceLookup Tool
            </label>

            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.voiceEnabled}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    voiceEnabled: e.target.checked,
                  })
                }
                className="mr-2"
              />
              Voice Enabled
            </label>
          </div>

          {mutation.error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg">
              {(mutation.error as any).message ||
                'Failed to save agent'}
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary"
            >
              {mutation.isPending
                ? agent
                  ? 'Saving...'
                  : 'Creating...'
                : agent
                ? 'Save Changes'
                : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
