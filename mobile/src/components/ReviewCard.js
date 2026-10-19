import { useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AuthContext } from '../context/AuthContext';
import { deleteReview } from '../services/api';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

export default function ReviewCard({ review, movieTitle, showMovieLink = false, onChanged }) {
  const navigation = useNavigation();
  const { user, token, isAuthenticated, invalidateSession } = useContext(AuthContext);
  const [deleting, setDeleting] = useState(false);
  const request = useRef(null);
  const confirming = useRef(false);
  const isOwner = isAuthenticated && review.user?.id === user.id;

  useEffect(() => {
    function cancelRequest() {
      confirming.current = false;
      request.current?.abort();
      request.current = null;
    }
    const unsubscribe = navigation.addListener('blur', () => {
      cancelRequest();
      setDeleting(false);
    });
    return () => {
      unsubscribe();
      cancelRequest();
    };
  }, [navigation, token]);

  async function removeReview() {
    if (!confirming.current || request.current || !navigation.isFocused()) {
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setDeleting(true);

    try {
      await deleteReview(token, review.id, { signal: controller.signal });
      if (!controller.signal.aborted) {
        onChanged();
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (error.status === 401) {
        await invalidateSession(token);
      } else {
        Alert.alert('Kunde inte ta bort recensionen', error.message);
        if (error.status === 404 || error.status === 403) {
          onChanged();
        }
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        confirming.current = false;
        if (!controller.signal.aborted) {
          setDeleting(false);
        }
      }
    }
  }

  function confirmDelete() {
    if (confirming.current || request.current) {
      return;
    }
    confirming.current = true;
    Alert.alert('Ta bort recension', 'Vill du verkligen ta bort din recension?', [
      {
        text: 'Avbryt',
        style: 'cancel',
        onPress: () => {
          confirming.current = false;
        },
      },
      { text: 'Ta bort', style: 'destructive', onPress: removeReview },
    ], { cancelable: false });
  }

  return (
    <View style={styles.card}>
      {showMovieLink && (
        <Pressable
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={`Öppna ${movieTitle}`}
          onPress={() => navigation.navigate('MovieDetails', { movieId: review.movieId })}
        >
          <Text style={styles.title}>{movieTitle}</Text>
        </Pressable>
      )}
      <Text style={styles.rating}>Betyg: {review.rating} / 10</Text>
      <Text style={globalStyles.text}>{review.text}</Text>
      <Text style={styles.metadata}>
        {review.user?.username || 'Borttagen användare'} · {new Date(review.updatedAt).toLocaleDateString('sv-SE')}
      </Text>
      {isOwner && (
        <View style={styles.actions}>
          <Pressable
            style={styles.action}
            accessibilityRole="button"
            disabled={deleting}
            onPress={() => navigation.navigate('ReviewEditor', {
              movieId: review.movieId,
              movieTitle,
              review,
            })}
          >
            <Text style={styles.actionText}>Redigera</Text>
          </Pressable>
          <Pressable
            style={styles.action}
            accessibilityRole="button"
            disabled={deleting}
            onPress={confirmDelete}
          >
            <Text style={styles.actionText}>Ta bort</Text>
          </Pressable>
          {deleting && <ActivityIndicator color={colors.accent} accessibilityLabel="Tar bort recension" />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },

  title: {
    color: colors.primaryText,
    fontSize: fonts.sizes.cardTitle,
    fontWeight: fonts.weights.bold,
  },

  rating: {
    color: colors.accent,
    fontSize: fonts.sizes.normal,
    marginBottom: 8,
  },

  metadata: {
    color: colors.secondaryText,
    fontSize: fonts.sizes.caption,
    marginTop: 12,
  },

  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },

  action: {
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingRight: 24,
  },

  actionText: {
    color: colors.accent,
    fontSize: fonts.sizes.normal,
  },
});
