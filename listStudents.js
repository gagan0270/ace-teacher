import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./firebase-admin-key.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function listStudents() {
  try {
    const snap = await db.collection('students').limit(10).get();
    console.log(`Found ${snap.size} students:`);
    snap.forEach(doc => {
      const data = doc.data();
      console.log(`- ID: ${doc.id}, SATS ID: ${data.satsId}, Name: ${data.name}, Class: ${data.class}, Section: ${data.section}, parentUid: ${data.parentUid}`);
    });
    process.exit(0);
  } catch (error) {
    console.error('Error listing students:', error);
    process.exit(1);
  }
}

listStudents();
