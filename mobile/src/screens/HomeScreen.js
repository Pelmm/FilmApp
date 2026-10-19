import { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  ActivityIndicator,
  Button,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { getPopularMovies, mergeMovies } from '../services/api';
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

  const isFocused = useIsFocused();
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const request = useRef(null);

  useEffect(() => {
    if (isFocused) {
      if (page === 0) {
        // Hämtar första sidan och behåller redan laddade filmer vid återkomst.
        loadMovies(1);
      }
    } else {
      setLoading(false);
      setLoadingMore(false);
    }
    // Avbryter även när en annan skärm öppnas ovanpå startsidan.
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [isFocused, attempt]);

  async function loadMovies(nextPage) {
    if (request.current) {
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const more = nextPage > 1;
    if (more) {
      setLoadingMore(true);
      setMoreError('');
    } else {
      setLoading(true);
      setError('');
    }
    try {
      const data = await getPopularMovies(nextPage, { signal: controller.signal });
      if (!controller.signal.aborted) {
        // Lägger till nästa sida utan att ta bort tidigare filmer.
        setMovies(current => mergeMovies(more ? current : [], data.results));
        setPage(data.page);
        setTotalPages(Math.min(data.total_pages, 500));
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (more) {
          setMoreError('Kunde inte ladda fler filmer. ' + error.message);
        } else {
          setError(error.message);
        }
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }

  function loadMore() {
    if (page < 1 || page >= totalPages) {
      return;
    }
    loadMovies(page + 1);
  }

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
        ListFooterComponent={
          <View>
            {moreError !== '' && (
              <Text style={styles.message} accessibilityLiveRegion="polite">{moreError}</Text>
            )}
            {page > 0 && page < totalPages && (
              <Pressable
                style={styles.moreButton}
                onPress={loadMore}
                disabled={loadingMore}
                accessibilityRole="button"
                accessibilityState={{ disabled: loadingMore, busy: loadingMore }}
                accessibilityLabel="Ladda fler filmer"
              >
                {loadingMore && <ActivityIndicator color={colors.background} accessibilityLabel="Hämtar fler filmer" />}
                <Text style={styles.moreButtonText}>Ladda fler</Text>
              </Pressable>
            )}
            <Text style={styles.credit}>Filmdata från TMDB</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  moreButton: {
    minHeight: 48,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  moreButtonText: {
    color: colors.background,
    fontSize: fonts.sizes.normal,
    fontWeight: fonts.weights.bold,
  },

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
