const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const WebSocket = require('ws');

dotenv.config();

const app = express();
const PORT = process.env.PORT;

// Initialize Firebase Admin SDK
const serviceAccountPath = path.resolve(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
});

const db = admin.firestore();

// Traccar API configuration
const TRACCAR_USERNAME = process.env.TRACCAR_USERNAME;
const TRACCAR_PASSWORD = process.env.TRACCAR_PASSWORD;

// Middleware to parse JSON requests
app.use(express.json());

let sessionCookie = '';

// Traccar session creation
const createTraccarSession = async () => {
  try {
    const response = await axios.post('https://demo4.traccar.org/api/session', new URLSearchParams({
      email: TRACCAR_USERNAME,
      password: TRACCAR_PASSWORD
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      withCredentials: true
    });

    console.log('Traccar session established');
    // Extract session cookie
    sessionCookie = response.headers['set-cookie'][0];
    console.log('Session Cookie:', sessionCookie);

  } catch (error) {
    console.error('Error creating Traccar session:', error);
  }
};

const connectWebSocket = () => {
  const ws = new WebSocket('wss://demo4.traccar.org/api/socket', {
    headers: {
      Cookie: sessionCookie
    }
  });

  ws.on('message', (data) => {
    const messageData = JSON.parse(data);
    if (messageData.positions) {
      messageData.positions.forEach((position) => {
        const deviceRef = db.collection('devices').doc(`${position.deviceId}`);
        const deviceData = {
          id: position.deviceId,
          lat: position.latitude,
          lng: position.longitude,
          batteryLevel: position.attributes ? Math.round(position.attributes.batteryLevel) : null
        };
        deviceRef.set(deviceData, { merge: true });
      });
    }

    if (messageData.devices) {
      messageData.devices.forEach((device) => {
        const deviceRef = db.collection('devices').doc(`${device.id}`);
        const deviceData = {
          id: device.id,
          name: device.name,
          status: device.status
        };
        deviceRef.set(deviceData, { merge: true });
      });
    }
  });

  ws.on('open', () => {
    console.log('WebSocket connection established');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed. Attempting to reconnect...');
    setTimeout(connectWebSocket, 5000);
  });
};

// Start the server
app.listen(PORT, async () => {
  console.log(`Pawsitive server running on http://localhost:${PORT}`);
  await createTraccarSession();
  connectWebSocket();
});