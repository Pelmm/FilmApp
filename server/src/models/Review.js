import mongoose from 'mongoose';

// Kontrollerar recensionens uppgifter även när de sparas via Mongoose.
const reviewSchema = new mongoose.Schema({
  // Kopplar recensionen till användaren utan att kopiera hela användarobjektet.
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Filmens ID kommer från TMDB, inte från en egen filmsamling i MongoDB.
  movieId: {
    type: Number,
    required: true,
    min: 1,
    validate: {
      validator: Number.isSafeInteger,
      message: 'Film-ID måste vara ett positivt, säkert heltal.',
    },
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 10,
    validate: {
      validator: Number.isInteger,
      message: 'Betyget måste vara ett heltal.',
    },
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxLength: 2000,
  },
}, {
  // Mongoose håller reda på när recensionen skapades och senast ändrades.
  timestamps: true,
});

// Tillåter bara en recension per användare och film, även vid samtidiga anrop.
reviewSchema.index({ user: 1, movieId: 1 }, { unique: true });

const Review = mongoose.model('Review', reviewSchema);

export default Review;
