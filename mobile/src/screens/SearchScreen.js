import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { searchMovies } from '../services/api';
import MovieCard from '../components/MovieCard';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

export default function SearchScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Skiljer en tom söklista från att användaren ännu inte har sökt.
  const [hasSearched, setHasSearched] = useState(false);
  const request = useRef(null);

  useEffect(() => {
    // Stack-skärmar kan lämnas utan att avmonteras, så avbryt även vid blur.
    const unsubscribe = navigation.addListener('blur', () => {
      if (request.current) {
        request.current.abort();
        request.current = null;
        setLoading(false);
        setHasSearched(false);
      }
    });

    return () => {
      unsubscribe();
      request.current?.abort();
    };
  }, [navigation]);

  async function handleSearch() {
    // Ref-värdet ändras direkt och stoppar även två snabba tryck före nästa render.
    if (request.current) {
      return;
    }

    const searchQuery = query.trim();

    if (!searchQuery) {
      setError('Ange en filmtitel innan du söker.');
      setMovies([]);
      setHasSearched(false);
      return;
    }

    const controller = new AbortController();

    // Tömmer tidigare resultat så att de inte visas som svar på den nya sökningen.
    request.current = controller;
    setLoading(true);
    setError('');
    setMovies([]);
    setHasSearched(true);
    Keyboard.dismiss();

    try {
      const data = await searchMovies(searchQuery, 1, { signal: controller.signal });

      // Ett sent svar ska inte uppdatera en sökning som har avbrutits.
      if (!controller.signal.aborted) {
        setMovies(data.results);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error.message);
      }
    } finally {
      // Ett gammalt anrop får inte ändra statusen för ett nyare anrop.
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
  }

  let status = null;

  if (loading) {
    status = (
      <View style={styles.status}>
        <ActivityIndicator
          size="large"
          color={colors.accent}
          accessibilityLabel="Söker efter filmer"
        />
        <Text style={styles.message}>Söker efter filmer...</Text>
      </View>
    );
  } else if (error) {
    status = <Text style={styles.message}>{error}</Text>;
  } else if (!hasSearched) {
    status = <Text style={styles.message}>Skriv en filmtitel för att söka.</Text>;
  } else if (movies.length === 0) {
    status = <Text style={styles.message}>Inga filmer hittades.</Text>;
  }

  return (
    <KeyboardAvoidingView
      style={globalStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.form}>
        <Text style={globalStyles.title}>Sök filmer</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Filmtitel"
            placeholderTextColor={colors.secondaryText}
            accessibilityLabel="Filmtitel att söka efter"
            autoCorrect={false}
            autoCapitalize="none"
            editable={!loading}
          />
          <Pressable
            style={[styles.button, loading && styles.disabledButton]}
            onPress={handleSearch}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Sök filmer"
            accessibilityState={{
              disabled: loading,
              busy: loading
            }}
          >
            <Text style={styles.buttonText}>Sök</Text>
          </Pressable>
        </View>
      </View>
      <FlatList
        data={movies}
        keyExtractor={(movie) => String(movie.id)}
        renderItem={({ item }) => <MovieCard movie={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={status}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  form: {
    padding: 16,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },

  searchRow: {
    flexDirection: 'row'
  },

  input: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.card,
    color: colors.primaryText,
    fontSize: fonts.sizes.normal,
  },

  button: {
    marginLeft: 12,
    paddingHorizontal: 16,
    minHeight: 48,
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
    opacity: 0.5
  },

  list: {
    padding: 16,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },

  status: {
    alignItems: 'center'
  },

  message: {
    color: colors.secondaryText,
    fontSize: fonts.sizes.normal,
    lineHeight: 24,
    textAlign: 'center',
    marginVertical: 16,
  },
});
