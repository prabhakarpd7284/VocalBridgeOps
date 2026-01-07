-- Ensure only one ACTIVE session per tenant + agent + customer
-- Ensure only one ACTIVE session per tenant + agent + customer
CREATE UNIQUE INDEX one_active_session_per_customer_agent
ON sessions ("tenantId", "agentId", "customerId")
WHERE status = 'ACTIVE';

