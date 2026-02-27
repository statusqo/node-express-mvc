# Database seeders

Seeders insert demo/sample data. They run **only when you tell the CLI to run them** (unlike migrations, which run in order once).

## Run all seeders

```bash
npm run seed
```

or:

```bash
npx sequelize-cli db:seed:all
```

This runs every file in `src/db/seeders/` in name order (e.g. demo-nav-links, demo-user, demo-courses).

## Run a single seeder

```bash
npx sequelize-cli db:seed --seed 20260124162600-demo-courses.js
```

## Undo all seeders

```bash
npm run seed:undo
```

or:

```bash
npx sequelize-cli db:seed:undo:all
```

## Note

- **`db:seed`** (without `:all`) does **not** run all seeders. Use **`db:seed:all`** or **`npm run seed`** to run all.
- **`db:seed --seed <filename>`** runs only that one seeder.
