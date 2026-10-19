import { useContext, useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { getMovieDetails, getMovieReviews } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import ReviewCard from '../components/ReviewCard';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

export default function MovieDetailsScreen({ route, navigation }) {
  const { user, isAuthenticated } = useContext(AuthContext);
  const isFocused = useIsFocused();
  // Filmkortet skickar ID:t som behövs för att hämta detaljerna.
  const movieId = route.params?.movieId;
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState('');
  const [reviewsAttempt, setReviewsAttempt] = useState(0);

  let validMovieId = Number.isSafeInteger(movieId);

  if (movieId < 1) {
    validMovieId = false;
  }

  useEffect(() => {
    if (!validMovieId) {
      return;
    }

    const controller = new AbortController();

    // Tömmer föregående film medan den valda filmens detaljer hämtas.
    async function loadMovie() {
      setLoading(true);
      setError('');
      setMovie(null);
      setImageFailed(false);
      try {
        const data = await getMovieDetails(movieId, { signal: controller.signal });

        if (!controller.signal.aborted) {
          setMovie(data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadMovie();
    // Avbryt när film-ID ändras eller detaljskärmen avmonteras.
    return () => controller.abort();
  }, [movieId, validMovieId, attempt]);

  // Hämtar nya recensioner vid återkomst och efter ändringar i listan.
  useEffect(() => {
    // Gamla recensioner ska inte visas som om de vore nyss hämtade.
    setReviews([]);
    setReviewsLoading(true);
    setReviewsError('');
    if (!isFocused || !validMovieId) {
      return;
    }
    const controller = new AbortController();

    async function loadReviews() {
      try {
        // Recensionerna är publika, så anropet behöver ingen inloggning.
        const data = await getMovieReviews(movieId, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setReviews(data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setReviewsError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setReviewsLoading(false);
        }
      }
    }

    loadReviews();
    return () => controller.abort();
  }, [isFocused, movieId, validMovieId, reviewsAttempt, user?.id]);

  // Öppnar mobilens delningsmeny med filmens titel och länk.
  async function handleShare() {
    if (!Number.isSafeInteger(movie?.id) || movie.id < 1) {
      Alert.alert('Kan inte dela filmen', 'Filmens ID saknas eller är ogiltigt.');
      return;
    }
    if (typeof movie.title !== 'string' || !movie.title.trim()) {
      Alert.alert('Kan inte dela filmen', 'Filmens titel saknas.');
      return;
    }

    try {
      const result = await Share.share({
        message: `Kolla in ${movie.title.trim()}!\n\nhttps://www.themoviedb.org/movie/${movie.id}`,
      });
      // Ett avbrott ska inte visas som ett fel eller ett lyckat resultat.
      if (result.action === Share.dismissedAction) {
        return;
      }
    } catch {
      Alert.alert('Kunde inte dela filmen', 'Försök igen om en stund.');
    }
  }

  if (!validMovieId) {
    return (
      <View style={globalStyles.placeholderContainer}>
        <Text style={globalStyles.text}>Film-ID saknas eller är ogiltigt.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[globalStyles.container, styles.status]}>
        <ActivityIndicator
          size="large"
          color={colors.accent}
          accessibilityLabel="Hämtar filmdetaljer"
        />
        <Text style={styles.message}>Hämtar filmdetaljer...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[globalStyles.container, styles.status]}>
        <Text style={styles.message}>{error}</Text>
        <Pressable
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel="Försök hämta filmdetaljer igen"
          onPress={() => setAttempt((current) => current + 1)}
        >
          <Text style={styles.retryText}>Försök igen</Text>
        </Pressable>
      </View>
    );
  }

  if (!movie) {
    return (
      <View style={globalStyles.placeholderContainer}>
        <Text style={globalStyles.text}>Filmen hittades inte.</Text>
      </View>
    );
  }

  // Backend validerar filmdata. Här väljer vi endast vad som visas.
  const title = movie.title || 'Titel saknas';
  const ownReview = reviews.find(review => review.user?.id === user?.id);
  const releaseDate = movie.release_date || 'Premiärdatum saknas';
  const overview = movie.overview.trim() || 'Beskrivning saknas för den här filmen.';
  let rating = 'Betyg saknas';

  if (movie.vote_average !== null) {
    rating = `${movie.vote_average.toFixed(1).replace('.', ',')} / 10`;
  }

  let genreInfo = null;

  if (movie.genres.length > 0) {
    const genres = movie.genres.map((genre) => genre.name).join(', ');

    genreInfo = <Text style={styles.metadata}>Genrer: {genres}</Text>;
  }

  let runtimeInfo = null;

  if (movie.runtime !== null) {
    runtimeInfo = <Text style={styles.metadata}>Speltid: {movie.runtime} minuter</Text>;
  }

  let showPoster = Boolean(movie.poster_path);

  if (imageFailed) {
    showPoster = false;
  }

  let poster = (
    <View style={[styles.poster, styles.placeholder]}>
      <Text style={styles.message}>Affisch saknas</Text>
    </View>
  );

  if (showPoster) {
    poster = (
      <Image
        source={{ uri: `https://image.tmdb.org/t/p/w500${movie.poster_path}` }}
        style={styles.poster}
        resizeMode="cover"
        accessibilityLabel={`Filmaffisch för ${title}`}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <ScrollView
      style={globalStyles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={globalStyles.title}>{title}</Text>
      {poster}
      <Text style={styles.metadata}>Premiärdatum: {releaseDate}</Text>
      <Text style={styles.rating}>TMDB-betyg: {rating}</Text>
      {genreInfo}
      {runtimeInfo}
      <Text style={styles.heading}>Handling</Text>
      <Text style={globalStyles.text}>{overview}</Text>
      <Pressable
        style={[styles.retryButton, styles.shareButton]}
        accessibilityRole="button"
        onPress={handleShare}
      >
        <Text style={styles.retryText}>Dela film</Text>
      </Pressable>
      <Text style={styles.heading}>Recensioner</Text>
      {reviewsLoading && <ActivityIndicator color={colors.accent} accessibilityLabel="Hämtar recensioner" />}
      {reviewsError !== '' && (
        <View>
          <Text style={styles.message}>{reviewsError}</Text>
          <Pressable
            style={styles.retryButton}
            accessibilityRole="button"
            onPress={() => setReviewsAttempt(current => current + 1)}
          >
            <Text style={styles.retryText}>Försök igen</Text>
          </Pressable>
        </View>
      )}
      {!reviewsLoading && !reviewsError && reviews.length === 0 && (
        <Text style={styles.message}>Inga recensioner ännu</Text>
      )}
      {reviews.map(review => (
        <ReviewCard
          key={review.id}
          review={review}
          movieTitle={title}
          onChanged={() => setReviewsAttempt(current => current + 1)}
        />
      ))}
      {!isAuthenticated && (
        <Pressable
          style={styles.retryButton}
          accessibilityRole="button"
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.retryText}>Logga in för att skriva en recension</Text>
        </Pressable>
      )}
      {isAuthenticated && !reviewsLoading && !reviewsError && !ownReview && (
        <Pressable
          style={styles.retryButton}
          accessibilityRole="button"
          onPress={() => navigation.navigate('ReviewEditor', { movieId, movieTitle: title })}
        >
          <Text style={styles.retryText}>Skriv recension</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },

  status: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },

  message: {
    color: colors.secondaryText,
    fontSize: fonts.sizes.normal,
    lineHeight: 24,
    textAlign: 'center',
    marginVertical: 16,
  },

  poster: {
    width: '100%',
    maxWidth: 300,
    aspectRatio: 2 / 3,
    borderRadius: 8,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 24,
  },

  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16
  },

  metadata: {
    color: colors.secondaryText,
    fontSize: fonts.sizes.normal,
    lineHeight: 24,
    marginBottom: 12,
  },

  rating: {
    color: colors.accent,
    fontSize: fonts.sizes.normal,
    marginBottom: 12
  },

  heading: {
    color: colors.primaryText,
    fontSize: fonts.sizes.cardTitle,
    fontWeight: fonts.weights.bold,
    marginTop: 12,
    marginBottom: 12,
  },

  shareButton: {
    minHeight: 48,
    marginVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  retryButton: {
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: 8
  },

  retryText: {
    color: colors.background,
    fontSize: fonts.sizes.normal,
    fontWeight: fonts.weights.bold
  },
});
