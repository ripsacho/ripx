const {
  RISK_LEVELS,
  buildToolPolicy,
  canAutoExecuteTool,
} = require('../supportAgentPolicyService');

describe('supportAgentPolicyService', () => {
  const originalEnv = process.env.SUPPORT_AGENT_ACTIONS_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SUPPORT_AGENT_ACTIONS_ENABLED;
    } else {
      process.env.SUPPORT_AGENT_ACTIONS_ENABLED = originalEnv;
    }
  });

  it('auto-executes read-only tools', () => {
    const tool = { risk: RISK_LEVELS.READ_ONLY };
    expect(canAutoExecuteTool(tool)).toBe(true);
    expect(buildToolPolicy(tool)).toMatchObject({
      auto_execute: true,
      requires_confirmation: false,
      blocked: false,
    });
  });

  it('blocks write tools until agent actions are enabled', () => {
    delete process.env.SUPPORT_AGENT_ACTIONS_ENABLED;
    expect(buildToolPolicy({ risk: RISK_LEVELS.TENANT_WRITE })).toMatchObject({
      auto_execute: false,
      requires_confirmation: true,
      blocked: true,
    });
  });

  it('keeps critical tools blocked even when actions are enabled', () => {
    process.env.SUPPORT_AGENT_ACTIONS_ENABLED = 'true';
    expect(buildToolPolicy({ risk: RISK_LEVELS.CRITICAL })).toMatchObject({
      requires_confirmation: true,
      blocked: true,
    });
  });
});
