import { StyleSheet, Text, View } from 'react-native';

export default function MovieDetailsScreen({ route }) {
  // Framtida navigation: navigate('MovieDetails', { movieId: filmensId }).
  const movieId = route.params?.movieId;
  let movieIdInfo = null;
  if (movieId !== undefined) {
    movieIdInfo = <Text style={styles.message}>Film-ID: {movieId}</Text>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Filmdetaljer</Text>
      <Text style={styles.message}>Här kommer filminformation och recensioner att visas.</Text>
      {movieIdInfo}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1020', padding: 24, justifyContent: 'center' },
  title: { color: '#f5f7fb', fontSize: 26, fontWeight: 'bold', marginBottom: 16 },
  message: { color: '#c0cadb', fontSize: 16, lineHeight: 24 },
});
