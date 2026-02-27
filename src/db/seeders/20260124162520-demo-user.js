'use strict';
const bcrypt = require('bcrypt');
const crypto = require('crypto');

module.exports = {
  async up(queryInterface, Sequelize) {
    const adminEmail = 'admin@example.com';

    // Check if exists using parameterized query to avoid SQL injection
    const [rows] = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE email = :email LIMIT 1`,
      { replacements: { email: adminEmail } }
    );

    if (rows.length === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);

      await queryInterface.bulkInsert('users', [{
        id: crypto.randomUUID(),
        username: 'admin',
        email: adminEmail,
        passwordHash: passwordHash,
        isAdmin: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }]);
    }
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('users', { email: 'admin@example.com' }, {});
  }
};
