import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Read the service account key
const serviceAccount = JSON.parse(readFileSync('./firebase-admin-key.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();
const db = admin.firestore();

async function createTestTeacher() {
  const teacherId = 'testTeacher';
  const email = `${teacherId}@ace.school`;
  const password = 'password123';

  try {
    // Delete if already exists
    try {
      const existingUser = await auth.getUserByEmail(email);
      await auth.deleteUser(existingUser.uid);
      console.log('Deleted existing test user.');
    } catch (e) {
      // Doesn't exist, fine
    }

    // Create the user in Auth
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      displayName: 'Test Teacher',
    });

    console.log('Successfully created new user:', userRecord.uid);

    // Create the document in teachers collection
    await db.collection('teachers').doc(userRecord.uid).set({
      role: 'teacher',
      firstName: 'Test',
      lastName: 'Teacher',
      teacherId: teacherId
    });

    console.log('Successfully created teacher document.');
    process.exit(0);

  } catch (error) {
    console.error('Error creating test teacher:', error);
    process.exit(1);
  }
}

createTestTeacher();
