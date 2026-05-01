import { db } from '../src/db';
import { users } from '../src/db/schema';
import { hash } from 'bcryptjs';

async function seed() {
  console.log('Seeding database...');
  
  const passwordHash = await hash('password123', 10);
  
  await db.insert(users).values([
    {
      username: 'ken',
      passwordHash,
      name: 'Ken',
      email: 'ken@example.com',
      role: 'admin',
      team: 'IT/Engineering',
    },
    {
      username: 'mark',
      passwordHash,
      name: 'Mark Siazon',
      email: 'mark@example.com',
      role: 'admin',
      team: 'Design/PM',
    }
  ]).onConflictDoNothing();
  
  console.log('Seed complete! Test users created: ken / password123');
}

seed().catch(console.error);