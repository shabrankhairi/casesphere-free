'use strict'
// ============================================================================
//  Case Sphere — Binary Entrypoint
//  Handles: --migrate, --seed, --migrate-and-seed, dan normal server mode
// ============================================================================

require('dotenv').config()

const args = process.argv.slice(2)
const doMigrate        = args.includes('--migrate')
const doSeed           = args.includes('--seed')
const doMigrateAndSeed = args.includes('--migrate-and-seed')
const doServer         = !doMigrate && !doSeed && !doMigrateAndSeed

async function run() {

  if (doMigrate) {
    console.log('[entrypoint] Running migrations...')
    const { migrate } = require('./db/migrate')
    await migrate()
    process.exit(0)
  }

  if (doSeed) {
    console.log('[entrypoint] Running seed...')
    const { seed } = require('./db/seed')
    await seed()
    process.exit(0)
  }

  if (doMigrateAndSeed) {
    console.log('[entrypoint] Running migrate + seed...')
    const { migrate } = require('./db/migrate')
    await migrate()
    const { seed } = require('./db/seed')
    await seed()
    process.exit(0)
  }

  if (doServer) {
    require('./server')
  }
}

run().catch(err => {
  console.error('[entrypoint] Error:', err.message)
  process.exit(1)
})
