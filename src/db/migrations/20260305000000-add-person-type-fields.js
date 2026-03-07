"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "personType", {
      type: Sequelize.ENUM('private', 'legal'),
      allowNull: false,
      defaultValue: 'private',
    });
    await queryInterface.addColumn("users", "companyName", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("users", "companyOib", {
      type: Sequelize.STRING(11),
      allowNull: true,
    });

    await queryInterface.addColumn("orders", "personType", {
      type: Sequelize.ENUM('private', 'legal'),
      allowNull: false,
      defaultValue: 'private',
    });
    await queryInterface.addColumn("orders", "companyName", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("orders", "companyOib", {
      type: Sequelize.STRING(11),
      allowNull: true,
    });
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
