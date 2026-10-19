import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  FlatList,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { getPopularMovies } from '../services/api';
import MovieCard from '../components/MovieCard';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

export default function HomeScreen() {
  // Ett nytt försök ändrar värdet så att useEffect hämtar filmerna igen.
  const [attempt, setAttempt] = useState(0);
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    // Hämtar den första sidan med populära filmer från vårt API.
    async function loadMovies() {
      setLoading(true);
      setError('');
      try {
        const data = await getPopularMovies(1, { signal: controller.signal });

        if (active) {
          setMovies(data.results);
        }
      } catch (error) {
        if (active) {
          setError(error.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadMovies();

    // Avbryt både nätverksanropet och framtida state-uppdateringar.
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  if (loading) {
    return (
      <View style={globalStyles.container}>
        <View style={styles.status} accessibilityLiveRegion="polite">
          <ActivityIndicator
            size="large"
            color={colors.accent}
            accessibilityLabel="Hämtar filmer"
          />
          <Text style={styles.message}>Hämtar filmer…</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={globalStyles.container}>
        <View style={styles.status} accessibilityLiveRegion="polite">
          <Text style={styles.message}>{error}</Text>
          <Button
            title="Försök igen"
            color={colors.accent}
            onPress={() => setAttempt((current) => current + 1)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={globalStyles.container}>
      <FlatList
        data={movies}
        keyExtractor={(movie) => String(movie.id)}
        renderItem={({ item }) => <MovieCard movie={item} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={[globalStyles.title, styles.title]}>Populära filmer</Text>
        }
        ListEmptyComponent={<Text style={styles.message}>Inga filmer hittades</Text>}
        ListFooterComponent={<Text style={styles.credit}>Filmdata från TMDB</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center'
  },

  title: {
    marginBottom: 20
  },

  status: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },

  message: {
    color: colors.secondaryText,
    textAlign: 'center',
    marginVertical: 16,
    fontSize: fonts.sizes.normal
  },

  credit: {
    color: colors.secondaryText,
    textAlign: 'center',
    fontSize: fonts.sizes.small,
    marginVertical: 16
  },
});
