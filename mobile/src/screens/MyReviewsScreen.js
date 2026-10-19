import { useContext, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import ReviewCard from '../components/ReviewCard';
import { getMyReviews, getMovieDetails } from '../services/api';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

export default function MyReviewsScreen() {
  const { user, token, signOut, invalidateSession } = useContext(AuthContext);
  const isFocused = useIsFocused();
  const [reviews, setReviews] = useState([]);
  const [titles, setTitles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const titleCache = useRef({});

  useEffect(() => {
    setReviews([]);
    setError('');
    setLoading(true);
    if (!isFocused || !token) {
      return;
    }
    const controller = new AbortController();

    async function loadReviews() {
      try {
        const data = await getMyReviews(token, { signal: controller.signal });
        if (controller.signal.aborted) {
          return;
        }
        setReviews(data);
        setLoading(false);

        // Hämta en titel åt gången och återanvänd redan hämtade titlar.
        for (const review of data) {
          if (titleCache.current[review.movieId]) {
            continue;
          }
          try {
            const movie = await getMovieDetails(review.movieId, { signal: controller.signal });
            if (controller.signal.aborted) {
              return;
            }
            titleCache.current[review.movieId] = movie.title || `Film ${review.movieId}`;
            setTitles({ ...titleCache.current });
          } catch {
            if (controller.signal.aborted) {
              return;
            }
            // Film-ID visas om just denna films titel inte kan hämtas.
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        if (error.status === 401) {
          await invalidateSession(token);
        } else {
          setError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadReviews();
    return () => controller.abort();
  }, [isFocused, token, attempt]);

  async function handleLogout() {
    if (loggingOut) {
      return;
    }
    setLoggingOut(true);
    setLogoutError('');
    try {
      await signOut();
      // Navigatorn tar automatiskt bort de skyddade skärmarna.
    } catch (error) {
      setLogoutError(error.message);
      setLoggingOut(false);
    }
  }

  const header = (
    <View>
      <Text style={globalStyles.title}>Mina recensioner</Text>
      <Text style={globalStyles.text}>Inloggad som {user?.username}.</Text>
      {logoutError !== '' && <Text style={styles.message}>{logoutError}</Text>}
      <Pressable
        style={[styles.button, loggingOut && styles.disabledButton]}
        accessibilityRole="button"
        accessibilityState={{ disabled: loggingOut, busy: loggingOut }}
        disabled={loggingOut}
        onPress={handleLogout}
      >
        <Text style={styles.buttonText}>Logga ut</Text>
      </Pressable>
    </View>
  );

  let emptyList = <Text style={styles.message}>Du har inga recensioner ännu.</Text>;
  if (loading) {
    emptyList = <ActivityIndicator color={colors.accent} accessibilityLabel="Hämtar dina recensioner" />;
  } else if (error) {
    emptyList = (
      <View>
        <Text style={styles.message} accessibilityLiveRegion="polite">{error}</Text>
        <Pressable
          style={styles.button}
          accessibilityRole="button"
          onPress={() => setAttempt(current => current + 1)}
        >
          <Text style={styles.buttonText}>Försök igen</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={globalStyles.container}
      contentContainerStyle={styles.content}
      data={reviews}
      keyExtractor={review => review.id}
      ListHeaderComponent={header}
      ListEmptyComponent={emptyList}
      renderItem={({ item }) => (
        <ReviewCard
          review={item}
          movieTitle={titles[item.movieId] || `Film ${item.movieId}`}
          showMovieLink
          onChanged={() => setAttempt(current => current + 1)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    flexGrow: 1,
  },

  button: {
    backgroundColor: colors.accent,
    minHeight: 48,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
  },

  buttonText: {
    color: colors.background,
    fontSize: fonts.sizes.normal,
    fontWeight: fonts.weights.bold,
  },

  disabledButton: {
    opacity: 0.5,
  },

  message: {
    color: colors.secondaryText,
    fontSize: fonts.sizes.normal,
    marginVertical: 16,
  },
});
