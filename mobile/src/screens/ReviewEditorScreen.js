import { useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { createReview, updateReview, getMovieReviews, getReviewError } from '../services/api';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

const ratings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function ReviewEditorScreen({ route, navigation }) {
  const { movieId, movieTitle, review } = route.params || {};
  const { user, token, isAuthenticated, invalidateSession } = useContext(AuthContext);
  // Samma formulär används för nya recensioner och förifyllda egna recensioner.
  const [editingReview, setEditingReview] = useState(review || null);
  const [rating, setRating] = useState(review?.rating || 0);
  const [text, setText] = useState(review?.text || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);

  // Avbryter pågående sparning när användaren lämnar formuläret.
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      request.current?.abort();
      request.current = null;
      setSaving(false);
    });
    return () => {
      unsubscribe();
      request.current?.abort();
    };
  }, [navigation, token]);

  async function loadExistingReview(signal) {
    // Ett annat anrop kan redan ha skapat recensionen. Läs den och byt till redigering.
    try {
      const reviews = await getMovieReviews(movieId, { signal });
      if (signal.aborted) {
        return;
      }
      const existing = reviews.find(item => item.user?.id === user.id);
      if (!existing) {
        setError('Du har redan recenserat filmen. Gå tillbaka och ladda om recensionerna.');
        return;
      }
      setEditingReview(existing);
      setRating(existing.rating);
      setText(existing.text);
      setError('Du har redan recenserat filmen. Din recension har laddats för redigering.');
    } catch (error) {
      if (!signal.aborted) {
        setError(`Recensionen finns redan. Kunde inte hämta den: ${error.message}`);
      }
    }
  }

  async function handleSave() {
    // Stoppar dubbeltryck och ny sparning efter ett lyckat resultat.
    if (request.current || saved) {
      return;
    }
    if (!isAuthenticated || !token) {
      setError('Logga in för att skriva en recension.');
      return;
    }
    if (!Number.isSafeInteger(movieId) || movieId < 1) {
      setError('Film-ID saknas eller är ogiltigt.');
      return;
    }
    if (editingReview && editingReview.user?.id !== user.id) {
      setError('Du kan bara redigera dina egna recensioner.');
      return;
    }
    // Kontrollerar betyg och text innan något skickas till servern.
    const validationError = getReviewError(rating, text);
    if (validationError) {
      setError(validationError);
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setSaving(true);
    setError('');
    Keyboard.dismiss();

    try {
      // Ändrar en befintlig recension med PATCH eller skapar en ny med POST.
      if (editingReview) {
        await updateReview(token, editingReview.id, { rating, text }, { signal: controller.signal });
      } else {
        await createReview(token, { movieId, rating, text }, { signal: controller.signal });
      }
      if (!controller.signal.aborted) {
        setSaved(true);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (error.status === 401) {
        await invalidateSession(token);
      } else if (error.status === 409) {
        await loadExistingReview(controller.signal);
      } else {
        setError(error.message);
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) {
          setSaving(false);
        }
      }
    }
  }

  let title = 'Skriv recension';
  if (editingReview) {
    title = 'Redigera recension';
  }

  return (
    <KeyboardAvoidingView
      style={globalStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={globalStyles.title}>{title}</Text>
        <Text style={globalStyles.text}>{movieTitle || `Film ${movieId}`}</Text>
        {saved ? (
          <View>
            <Text style={styles.message} accessibilityLiveRegion="polite">
              Din recension har sparats.
            </Text>
            <Pressable
              style={styles.button}
              accessibilityRole="button"
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.buttonText}>Tillbaka</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <Text style={styles.message}>Välj betyg 1–10</Text>
            <View style={styles.ratings}>
              {ratings.map(value => (
                <Pressable
                  key={value}
                  style={[styles.ratingButton, rating === value && styles.selectedRating]}
                  accessibilityRole="button"
                  accessibilityLabel={`Betyg ${value} av 10`}
                  accessibilityState={{ selected: rating === value, disabled: saving }}
                  disabled={saving}
                  onPress={() => setRating(value)}
                >
                  <Text style={globalStyles.text}>{value}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              accessibilityLabel="Recensionstext"
              placeholder="Vad tyckte du om filmen?"
              placeholderTextColor={colors.secondaryText}
              multiline
              textAlignVertical="top"
              maxLength={2000}
              editable={!saving}
            />
            <Text style={globalStyles.text}>{text.length} / 2000 tecken</Text>
            {error !== '' && (
              <Text style={styles.message} accessibilityLiveRegion="polite">{error}</Text>
            )}
            {saving && <ActivityIndicator color={colors.accent} accessibilityLabel="Sparar recension" />}
            <Pressable
              style={[styles.button, saving && styles.disabledButton]}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving, busy: saving }}
              disabled={saving}
              onPress={handleSave}
            >
              <Text style={styles.buttonText}>Spara</Text>
            </Pressable>
            <Pressable
              style={styles.cancel}
              accessibilityRole="button"
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.cancelText}>Avbryt</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },

  message: {
    color: colors.secondaryText,
    fontSize: fonts.sizes.normal,
    lineHeight: 24,
    marginVertical: 16,
  },

  ratings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  ratingButton: {
    minWidth: 48,
    minHeight: 48,
    padding: 12,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },

  selectedRating: {
    borderColor: colors.accent,
    borderWidth: 2,
  },

  input: {
    minHeight: 140,
    padding: 12,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.card,
    color: colors.primaryText,
    fontSize: fonts.sizes.normal,
  },

  button: {
    minHeight: 48,
    padding: 12,
    marginTop: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonText: {
    color: colors.background,
    fontSize: fonts.sizes.normal,
    fontWeight: fonts.weights.bold,
  },

  disabledButton: {
    opacity: 0.5,
  },

  cancel: {
    minHeight: 48,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelText: {
    color: colors.accent,
    fontSize: fonts.sizes.normal,
  },
});
