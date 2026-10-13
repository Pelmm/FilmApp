import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

export default function MovieCard({ movie }) {
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

  return (
    <View style={styles.card}>
      {poster}
      <View style={styles.info}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.year}>{year}</Text>
        <Text style={styles.rating}>TMDB-betyg: {rating}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', padding: 12, marginBottom: 12, borderRadius: 12, backgroundColor: '#172033' },
  poster: { width: 88, height: 132, borderRadius: 6, backgroundColor: '#263249' },
  placeholder: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  placeholderText: { color: '#c0cadb', textAlign: 'center', fontSize: 12 },
  info: { flex: 1, justifyContent: 'center', marginLeft: 16 },
  title: { color: '#f5f7fb', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  year: { color: '#c0cadb', fontSize: 14, marginBottom: 12 },
  rating: { color: '#f5c563', fontSize: 14 },
});
