// MongoDB-backed user/session store — shared by the local backend/server.js
// and by the Vercel serverless functions in api/auth/. Kept as a byte-for-byte
// copy of backend/db.js (not a shared import) because Vercel's build only
// bundles files under api/, and this way each deployment target has no
// cross-directory require() to break if one side changes its layout.
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/';
const DB_NAME = process.env.MONGO_DB_NAME || 'ai_gos_hud';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CI_COLLATION = { locale: 'en', strength: 2 };

let usersCol = null;
let sessionsCol = null;
let connecting = null;

function connect() {
  if (!connecting) {
    connecting = (async () => {
      const client = new MongoClient(MONGO_URL);
      await client.connect();
      const db = client.db(DB_NAME);
      usersCol = db.collection('users');
      sessionsCol = db.collection('sessions');
      await usersCol.createIndex({ username: 1 }, { unique: true, collation: CI_COLLATION });
      await usersCol.createIndex({ email: 1 }, { unique: true, collation: CI_COLLATION });
      await usersCol.createIndex({ id: 1 }, { unique: true });
      await sessionsCol.createIndex({ token: 1 }, { unique: true });
      await sessionsCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      console.log(`[DB] Connected to MongoDB (${MONGO_URL}${DB_NAME})`);
    })();
  }
  return connecting;
}

async function findUserByUsername(username) {
  await connect();
  return usersCol.findOne({ username }, { collation: CI_COLLATION });
}

async function findUserByEmail(email) {
  await connect();
  return usersCol.findOne({ email }, { collation: CI_COLLATION });
}

async function findUserById(id) {
  await connect();
  return usersCol.findOne({ id });
}

async function createUser({ username, email, passwordHash, isAdmin = false }) {
  await connect();
  const user = {
    id: crypto.randomUUID(),
    username,
    email,
    passwordHash,
    isAdmin,
    createdAt: new Date().toISOString()
  };
  await usersCol.insertOne(user);
  return user;
}

async function getAllUsers() {
  await connect();
  return usersCol.find({}).toArray();
}

async function setUserAdmin(id, isAdmin) {
  await connect();
  return usersCol.findOneAndUpdate({ id }, { $set: { isAdmin } }, { returnDocument: 'after' });
}

async function deleteUser(id) {
  await connect();
  const result = await usersCol.deleteOne({ id });
  if (result.deletedCount === 0) return false;
  await sessionsCol.deleteMany({ userId: id });
  return true;
}

async function createSession(userId) {
  await connect();
  const token = crypto.randomBytes(32).toString('hex');
  const session = { token, userId, createdAt: Date.now(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) };
  await sessionsCol.insertOne(session);
  return session;
}

async function findSession(token) {
  await connect();
  const session = await sessionsCol.findOne({ token });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await deleteSession(token);
    return null;
  }
  return session;
}

async function deleteSession(token) {
  await connect();
  await sessionsCol.deleteOne({ token });
}

module.exports = {
  findUserByUsername,
  findUserByEmail,
  findUserById,
  createUser,
  getAllUsers,
  setUserAdmin,
  deleteUser,
  createSession,
  findSession,
  deleteSession
};
