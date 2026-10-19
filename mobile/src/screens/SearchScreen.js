import { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { searchMovies, discoverMovies, getMovieGenres } from '../services/api';
import MovieCard from '../components/MovieCard';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

const ratingOptions = [
  { label: 'Alla betyg', value: null },
  { label: '5+', value: 5 },
  { label: '6+', value: 6 },
  { label: '7+', value: 7 },
  { label: '8+', value: 8 },
  { label: '9+', value: 9 },
];
const sortOptions = [
  { label: 'Populärast', value: 'popular' },
  { label: 'Högst betyg', value: 'rating' },
  { label: 'Nyaste', value: 'newest' },
  { label: 'Äldsta', value: 'oldest' },
];

// Tomt år är tillåtet. Annars krävs siffror och samma årsgränser som i backend.
function isValidYear(value) {
  if (value === '') {
    return true;
  }
  for (const character of value) {
    if (!'0123456789'.includes(character)) {
      return false;
    }
  }
  const year = Number(value);
  return Number.isInteger(year) && year >= 1888 && year <= new Date().getFullYear() + 5;
}

export default function SearchScreen({ navigation }) {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState('title');
  const [query, setQuery] = useState('');
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Skiljer en tom söklista från att användaren ännu inte har sökt.
  const [hasSearched, setHasSearched] = useState(false);
  const [genres, setGenres] = useState(null);
  const [genresLoading, setGenresLoading] = useState(false);
  const [genresError, setGenresError] = useState('');
  const [genresAttempt, setGenresAttempt] = useState(0);
  const [genre, setGenre] = useState(null);
  const [year, setYear] = useState('');
  const [minRating, setMinRating] = useState(null);
  const [sortBy, setSortBy] = useState('popular');
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterError, setFilterError] = useState('');
  // Panelens val sparas separat från filtren som används för filmerna.
  const [appliedFilters, setAppliedFilters] = useState({ year: '', minRating: null, sortBy: 'popular' });
  const request = useRef(null);
  const genreTimer = useRef(null);

  useEffect(() => {
    // Stack-skärmar kan lämnas utan att avmonteras, så avbryt även vid blur.
    const unsubscribe = navigation.addListener('blur', () => {
      setFilterVisible(false);
      if (request.current || genreTimer.current) {
        clearTimeout(genreTimer.current);
        genreTimer.current = null;
        request.current?.abort();
        request.current = null;
        setLoading(false);
        setHasSearched(false);
      }
    });

    return () => {
      unsubscribe();
      clearTimeout(genreTimer.current);
      request.current?.abort();
    };
  }, [navigation]);

  // Hämtar genrerna när Utforska öppnas och återanvänder dem på denna skärm.
  useEffect(() => {
    if (mode !== 'discover' || !isFocused || genres !== null) {
      return;
    }
    const controller = new AbortController();
    setGenresLoading(true);
    setGenresError('');

    async function loadGenres() {
      try {
        const data = await getMovieGenres({ signal: controller.signal });
        if (!controller.signal.aborted) {
          setGenres(data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setGenresError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setGenresLoading(false);
        }
      }
    }

    loadGenres();
    return () => controller.abort();
  }, [mode, isFocused, genres, genresAttempt]);

  function clearResults() {
    // Avbryter direkt så att gamla svar inte kan skriva över nästa sökning.
    clearTimeout(genreTimer.current);
    genreTimer.current = null;
    request.current?.abort();
    request.current = null;
    setMovies([]);
    setLoading(false);
    setError('');
    setHasSearched(false);
  }

  function changeMode(nextMode) {
    if (mode === nextMode) {
      return;
    }
    clearResults();
    setFilterVisible(false);
    setMode(nextMode);
    Keyboard.dismiss();
  }

  function resetFilters() {
    clearResults();
    setGenre(null);
    setYear('');
    setMinRating(null);
    setSortBy('popular');
    setAppliedFilters({ year: '', minRating: null, sortBy: 'popular' });
    setFilterError('');
  }

  // Öppnar panelen med de filter som senast tillämpades.
  function openFilters() {
    setYear(appliedFilters.year);
    setMinRating(appliedFilters.minRating);
    setSortBy(appliedFilters.sortBy);
    setFilterError('');
    setFilterVisible(true);
  }

  function closeFilters() {
    setFilterVisible(false);
    setFilterError('');
    Keyboard.dismiss();
  }

  function applyFilters() {
    if (request.current || genreTimer.current) {
      return;
    }
    if (!isValidYear(year)) {
      setFilterError(`Ange ett årtal mellan 1888 och ${new Date().getFullYear() + 5}.`);
      return;
    }
    const filters = { year, minRating, sortBy };
    setAppliedFilters(filters);
    closeFilters();
    clearResults();
    handleSearch(filters);
  }

  function changeGenre(nextGenre) {
    if (nextGenre === genre && hasSearched) {
      return;
    }
    clearResults();
    setGenre(nextGenre);
    Keyboard.dismiss();
    setLoading(true);
    setHasSearched(true);
    // Väntar kort så att snabba genrebyten bara hämtar det sista valet.
    genreTimer.current = setTimeout(() => {
      genreTimer.current = null;
      handleSearch(appliedFilters, nextGenre);
    }, 300);
  }

  async function handleSearch(selectedFilters = appliedFilters, selectedGenre = genre) {
    // Ref-värdet ändras direkt och stoppar även två snabba tryck före nästa render.
    if (request.current) {
      return;
    }
    const searchQuery = query.trim();
    if (mode === 'title' && !searchQuery) {
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
    if (mode === 'title') {
      Keyboard.dismiss();
    }

    try {
      let data;
      if (mode === 'title') {
        data = await searchMovies(searchQuery, 1, { signal: controller.signal });
      } else {
        const filters = { sortBy: selectedFilters.sortBy };
        if (selectedGenre !== null) {
          filters.genre = selectedGenre;
        }
        if (selectedFilters.year !== '') {
          filters.year = Number(selectedFilters.year);
        }
        if (selectedFilters.minRating !== null) {
          filters.minRating = selectedFilters.minRating;
        }
        data = await discoverMovies(filters, { signal: controller.signal });
      }
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
        <ActivityIndicator size="large" color={colors.accent} accessibilityLabel="Söker efter filmer" />
        <Text style={styles.message}>Söker efter filmer...</Text>
      </View>
    );
  } else if (error) {
    status = (
      <View>
        <Text style={styles.message} accessibilityLiveRegion="polite">{error}</Text>
        {hasSearched && (
          <Pressable style={styles.option} accessibilityRole="button" onPress={() => handleSearch()}>
            <Text style={styles.optionText}>Försök igen</Text>
          </Pressable>
        )}
      </View>
    );
  } else if (!hasSearched) {
    let message = 'Skriv en filmtitel för att söka.';
    if (mode === 'discover') {
      message = 'Välj en genre eller öppna Filter för att hitta filmer.';
    }
    status = <Text style={styles.message}>{message}</Text>;
  } else if (movies.length === 0) {
    let message = 'Inga filmer hittades.';
    if (mode === 'discover') {
      message = 'Inga filmer matchar filtren.';
    }
    status = <Text style={styles.message}>{message}</Text>;
  }

  const form = (
    <View style={styles.form}>
      <Text style={globalStyles.title}>Sök filmer</Text>
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.option, styles.modeButton, mode === 'title' && styles.selectedOption]}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'title' }}
          onPress={() => changeMode('title')}
        >
          <Text style={[styles.optionText, mode === 'title' && styles.selectedText]}>Sök titel</Text>
        </Pressable>
        <Pressable
          style={[styles.option, styles.modeButton, mode === 'discover' && styles.selectedOption]}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'discover' }}
          onPress={() => changeMode('discover')}
        >
          <Text style={[styles.optionText, mode === 'discover' && styles.selectedText]}>Utforska filmer</Text>
        </Pressable>
      </View>
      {mode === 'title' ? (
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
            onPress={() => handleSearch()}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Sök filmer"
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            <Text style={styles.buttonText}>Sök</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <Text style={styles.label}>Genre</Text>
          {genresLoading && (
            <ActivityIndicator color={colors.accent} accessibilityLabel="Hämtar genrer" />
          )}
          {genresError !== '' && (
            <View>
              <Text style={styles.message} accessibilityLiveRegion="polite">{genresError}</Text>
              <Pressable
                style={styles.option}
                accessibilityRole="button"
                onPress={() => setGenresAttempt(current => current + 1)}
              >
                <Text style={styles.optionText}>Försök hämta genrer igen</Text>
              </Pressable>
            </View>
          )}
          {genres?.length === 0 && <Text style={styles.message}>Inga genrer finns tillgängliga.</Text>}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.genreRow}
            keyboardShouldPersistTaps="handled"
            accessibilityLabel="Filmgenrer"
          >
            <Pressable
              style={[styles.option, styles.genreButton, genre === null && styles.selectedOption]}
              accessibilityRole="button"
              accessibilityLabel="Genre: Alla"
              accessibilityState={{ selected: genre === null }}
              onPress={() => changeGenre(null)}
            >
              <Text style={[styles.optionText, genre === null && styles.selectedText]}>Alla</Text>
            </Pressable>
            {(genres || []).map(item => (
              <Pressable
                key={item.id}
                style={[styles.option, styles.genreButton, genre === item.id && styles.selectedOption]}
                accessibilityRole="button"
                accessibilityLabel={`Genre: ${item.name}`}
                accessibilityState={{ selected: genre === item.id }}
                onPress={() => changeGenre(item.id)}
              >
                <Text style={[styles.optionText, genre === item.id && styles.selectedText]}>{item.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.resultsRow}>
            <Text style={styles.resultsTitle}>Filmer</Text>
            <Pressable
              style={styles.filterButton}
              accessibilityRole="button"
              accessibilityLabel="Öppna filter"
              accessibilityState={{ expanded: filterVisible }}
              onPress={openFilters}
            >
              <View style={styles.filterIcon} accessible={false} importantForAccessibility="no-hide-descendants">
                {[3, 11, 6].map(left => (
                  <View key={left} style={styles.iconLine}>
                    <View style={[styles.iconKnob, { left }]} />
                  </View>
                ))}
              </View>
              <Text style={styles.optionText}>Filter</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={globalStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        data={movies}
        keyExtractor={(movie) => String(movie.id)}
        renderItem={({ item }) => <MovieCard movie={item} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={form}
        ListEmptyComponent={status}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
      {filterVisible && (
        <Modal
          transparent
          animationType="slide"
          onRequestClose={closeFilters}
        >
          <KeyboardAvoidingView
            style={[styles.modalArea, {
              paddingTop: insets.top,
              paddingLeft: insets.left,
              paddingRight: insets.right,
            }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.sheetHeader}>
                <Text style={styles.resultsTitle}>Filter</Text>
                <Pressable
                  style={styles.closeButton}
                  accessibilityRole="button"
                  accessibilityLabel="Stäng filter"
                  onPress={closeFilters}
                >
                  <Text style={styles.optionText}>Stäng</Text>
                </Pressable>
              </View>
              <ScrollView
                style={styles.filterScroll}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                <Text style={styles.label}>Utgivningsår (frivilligt)</Text>
                <TextInput
                  style={[styles.input, styles.yearInput]}
                  value={year}
                  onChangeText={value => {
                    setFilterError('');
                    setYear(value);
                  }}
                  placeholder="Till exempel 2020"
                  placeholderTextColor={colors.secondaryText}
                  keyboardType="number-pad"
                  accessibilityLabel="Utgivningsår"
                />
                <Text style={styles.label}>Lägsta TMDB-betyg</Text>
                <View style={styles.options}>
                  {ratingOptions.map(item => (
                    <Pressable
                      key={item.label}
                      style={[styles.option, minRating === item.value && styles.selectedOption]}
                      accessibilityRole="button"
                      accessibilityLabel={`Lägsta betyg: ${item.label}`}
                      accessibilityState={{ selected: minRating === item.value }}
                      onPress={() => {
                        setFilterError('');
                        setMinRating(item.value);
                      }}
                    >
                      <Text style={[styles.optionText, minRating === item.value && styles.selectedText]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.label}>Sortering</Text>
                <View style={styles.options}>
                  {sortOptions.map(item => (
                    <Pressable
                      key={item.value}
                      style={[styles.option, sortBy === item.value && styles.selectedOption]}
                      accessibilityRole="button"
                      accessibilityLabel={`Sortering: ${item.label}`}
                      accessibilityState={{ selected: sortBy === item.value }}
                      onPress={() => {
                        setFilterError('');
                        setSortBy(item.value);
                      }}
                    >
                      <Text style={[styles.optionText, sortBy === item.value && styles.selectedText]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {filterError !== '' && (
                  <Text style={styles.message} accessibilityLiveRegion="polite">{filterError}</Text>
                )}
              </ScrollView>
              <View style={styles.panelActions}>
                <Pressable style={styles.option} accessibilityRole="button" onPress={resetFilters}>
                  <Text style={styles.optionText}>Rensa filter</Text>
                </Pressable>
                <Pressable
                  style={[styles.button, styles.actionButton, loading && styles.disabledButton]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: loading, busy: loading }}
                  disabled={loading}
                  onPress={applyFilters}
                >
                  <Text style={styles.buttonText}>Visa filmer</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row',
    columnGap: 8,
  },

  modeButton: {
    flex: 1,
    marginRight: 0,
    paddingHorizontal: 8,
  },

  genreRow: {
    paddingVertical: 4,
  },

  genreButton: {
    height: 48,
    flexShrink: 0,
    marginBottom: 0,
    borderRadius: 24,
    paddingHorizontal: 16,
  },

  resultsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },

  resultsTitle: {
    color: colors.primaryText,
    fontSize: fonts.sizes.cardTitle,
    fontWeight: fonts.weights.bold,
  },

  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
  },

  filterIcon: {
    width: 20,
  },

  iconLine: {
    height: 2,
    marginVertical: 3,
    borderRadius: 1,
    backgroundColor: colors.primaryText,
  },

  iconKnob: {
    position: 'absolute',
    top: -2,
    width: 6,
    height: 6,
    borderWidth: 1,
    borderColor: colors.primaryText,
    borderRadius: 3,
    backgroundColor: colors.card,
  },

  modalArea: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: `${colors.background}B3`,
  },

  sheet: {
    maxHeight: '90%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
  },

  closeButton: {
    minHeight: 48,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  filterScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },

  panelActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  form: {
    paddingBottom: 16,
  },

  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  option: {
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

  selectedOption: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },

  optionText: {
    color: colors.primaryText,
    fontSize: fonts.sizes.normal,
  },

  selectedText: {
    color: colors.background,
  },

  label: {
    color: colors.primaryText,
    fontSize: fonts.sizes.normal,
    fontWeight: fonts.weights.bold,
    marginTop: 12,
    marginBottom: 8,
  },

  searchRow: {
    flexDirection: 'row',
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

  yearInput: {
    flex: 0,
    paddingVertical: 12,
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

  actionButton: {
    marginLeft: 0,
    marginRight: 8,
    marginBottom: 8,
  },

  buttonText: {
    color: colors.background,
    fontSize: fonts.sizes.normal,
    fontWeight: fonts.weights.bold,
  },

  disabledButton: {
    opacity: 0.5,
  },

  list: {
    padding: 16,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },

  status: {
    alignItems: 'center',
  },

  message: {
    color: colors.secondaryText,
    fontSize: fonts.sizes.normal,
    lineHeight: 24,
    textAlign: 'center',
    marginVertical: 16,
  },
});
