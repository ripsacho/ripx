/**
 * Test Assignment Model
 *
 * Tracks which variant each user is assigned to
 */

const { query } = require('../utils/database');

class TestAssignmentModel {
  /**
   * Get user's variant assignment for a test
   *
   * @param {string} testId - Test ID
   * @param {string} userId - User ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Object|null>} Assignment or null
   */
  async getTestAssignment(testId, userId, shopDomain) {
    const sql = `
      SELECT * FROM test_assignments
      WHERE test_id = $1 AND user_id = $2 AND shop_domain = $3
    `;

    const result = await query(sql, [testId, userId, shopDomain]);
    return result.rows[0] || null;
  }

  /**
   * Save test assignment
   *
   * @param {Object} assignment - Assignment data
   * @returns {Promise<Object>} Saved assignment
   */
  async saveTestAssignment(assignment) {
    const {
      test_id,
      user_id,
      shop_domain,
      variant_id,
      variant_name,
      assigned_at
    } = assignment;

    const sql = `
      INSERT INTO test_assignments (
        test_id, user_id, shop_domain, variant_id, 
        variant_name, assigned_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (test_id, user_id, shop_domain)
      DO UPDATE SET
        variant_id = EXCLUDED.variant_id,
        variant_name = EXCLUDED.variant_name,
        assigned_at = EXCLUDED.assigned_at
      RETURNING *
    `;

    const result = await query(sql, [
      test_id,
      user_id,
      shop_domain,
      variant_id,
      variant_name,
      assigned_at
    ]);

    return result.rows[0];
  }

  /**
   * Get assignment statistics for a test
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Array>} Assignment stats by variant
   */
  async getAssignmentStats(testId, shopDomain) {
    const sql = `
      SELECT 
        variant_id,
        variant_name,
        COUNT(*) as assignment_count
      FROM test_assignments
      WHERE test_id = $1 AND shop_domain = $2
      GROUP BY variant_id, variant_name
    `;

    const result = await query(sql, [testId, shopDomain]);
    return result.rows;
  }
}

const model = new TestAssignmentModel();

module.exports = {
  getTestAssignment: (testId, userId, shop) =>
    model.getTestAssignment(testId, userId, shop),
  saveTestAssignment: (assignment) =>
    model.saveTestAssignment(assignment),
  getAssignmentStats: (testId, shop) =>
    model.getAssignmentStats(testId, shop)
};

