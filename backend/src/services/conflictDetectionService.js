/**
 * Experiment Conflict Detection
 *
 * Warns when tests may overlap (same target, both running)
 */

const { getTestsByShop } = require('../models/test');

function targetsOverlap(t1, t2) {
  const target1 = `${t1.target_type || 'any'}:${t1.target_id || ''}`;
  const target2 = `${t2.target_type || 'any'}:${t2.target_id || ''}`;
  if (target1 === 'any:' && target2 === 'any:') {
    return true;
  }
  if (target1 === target2) {
    return true;
  }
  if (!t1.target_id || !t2.target_id) {
    return false;
  }
  return t1.target_type === t2.target_type && t1.target_id === t2.target_id;
}

async function findConflicts(shopDomain, testId, testData) {
  const running = await getTestsByShop(shopDomain, 'running');
  const conflicts = running.filter(t => {
    if (t.id === testId) {
      return false;
    }
    return targetsOverlap(t, testData);
  });
  return conflicts;
}

module.exports = {
  findConflicts,
  targetsOverlap,
};
