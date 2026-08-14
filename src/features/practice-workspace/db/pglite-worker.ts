import { PGlite } from '@electric-sql/pglite'
import { worker } from '@electric-sql/pglite/worker'

import { seedDatabase } from './seed'

worker({
  async init(options) {
    const database = await PGlite.create({
      ...(options.dataDir === undefined ? {} : { dataDir: options.dataDir }),
      relaxedDurability: true,
    })

    await seedDatabase(database)

    return database
  },
})
