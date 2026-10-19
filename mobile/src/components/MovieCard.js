import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

export default function MovieCard({ movie }) {
  const navigation = useNavigation();
  const [imageFailed, setImageFailed] = useState(false);
  // Backend skickar redan kontrollerade värden. Här väljer vi bara visningstext.
  const title = movie.title || 'Titel saknas';
  let year = 'År saknas';

  if (movie.release_date) {
    year = movie.release_date.slice(0, 4);
  }

  let rating = 'Betyg saknas';

  if (movie.vote_average !== null) {
    rating = `${movie.vote_average.toFixed(1).replace('.', ',')} / 10`;
  }

  let showPoster = Boolean(movie.poster_path);

  // Visar reservtext även om en angiven bild inte går att ladda.
  if (imageFailed) {
    showPoster = false;
  }

  let poster = (
    <View style={[styles.poster, styles.placeholder]}>
      <Text style={styles.placeholderText}>Affisch saknas</Text>
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

  // Skickar filmens ID så att detaljskärmen kan hämta rätt film.
  return (
    <Pressable
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`Visa filmdetaljer för ${title}`}
      onPress={() => navigation.navigate('MovieDetails', { movieId: movie.id })}
    >
      {poster}
      <View style={styles.info}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.year}>{year}</Text>
        <Text style={styles.rating}>TMDB-betyg: {rating}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: 12,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: colors.card
  },

  poster: {
    width: 88,
    height: 132,
    borderRadius: 6,
    backgroundColor: colors.border
  },

  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8
  },

  placeholderText: {
    color: colors.secondaryText,
    textAlign: 'center',
    fontSize: fonts.sizes.small
  },

  info: {
    flex: 1,
    justifyContent: 'center',
    marginLeft: 16
  },

  title: {
    color: colors.primaryText,
    fontSize: fonts.sizes.cardTitle,
    fontWeight: fonts.weights.bold,
    marginBottom: 8
  },

  year: {
    color: colors.secondaryText,
    fontSize: fonts.sizes.caption,
    marginBottom: 12
  },

  rating: {
    color: colors.accent,
    fontSize: fonts.sizes.caption
  },
});
