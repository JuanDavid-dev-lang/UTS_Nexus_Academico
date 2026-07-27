import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDb() {
  if (!env.MONGODB_URI) return;
  await mongoose.connect(env.MONGODB_URI);
  mongoose.set('strictQuery', true);
}

