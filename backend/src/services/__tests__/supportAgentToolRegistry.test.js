const { getAvailableTools, selectReadOnlyToolsForMessage } = require('../supportAgentToolRegistry');

describe('supportAgentToolRegistry', () => {
  it('exposes only read-only auto executable tools in the first slice', () => {
    const tools = getAvailableTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every(tool => tool.risk === 'read_only')).toBe(true);
    expect(tools.every(tool => tool.auto_execute === true)).toBe(true);
  });

  it('selects relevant read-only tools from user intent', () => {
    expect(selectReadOnlyToolsForMessage('Why is my checkout test blocked?', {})).toContain(
      'list_tests_summary'
    );
    expect(selectReadOnlyToolsForMessage('Show dashboard revenue stats', {})).toContain(
      'get_dashboard_stats'
    );
    expect(selectReadOnlyToolsForMessage('Do my goal metrics use selectors?', {})).toContain(
      'list_goal_metrics_summary'
    );
  });
});
