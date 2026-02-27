#!/usr/bin/env node
/**
 * One-off script to verify the users table and demo user for login debugging.
 * Run from project root: node scripts/check-login-db.js
 */
const path = require("path");
const config = require("../src/config");
const { sequelize } = require("../src/db/client");

async function main() {
  console.log("DB storage path:", path.resolve(process.cwd(), config.db.storage));
  console.log("");

  try {
    const [rows] = await sequelize.query(
      "SELECT id, email, username, length(passwordHash) as hashLen, typeof(passwordHash) as hashType FROM users LIMIT 5"
    );
    console.log("Users in DB:", rows.length);
    rows.forEach((r, i) => {
      console.log(`  ${i + 1}. id=${r.id} email=${r.email} username=${r.username} passwordHash length=${r.hashLen} type=${r.hashType}`);
    });
    if (rows.length === 0) {
      console.log("\nNo users found. Run: npx sequelize-cli db:seed --seed 20260124162520-demo-user.js");
    } else {
      const admin = rows.find((r) => r.email === "admin@example.com" || r.username === "admin");
      if (admin) {
        console.log("\nDemo user (admin@example.com / admin) found. passwordHash length:", admin.hashLen);
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await sequelize.close();
  }
}

main();
