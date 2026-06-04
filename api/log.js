import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const options = {};

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = await MongoClient.connect(uri, options);
  const db = client.db('cook2shop');

  cachedClient = client;
  cachedDb = db;
  return { client, db };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { event, data } = req.body;
    if (!event || !data) {
      return res.status(400).json({ error: 'Missing event or data' });
    }

    const { db } = await connectToDatabase();
    await db.collection('logs').insertOne({
      timestamp: new Date(),
      event,
      data,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('MongoDB Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
