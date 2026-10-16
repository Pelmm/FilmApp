import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { getMovieDetails } from '../services/api';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

export default function MovieDetailsScreen({ route }) {
  const movieId = route.params?.movieId;
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);

  let validMovieId = Number.isSafeInteger(movieId);

  if (movieId < 1) {
    validMovieId = false;
  }

  useEffect(() => {
    if (!validMovieId) {
      return;
    }

    const controller = new AbortController();

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
