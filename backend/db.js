// MongoDB-backed user/session store. All functions are async — this
// replaced an earlier JSON-file store (kept native dependencies off the
// table entirely, since better-sqlite3 needs a C++ build toolchain this
// environment doesn't have), but a real MongoDB instance is available here,
// so this is the more standard choice once that's true.
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/';
const DB_NAME = process.env.MONGO_DB_NAME || 'ai_gos_hud';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// Case-insensitive matching, replacing the old JSON store's .toLowerCase()
// comparisons for username/email lookups.
const CI_COLLATION = { locale: 'en', strength: 2 };

let usersCol = null;
let sessionsCol = null;
let knowledgeCol = null;
let connecting = null;

function connect() {
  if (!connecting) {
    connecting = (async () => {
      const client = new MongoClient(MONGO_URL);
      await client.connect();
      const db = client.db(DB_NAME);
      usersCol = db.collection('users');
      sessionsCol = db.collection('sessions');
      knowledgeCol = db.collection('assistant_knowledge');
      await usersCol.createIndex({ username: 1 }, { unique: true, collation: CI_COLLATION });
      await usersCol.createIndex({ email: 1 }, { unique: true, collation: CI_COLLATION });
      await usersCol.createIndex({ id: 1 }, { unique: true });
      await sessionsCol.createIndex({ token: 1 }, { unique: true });
      // TTL index: MongoDB's background task deletes session documents once
      // expiresAt has passed, so expired sessions clean themselves up. The
      // findSession() expiry check below is a synchronous backstop for the
      // window before that background sweep runs (it's not instant).
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
  // Log out anywhere the deleted user was signed in.
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

// Learned Q&A for the dashboard's built-in assistant — taught by users via
// the "teach: <answer>" chat flow, shared across every account/session
// (there's nothing user-specific about knowing how the project works).
async function getLearnedKnowledge() {
  await connect();
  return knowledgeCol.find({}).sort({ createdAt: 1 }).toArray();
}

async function addLearnedKnowledge({ question, answer, userId }) {
  await connect();
  const entry = {
    id: crypto.randomUUID(),
    question,
    answer,
    userId,
    createdAt: new Date().toISOString()
  };
  await knowledgeCol.insertOne(entry);
  return entry;
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
  deleteSession,
  getLearnedKnowledge,
  addLearnedKnowledge
};
