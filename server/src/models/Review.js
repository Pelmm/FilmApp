import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
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
  timestamps: true,
});

reviewSchema.index({ user: 1, movieId: 1 }, { unique: true });

const Review = mongoose.model('Review', reviewSchema);

export default Review;
