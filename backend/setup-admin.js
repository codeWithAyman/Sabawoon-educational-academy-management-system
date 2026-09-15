require('dotenv').config()

const bcrypt = require('bcryptjs')
const { query } = require('./src/db/pool')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrator'

async function setupAdmin() {
  try {
    console.log('')
    console.log('========================================')
    console.log('             ADMIN SETUP')
    console.log('========================================')
    console.log('')

    if (!ADMIN_EMAIL) {
      throw new Error('ADMIN_EMAIL is missing from .env')
    }

    if (!ADMIN_PASSWORD) {
      throw new Error('ADMIN_PASSWORD is missing from .env')
    }

    if (ADMIN_PASSWORD.length < 6) {
      throw new Error('ADMIN_PASSWORD must be at least 6 characters long.')
    }

    const email = ADMIN_EMAIL.trim().toLowerCase()

    const existing = await query(
      'SELECT id, email, role FROM users WHERE LOWER(email)=LOWER($1)',
      [email]
    )

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10)

    if (existing.rows.length) {
      const admin = existing.rows[0]

      await query(
        `
        UPDATE users
        SET
          email=$1,
          password_hash=$2,
          role='admin',
          full_name=$3,
          is_active=TRUE,
          updated_at=NOW()
        WHERE id=$4
        `,
        [email, passwordHash, ADMIN_NAME, admin.id]
      )

      console.log('Admin account updated successfully.')
      console.log('')
      console.log(`ID:       ${admin.id}`)
      console.log(`Email:    ${email}`)
      console.log(`Role:     admin`)
    } else {
      const result = await query(
        `
        INSERT INTO users
          (email, password_hash, role, full_name, is_active)
        VALUES
          ($1, $2, 'admin', $3, TRUE)
        RETURNING id
        `,
        [email, passwordHash, ADMIN_NAME]
      )

      console.log('Admin account created successfully.')
      console.log('')
      console.log(`ID:       ${result.rows[0].id}`)
      console.log(`Email:    ${email}`)
      console.log(`Role:     admin`)
    }

    console.log('')
    console.log('========================================')
    console.log('             LOGIN DETAILS')
    console.log('========================================')
    console.log('')
    console.log(`Email:    ${email}`)
    console.log('Password: [stored in .env]')
    console.log('')
    console.log('Setup complete.')
    console.log('')

    process.exit(0)
  } catch (error) {
    console.error('')
    console.error('ADMIN SETUP FAILED')
    console.error('----------------------------------------')
    console.error(error.message)
    console.error('')

    process.exit(1)
  }
}

setupAdmin()