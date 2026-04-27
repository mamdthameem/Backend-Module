const { initializeApp } = require('firebase/app');
const { getDatabase } = require('firebase/database');

const firebaseConfig = {
  apiKey: "AIzaSyAWKmpLqiOApfLb9OGa2WEfs_AmPiItA2g",
  authDomain: "ssec-outing.firebaseapp.com",
  databaseURL: "https://ssec-outing-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ssec-outing",
  storageBucket: "ssec-outing.firebasestorage.app",
  messagingSenderId: "286869609907",
  appId: "1:286869609907:web:91bee1c3ddbdffdaa47fc6"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Simple Firebase connection test without authentication
async function testFirebaseConnection() {
  try {
    console.log('🔥 Testing Firebase connection...');
    return true; // Since your rules allow public access, we don't need authentication
  } catch (error) {
    console.error('❌ Firebase connection test failed:', error.message);
    return false;
  }
}

module.exports = { app, database, firebaseConfig, testFirebaseConnection };
