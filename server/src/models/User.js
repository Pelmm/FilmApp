import mongoose from 'mongoose';

// Beskriver vilka användaruppgifter som sparas i MongoDB.
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    // Ett unikt index hindrar två konton från att få samma e-postadress.
    unique: true,
    trim: true,
    lowercase: true,
  },
  // Sparar lösenordets hash, aldrig själva lösenordet.
  passwordHash: {
    type: String,
    required: true,
  },
}, {
  // Mongoose lägger till createdAt och updatedAt automatiskt.
  timestamps: true,
});

const User = mongoose.model('User', userSchema);

export default User;