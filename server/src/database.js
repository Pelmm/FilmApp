import mongoose from 'mongoose';

export async function connectDatabase() {
  // Hämtar anslutningssträngen från miljön så att den inte behöver stå i koden.
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Ansluten till MongoDB Atlas');
}