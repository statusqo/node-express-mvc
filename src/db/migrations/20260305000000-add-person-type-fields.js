"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // guard against running this migration on a fresh schema where the
    // columns were already incorporated into the baseline snapshot
    const usersDesc = await queryInterface.describeTable("users");
    if (!usersDesc.personType) {
      await queryInterface.addColumn("users", "personType", {
        type: Sequelize.ENUM('private', 'legal'),
        allowNull: false,
        defaultValue: 'private',
      });
    }
    if (!usersDesc.companyName) {
      await queryInterface.addColumn("users", "companyName", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
    if (!usersDesc.companyOib) {
      await queryInterface.addColumn("users", "companyOib", {
        type: Sequelize.STRING(11),
        allowNull: true,
      });
    }

    const ordersDesc = await queryInterface.describeTable("orders");
    if (!ordersDesc.personType) {
      await queryInterface.addColumn("orders", "personType", {
        type: Sequelize.ENUM('private', 'legal'),
        allowNull: false,
        defaultValue: 'private',
      });
    }
    if (!ordersDesc.companyName) {
      await queryInterface.addColumn("orders", "companyName", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
    if (!ordersDesc.companyOib) {
      await queryInterface.addColumn("orders", "companyOib", {
        type: Sequelize.STRING(11),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("users", "personType");
    await queryInterface.removeColumn("users", "companyName");
    await queryInterface.removeColumn("users", "companyOib");

    await queryInterface.removeColumn("orders", "personType");
    await queryInterface.removeColumn("orders", "companyName");
    await queryInterface.removeColumn("orders", "companyOib");
  },
};
